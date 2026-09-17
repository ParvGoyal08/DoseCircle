import { TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { DEFAULT_SLOT_TIMES, keys, type LanguageCode } from "@dosecircle/shared";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { z } from "zod";
import { ddb } from "../../lib/aws.js";
import { normaliseInviteCode, sha256Hex } from "../../lib/crypto.js";
import { env } from "../../lib/env.js";
import { HttpError, json, parseBody, principalFrom } from "../../lib/http.js";
import { newId } from "../../lib/ids.js";
import type { FamilyItem, InviteItem, MemberItem, ParentItem } from "../../lib/model.js";
import { get, listParents, membershipsForUser } from "../../lib/repository.js";
import { DisplayNameSchema, LanguageSchema } from "../../lib/schemas.js";

function jwtSub(event: APIGatewayProxyEventV2): string {
  const sub = (event.requestContext as unknown as { authorizer?: { jwt?: { claims?: Record<string, string> } } }).authorizer?.jwt?.claims?.sub;
  if (!sub) throw new HttpError(401, "Sign in first");
  return sub;
}

function isTransactionConflict(error: unknown): boolean {
  const reasons = (error as { CancellationReasons?: { Code?: string }[] }).CancellationReasons ?? [];
  return (error as { name?: string }).name === "TransactionCanceledException" && reasons.some((r) => r.Code === "ConditionalCheckFailed");
}

/** GET /me — who am I, and which family (if any). */
export async function getMe(event: APIGatewayProxyEventV2) {
  const sub = jwtSub(event);
  const [membership] = await membershipsForUser(sub);
  if (!membership) return json(200, { member: null });
  return json(200, {
    member: { mid: membership.mid, fid: membership.fid, displayName: membership.displayName, relation: membership.relation ?? null, role: membership.role, lang: membership.lang },
  });
}

const CreateFamilySchema = z.object({
  familyName: z.string().trim().min(1).max(60),
  me: z.object({ displayName: DisplayNameSchema, relation: z.string().trim().max(30).optional(), lang: LanguageSchema }),
  parent: z.object({ displayName: DisplayNameSchema, lang: LanguageSchema }),
});

/** POST /families — the creator becomes the owner and the first person in the escalation order. */
export async function createFamily(event: APIGatewayProxyEventV2) {
  const sub = jwtSub(event);
  const body = parseBody(event, CreateFamilySchema);
  const fid = newId("fam");
  const mid = newId("m");
  const pid = newId("p");
  const now = new Date().toISOString();

  const family: FamilyItem = { ...keys.family(fid), fid, name: body.familyName, ownerSub: sub, createdAt: now };
  const member: MemberItem = {
    ...keys.member(fid, mid),
    GSI1PK: `USER#${sub}`,
    GSI1SK: `FAM#${fid}`,
    fid,
    mid,
    sub,
    displayName: body.me.displayName,
    relation: body.me.relation,
    role: "owner",
    lang: body.me.lang as LanguageCode,
  };
  const parent: ParentItem = {
    ...keys.parent(fid, pid),
    fid,
    pid,
    displayName: body.parent.displayName,
    lang: body.parent.lang as LanguageCode,
    ladder: [mid],
    consecutiveMisses: 0,
    paused: false,
    slotTimes: { ...DEFAULT_SLOT_TIMES },
  };

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          // One family per person in this build: the lock item makes that atomic.
          { Put: { TableName: env.tableName, Item: { PK: `USER#${sub}`, SK: "FAMILY", fid }, ConditionExpression: "attribute_not_exists(PK)" } },
          { Put: { TableName: env.tableName, Item: family, ConditionExpression: "attribute_not_exists(PK)" } },
          { Put: { TableName: env.tableName, Item: member } },
          { Put: { TableName: env.tableName, Item: parent } },
        ],
      }),
    );
  } catch (error) {
    if (isTransactionConflict(error)) throw new HttpError(409, "You already belong to a family");
    throw error;
  }
  return json(201, { fid, mid, pid });
}

const AcceptInviteSchema = z.object({
  code: z.string().min(6).max(20),
  displayName: DisplayNameSchema,
  relation: z.string().trim().max(30).optional(),
  lang: LanguageSchema,
});

/** POST /invites/accept — a new family member joins and goes to the end of every parent's escalation order. */
export async function acceptInvite(event: APIGatewayProxyEventV2) {
  const sub = jwtSub(event);
  const body = parseBody(event, AcceptInviteSchema);
  const inviteKey = keys.invite(sha256Hex(normaliseInviteCode(body.code)));
  const invite = await get<InviteItem>(inviteKey, true);
  if (!invite || invite.kind !== "member" || invite.consumedAt) throw new HttpError(404, "This invite code is not valid any more");

  const mid = newId("m");
  const member: MemberItem = {
    ...keys.member(invite.fid, mid),
    GSI1PK: `USER#${sub}`,
    GSI1SK: `FAM#${invite.fid}`,
    fid: invite.fid,
    mid,
    sub,
    displayName: body.displayName,
    relation: body.relation,
    role: "member",
    lang: body.lang as LanguageCode,
  };
  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.tableName,
              Key: inviteKey,
              UpdateExpression: "SET consumedAt = :now, consumedBy = :sub",
              ConditionExpression: "attribute_exists(PK) AND attribute_not_exists(consumedAt)",
              ExpressionAttributeValues: { ":now": new Date().toISOString(), ":sub": sub },
            },
          },
          { Put: { TableName: env.tableName, Item: { PK: `USER#${sub}`, SK: "FAMILY", fid: invite.fid }, ConditionExpression: "attribute_not_exists(PK)" } },
          { Put: { TableName: env.tableName, Item: member } },
        ],
      }),
    );
  } catch (error) {
    if (isTransactionConflict(error)) throw new HttpError(409, "This invite was already used, or you already belong to a family");
    throw error;
  }

  for (const parent of await listParents(invite.fid)) {
    await ddb.send(
      new UpdateCommand({
        TableName: env.tableName,
        Key: keys.parent(invite.fid, parent.pid),
        UpdateExpression: "SET ladder = list_append(ladder, :mid)",
        ExpressionAttributeValues: { ":mid": [mid] },
      }),
    );
  }
  return json(201, { fid: invite.fid, mid });
}

const LangSchema = z.object({ lang: LanguageSchema });

/** PUT /me/lang — each person chooses their own language. */
export async function setMyLanguage(event: APIGatewayProxyEventV2) {
  const principal = await principalFrom(event);
  if (principal.kind !== "member") throw new HttpError(403, "Only family members can do this");
  const { lang } = parseBody(event, LangSchema);
  await ddb.send(
    new UpdateCommand({
      TableName: env.tableName,
      Key: keys.member(principal.fid, principal.mid),
      UpdateExpression: "SET lang = :lang",
      ExpressionAttributeValues: { ":lang": lang },
    }),
  );
  return json(200, { lang });
}
