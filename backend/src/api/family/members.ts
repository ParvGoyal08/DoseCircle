import { DeleteCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { keys } from "@dosecircle/shared";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { z } from "zod";
import { authorize } from "../../authz/avp.js";
import { familyEntity } from "../../authz/entities.js";
import { memberPrincipal } from "../../authz/principal-entity.js";
import { ddb } from "../../lib/aws.js";
import { env } from "../../lib/env.js";
import { HttpError, json, parseBody, pathParam, principalFrom } from "../../lib/http.js";
import type { MemberItem, ParentItem } from "../../lib/model.js";
import { deleteFamilyData } from "../../lib/purge.js";
import { listMembers, listParents } from "../../lib/repository.js";
import { DisplayNameSchema } from "../../lib/schemas.js";

/**
 * Who is in the family. A family always keeps at least one owner and at least one person in every
 * parent's escalation order, because a parent with nobody to alert is worse than no app at all.
 */

function toView(member: MemberItem) {
  return {
    mid: member.mid,
    displayName: member.displayName,
    relation: member.relation ?? null,
    role: member.role,
    lang: member.lang,
    /** Whether this person has actually signed in yet. */
    joined: Boolean(member.sub),
  };
}

/** GET /families/{fid}/members — with each person's place in every parent's escalation order. */
export async function listFamilyMembers(event: APIGatewayProxyEventV2) {
  const fid = pathParam(event, "fid");
  const { entity } = await memberPrincipal(await principalFrom(event));
  await authorize({ principal: entity, action: "ViewFamily", resource: familyEntity(fid), entities: [] });
  const [members, parents] = await Promise.all([listMembers(fid), listParents(fid)]);
  return json(200, {
    members: members.map((m) => ({
      ...toView(m),
      ladderPositions: parents.filter((p) => p.ladder.includes(m.mid)).map((p) => ({ pid: p.pid, position: p.ladder.indexOf(m.mid) + 1 })),
    })),
  });
}

async function removableMember(fid: string, mid: string): Promise<{ member: MemberItem; members: MemberItem[]; parents: ParentItem[] }> {
  const [members, parents] = await Promise.all([listMembers(fid), listParents(fid)]);
  const member = members.find((m) => m.mid === mid);
  if (!member) throw new HttpError(404, "That person is not in this family");
  if (members.length === 1) throw new HttpError(409, "The last person in a family cannot be removed. Delete the family instead.");
  if (member.role === "owner" && members.filter((m) => m.role === "owner").length === 1) {
    throw new HttpError(409, "Make someone else an owner first");
  }
  // A parent whose escalation order would be emptied has nobody left to alert.
  const emptied = parents.filter((p) => p.ladder.length > 0 && p.ladder.every((id) => id === mid));
  if (emptied.length > 0) throw new HttpError(409, "Add someone else to the alert order first, so there is still somebody to tell");
  return { member, members, parents };
}

/** Everything belonging to one member: the membership, their push subscriptions and their one-family lock. */
async function deleteMemberRecords(fid: string, member: MemberItem, parents: ParentItem[]): Promise<void> {
  for (const parent of parents) {
    if (!parent.ladder.includes(member.mid)) continue;
    await ddb.send(
      new UpdateCommand({
        TableName: env.tableName,
        Key: keys.parent(fid, parent.pid),
        UpdateExpression: "SET ladder = :ladder",
        ExpressionAttributeValues: { ":ladder": parent.ladder.filter((id) => id !== member.mid) },
      }),
    );
  }

  // Their browsers must stop receiving this family's alerts immediately.
  const subscriptions = await ddb.send(
    new QueryCommand({ TableName: env.tableName, KeyConditionExpression: "PK = :pk", ExpressionAttributeValues: { ":pk": `SUBJ#${member.mid}` } }),
  );
  for (const item of subscriptions.Items ?? []) {
    await ddb.send(new DeleteCommand({ TableName: env.tableName, Key: { PK: item.PK, SK: item.SK } }));
  }

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        { Delete: { TableName: env.tableName, Key: keys.member(fid, member.mid) } },
        // Releasing the lock lets them join or start another family.
        ...(member.sub ? [{ Delete: { TableName: env.tableName, Key: { PK: `USER#${member.sub}`, SK: "FAMILY" } } }] : []),
      ],
    }),
  );
}

/** DELETE /families/{fid}/members/{mid} — owners only. */
export async function removeMember(event: APIGatewayProxyEventV2) {
  const fid = pathParam(event, "fid");
  const mid = pathParam(event, "mid");
  const { entity, member: caller } = await memberPrincipal(await principalFrom(event));
  await authorize({ principal: entity, action: "ManageMembers", resource: familyEntity(fid), entities: [] });
  if (caller.mid === mid) throw new HttpError(400, "Use leave instead of removing yourself");

  const { member, parents } = await removableMember(fid, mid);
  await deleteMemberRecords(fid, member, parents);
  return json(200, { mid, removed: true });
}

const RoleSchema = z.object({ role: z.enum(["owner", "member"]).optional(), displayName: DisplayNameSchema.optional(), relation: z.string().trim().max(30).optional() }).refine(
  (b) => Object.values(b).some((v) => v !== undefined),
  "Nothing to update",
);

/** PATCH /families/{fid}/members/{mid} — make someone an owner, or correct their name. */
export async function updateMember(event: APIGatewayProxyEventV2) {
  const fid = pathParam(event, "fid");
  const mid = pathParam(event, "mid");
  const body = parseBody(event, RoleSchema);
  const { entity } = await memberPrincipal(await principalFrom(event));
  await authorize({ principal: entity, action: "ManageMembers", resource: familyEntity(fid), entities: [] });

  const members = await listMembers(fid);
  const member = members.find((m) => m.mid === mid);
  if (!member) throw new HttpError(404, "That person is not in this family");
  if (body.role === "member" && member.role === "owner" && members.filter((m) => m.role === "owner").length === 1) {
    throw new HttpError(409, "A family needs at least one owner");
  }

  const fields = Object.entries(body).filter(([, value]) => value !== undefined);
  await ddb.send(
    new UpdateCommand({
      TableName: env.tableName,
      Key: keys.member(fid, mid),
      UpdateExpression: `SET ${fields.map(([field]) => `#${field} = :${field}`).join(", ")}`,
      ConditionExpression: "attribute_exists(PK)",
      ExpressionAttributeNames: Object.fromEntries(fields.map(([field]) => [`#${field}`, field])),
      ExpressionAttributeValues: Object.fromEntries(fields.map(([field, value]) => [`:${field}`, value])),
    }),
  );
  return json(200, { member: toView({ ...member, ...body } as MemberItem) });
}

/** POST /families/{fid}/leave — anybody can walk away from a family they are in. */
export async function leaveFamily(event: APIGatewayProxyEventV2) {
  const fid = pathParam(event, "fid");
  const { entity, member: caller } = await memberPrincipal(await principalFrom(event));
  await authorize({ principal: entity, action: "LeaveFamily", resource: familyEntity(fid), entities: [] });
  const { member, parents } = await removableMember(fid, caller.mid);
  await deleteMemberRecords(fid, member, parents);
  return json(200, { left: true });
}

const DeleteFamilySchema = z.object({ confirmName: z.string().trim().min(1).max(60) });

/**
 * DELETE /families/{fid} — removes the family, its parents, medicines, checks, readings, doses,
 * schedules and paired phones. Typing the family's name is required, because none of it comes back.
 */
export async function deleteFamily(event: APIGatewayProxyEventV2) {
  const fid = pathParam(event, "fid");
  const { confirmName } = parseBody(event, DeleteFamilySchema);
  const { entity } = await memberPrincipal(await principalFrom(event));
  await authorize({ principal: entity, action: "DeleteFamily", resource: familyEntity(fid), entities: [] });

  const family = await ddb.send(new QueryCommand({ TableName: env.tableName, KeyConditionExpression: "PK = :pk", ExpressionAttributeValues: { ":pk": `FAM#${fid}` } }));
  const meta = (family.Items ?? []).find((item) => item.SK === "META");
  if (!meta) throw new HttpError(404, "Family not found");
  if (String(meta.name).trim() !== confirmName) throw new HttpError(400, "The name does not match");

  const counts = await deleteFamilyData(fid);
  return json(200, { deleted: true, ...counts });
}
