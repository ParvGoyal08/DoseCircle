import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { keys } from "@dosecircle/shared";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { z } from "zod";
import { authorize } from "../../authz/avp.js";
import { familyEntity, parentEntity, prescriptionEntity } from "../../authz/entities.js";
import { memberPrincipal } from "../../authz/principal-entity.js";
import { ddb, isExpired, metrics, ttlInDays } from "../../lib/aws.js";
import { env, requireEnv } from "../../lib/env.js";
import { HttpError, json, parseBody, pathParam, principalFrom } from "../../lib/http.js";
import { newId } from "../../lib/ids.js";
import type { PrescriptionItem, PrescriptionRow } from "../../lib/model.js";
import { notifyPrescription } from "../../lib/notify-prescription.js";
import { takeFromBudget } from "../../lib/rate-limit.js";
import { get, getParent } from "../../lib/repository.js";
import { MedicineInputSchema } from "../../lib/schemas.js";
import { istDate } from "../../scheduling/plan.js";
import { createMedicines } from "./medicines.js";

// Presigning is local, but a stale socket on the HeadObject/GetObject calls must not hang.
const s3 = new S3Client({ maxAttempts: 4, requestHandler: { connectionTimeout: 1_000, requestTimeout: 10_000 } });

/** Textract accepts up to 10 MB; the app sends a 2400px JPEG. */
export const MAX_ORIGINAL_BYTES = 5 * 1024 * 1024;
/** Bedrock Converse accepts images up to 3.75 MB; the app sends a 1568px JPEG. */
export const MAX_MODEL_BYTES = 3.75 * 1024 * 1024;
const MAX_PER_FAMILY_PER_DAY = 10;
const UPLOAD_SECONDS = 300;

const objectKey = (fid: string, rxId: string, variant: "original" | "model") => `rx/${fid}/${rxId}/${variant}.jpg`;

const CreateSchema = z.object({
  pid: z.string().min(1).max(40),
  /** The member saw and accepted: "The photo is read by AI. It may be processed outside India." */
  consent: z.literal(true),
});

/** POST /families/{fid}/prescriptions — two short-lived, image-only upload slots. */
export async function createPrescription(event: APIGatewayProxyEventV2) {
  const fid = pathParam(event, "fid");
  const { pid } = parseBody(event, CreateSchema);
  const { entity, member } = await memberPrincipal(await principalFrom(event));
  await authorize({ principal: entity, action: "UploadPrescription", resource: familyEntity(fid), entities: [] });
  return json(201, await startPrescription(fid, pid, member.mid));
}

/**
 * The upload itself, shared by the family's route and the parent's own phone. Both produce the same
 * draft, and in both cases a family member still has to tick every line before anything is saved.
 */
export async function startPrescription(fid: string, pid: string, createdBy: string) {
  if (!(await getParent(fid, pid))) throw new HttpError(404, "Parent not found");
  if (!(await takeFromBudget(`rx#${fid}#${istDate()}`, MAX_PER_FAMILY_PER_DAY, 86_400))) {
    throw new HttpError(429, "That is a lot of prescriptions for one day. Please add medicines by hand, or try tomorrow.");
  }

  const rxId = newId("rx");
  const now = new Date().toISOString();
  const item: PrescriptionItem = {
    ...keys.prescription(fid, rxId),
    rxId,
    fid,
    pid,
    status: "AWAITING_UPLOAD",
    createdBy,
    createdAt: now,
    consentAt: now,
    ttl: ttlInDays(7),
  };
  await ddb.send(new PutCommand({ TableName: env.tableName, Item: item }));

  const bucket = requireEnv("PRESCRIPTIONS_BUCKET");
  const slot = (variant: "original" | "model", maxBytes: number) =>
    createPresignedPost(s3, {
      Bucket: bucket,
      Key: objectKey(fid, rxId, variant),
      Conditions: [
        ["content-length-range", 1, maxBytes],
        ["eq", "$Content-Type", "image/jpeg"],
      ],
      Fields: { "Content-Type": "image/jpeg" },
      Expires: UPLOAD_SECONDS,
    });
  const [model, original] = await Promise.all([slot("model", MAX_MODEL_BYTES), slot("original", MAX_ORIGINAL_BYTES)]);
  metrics.addMetric("PrescriptionsStarted", "Count", 1);
  // Upload model.jpg first: the extractor starts when original.jpg arrives.
  return { rxId, uploads: { model, original }, uploadOrder: ["model", "original"] as const, expiresInSeconds: UPLOAD_SECONDS };
}

async function authorizedPrescription(event: APIGatewayProxyEventV2): Promise<{ rx: PrescriptionItem; mid: string }> {
  const fid = pathParam(event, "fid");
  const rx = await get<PrescriptionItem>(keys.prescription(fid, pathParam(event, "rxId")), true);
  if (!rx) throw new HttpError(404, "Prescription not found");
  const { entity, member } = await memberPrincipal(await principalFrom(event));
  await authorize({ principal: entity, action: "ReviewPrescription", resource: prescriptionEntity(rx), entities: [familyEntity(rx.fid)] });
  return { rx, mid: member.mid };
}

/**
 * GET /families/{fid}/parents/{pid}/prescriptions — prescriptions still waiting for someone to check.
 *
 * A parent can photograph their own prescription, and the family is sent a notification to review
 * it. That notification was the only way in: miss it and the photo sat unread until it expired. The
 * Medicines page lists these now.
 */
export async function listPendingPrescriptions(event: APIGatewayProxyEventV2) {
  const fid = pathParam(event, "fid");
  const pid = pathParam(event, "pid");
  const parent = await getParent(fid, pid);
  if (!parent) throw new HttpError(404, "Not found");
  const { entity } = await memberPrincipal(await principalFrom(event));
  await authorize({ principal: entity, action: "ManageMedicines", resource: parentEntity(parent), entities: [familyEntity(fid)] });
  const result = await ddb.send(
    new QueryCommand({ TableName: env.tableName, KeyConditionExpression: "PK = :pk AND begins_with(SK, :rx)", ExpressionAttributeValues: { ":pk": `FAM#${fid}`, ":rx": "RX#" } }),
  );
  const pending = ((result.Items ?? []) as PrescriptionItem[])
    .filter((rx) => rx.pid === pid && (rx.status === "READY" || rx.status === "EXTRACTING") && !isExpired(rx))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return json(200, { prescriptions: pending.map((rx) => ({ rxId: rx.rxId, status: rx.status, createdAt: rx.createdAt })) });
}

/** GET /families/{fid}/prescriptions/{rxId} — polled while reading, then drives the review screen. */
export async function getPrescription(event: APIGatewayProxyEventV2) {
  const { rx } = await authorizedPrescription(event);
  const imageUrl =
    rx.status === "READY" || rx.status === "FAILED"
      ? await getSignedUrl(s3, new GetObjectCommand({ Bucket: requireEnv("PRESCRIPTIONS_BUCKET"), Key: objectKey(rx.fid, rx.rxId, "model") }), { expiresIn: UPLOAD_SECONDS }).catch(() => null)
      : null;
  return json(200, {
    rxId: rx.rxId,
    pid: rx.pid,
    status: rx.status,
    failure: rx.failure ?? null,
    imageUrl,
    lines: rx.lines ?? [],
    rows: rx.rows ?? [],
    guardrailInterventions: rx.guardrailInterventions ?? 0,
    medIds: rx.medIds ?? [],
  });
}

const DecisionSchema = z.discriminatedUnion("action", [
  z.object({
    rowId: z.string(),
    action: z.literal("confirm"),
    /** The person ticked "I checked this against the prescription". */
    checked: z.literal(true),
    medicine: MedicineInputSchema,
  }),
  z.object({ rowId: z.string(), action: z.literal("remove") }),
]);
const ConfirmSchema = z.object({ decisions: z.array(DecisionSchema).min(1).max(20) });
export type ConfirmDecision = z.infer<typeof DecisionSchema>;

/**
 * The server re-checks what the review screen enforces: a decision for every row, exactly once,
 * each confirmed row explicitly checked. Returns the medicines to save.
 */
export function checkDecisions(rows: readonly Pick<PrescriptionRow, "rowId">[], decisions: readonly ConfirmDecision[]) {
  const expected = new Set(rows.map((r) => r.rowId));
  const seen = new Set<string>();
  for (const decision of decisions) {
    if (!expected.has(decision.rowId)) throw new HttpError(400, `Unknown row ${decision.rowId}`);
    if (seen.has(decision.rowId)) throw new HttpError(400, `Row ${decision.rowId} was sent twice`);
    seen.add(decision.rowId);
  }
  const undecided = [...expected].filter((id) => !seen.has(id));
  if (undecided.length > 0) throw new HttpError(400, `Every medicine must be checked or removed first (${undecided.join(", ")})`);
  const confirmed = decisions.filter((d): d is Extract<ConfirmDecision, { action: "confirm" }> => d.action === "confirm");
  if (confirmed.length === 0) throw new HttpError(400, "Nothing to save: every medicine was removed");
  return confirmed.map((d) => d.medicine);
}

/** POST /families/{fid}/prescriptions/{rxId}/confirm — only now do medicines and schedules exist. */
export async function confirmPrescription(event: APIGatewayProxyEventV2) {
  const { rx, mid } = await authorizedPrescription(event);
  if (rx.status !== "READY") throw new HttpError(409, rx.status === "CONFIRMED" ? "This prescription was already saved" : "This prescription is not ready to save");
  const { decisions } = parseBody(event, ConfirmSchema);
  const medicines = checkDecisions(rx.rows ?? [], decisions);

  // Claim the confirmation first so a double tap cannot create the medicines twice.
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: env.tableName,
        Key: keys.prescription(rx.fid, rx.rxId),
        UpdateExpression: "SET #status = :confirmed, confirmedAt = :now, confirmedBy = :mid REMOVE #ttl",
        ConditionExpression: "#status = :ready",
        ExpressionAttributeNames: { "#status": "status", "#ttl": "ttl" },
        ExpressionAttributeValues: { ":confirmed": "CONFIRMED", ":ready": "READY", ":now": new Date().toISOString(), ":mid": mid },
      }),
    );
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") throw new HttpError(409, "This prescription was already saved");
    throw error;
  }

  const items = await createMedicines(rx.fid, rx.pid, medicines, mid, rx.rxId);
  await ddb.send(
    new UpdateCommand({
      TableName: env.tableName,
      Key: keys.prescription(rx.fid, rx.rxId),
      UpdateExpression: "SET medIds = :ids",
      ExpressionAttributeValues: { ":ids": items.map((m) => m.medId) },
    }),
  );
  metrics.addMetric("PrescriptionsConfirmed", "Count", 1);
  // The medicines just changed for everyone who looks after this person; the one who confirmed
  // already knows, so they are left out.
  await notifyPrescription({ fid: rx.fid, pid: rx.pid, rxId: rx.rxId, kind: "CONFIRMED", exceptMid: mid });
  return json(201, { rxId: rx.rxId, medIds: items.map((m) => m.medId) });
}
