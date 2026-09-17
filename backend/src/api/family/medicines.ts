import { PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { keys } from "@dosecircle/shared";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { z } from "zod";
import { authorize } from "../../authz/avp.js";
import { familyEntity, parentEntity } from "../../authz/entities.js";
import { memberPrincipal } from "../../authz/principal-entity.js";
import { ddb } from "../../lib/aws.js";
import { env } from "../../lib/env.js";
import { HttpError, json, parseBody, pathParam, principalFrom } from "../../lib/http.js";
import { newId } from "../../lib/ids.js";
import type { MedicineItem, ParentItem } from "../../lib/model.js";
import { getMedicine, getParent } from "../../lib/repository.js";
import { MedicineFields, MedicineInputSchema, type MedicineInput } from "../../lib/schemas.js";
import { listMedicines, syncSlots } from "../../scheduling/sync-slots.js";

async function authorizedParent(event: APIGatewayProxyEventV2): Promise<{ fid: string; pid: string; parent: ParentItem; mid: string }> {
  const fid = pathParam(event, "fid");
  const pid = pathParam(event, "pid");
  const parent = await getParent(fid, pid);
  if (!parent) throw new HttpError(404, "Parent not found");
  const { entity, member } = await memberPrincipal(await principalFrom(event), event.queryStringParameters?.asMemberId);
  await authorize({ principal: entity, action: "ManageMedicines", resource: parentEntity(parent), entities: [familyEntity(fid)] });
  return { fid, pid, parent, mid: member.mid };
}

function toView(m: MedicineItem) {
  return {
    medId: m.medId,
    nameAsPrinted: m.nameAsPrinted,
    strength: m.strength,
    slots: m.slots,
    food: m.food,
    critical: m.critical,
    asNeeded: m.asNeeded,
    pillsLeft: m.pillsLeft,
    refillThresholdDays: m.refillThresholdDays,
    needsRecount: m.needsRecount ?? false,
    endDate: m.endDate ?? null,
    active: m.active,
  };
}

/** Shared by the manual form and prescription confirmation, so both paths produce identical medicines. */
export async function createMedicines(fid: string, pid: string, inputs: MedicineInput[], createdBy: string, rxId?: string): Promise<MedicineItem[]> {
  const now = new Date().toISOString();
  const items: MedicineItem[] = inputs.map((input) => {
    const medId = newId("med");
    return {
      ...keys.medicine(pid, medId),
      pid,
      medId,
      nameAsPrinted: input.nameAsPrinted,
      strength: input.strength,
      slots: input.slots,
      food: input.food,
      critical: input.critical,
      asNeeded: input.asNeeded,
      pillsLeft: input.pillsLeft,
      refillThresholdDays: input.refillThresholdDays,
      endDate: input.endDate ?? undefined,
      active: true,
      createdAt: now,
      createdBy,
      rxId,
    } as MedicineItem;
  });
  for (const item of items) await ddb.send(new PutCommand({ TableName: env.tableName, Item: item }));
  await syncSlots(fid, pid);
  return items;
}

/** GET /families/{fid}/parents/{pid}/medicines */
export async function listParentMedicines(event: APIGatewayProxyEventV2) {
  const { pid } = await authorizedParent(event);
  const medicines = await listMedicines(pid);
  return json(200, { medicines: medicines.filter((m) => m.active).map(toView) });
}

/** POST /families/{fid}/parents/{pid}/medicines — manual entry, always available. */
export async function addMedicine(event: APIGatewayProxyEventV2) {
  const { fid, pid, mid } = await authorizedParent(event);
  const input = parseBody(event, MedicineInputSchema);
  const [item] = await createMedicines(fid, pid, [input], mid);
  return json(201, { medicine: toView(item!) });
}

const MedicinePatchSchema = MedicineFields.partial().refine((b) => Object.keys(b).length > 0, "Nothing to update");

/** PATCH /families/{fid}/parents/{pid}/medicines/{medId} */
export async function updateMedicine(event: APIGatewayProxyEventV2) {
  const { fid, pid } = await authorizedParent(event);
  const medId = pathParam(event, "medId");
  const current = await getMedicine(pid, medId);
  if (!current || !current.active) throw new HttpError(404, "Medicine not found");

  // Validate the medicine as it will be after the change, not just the patch.
  const patch = parseBody(event, MedicinePatchSchema);
  const merged = MedicineInputSchema.safeParse({ ...toView(current), ...patch });
  if (!merged.success) throw new HttpError(400, merged.error.issues[0]?.message ?? "Invalid medicine");

  const fields = Object.keys(patch) as (keyof typeof patch)[];
  await ddb.send(
    new UpdateCommand({
      TableName: env.tableName,
      Key: keys.medicine(pid, medId),
      UpdateExpression: `SET ${fields.map((f) => `#${f} = :${f}`).join(", ")}`,
      ExpressionAttributeNames: Object.fromEntries(fields.map((f) => [`#${f}`, f])),
      ExpressionAttributeValues: Object.fromEntries(fields.map((f) => [`:${f}`, merged.data[f]])),
    }),
  );
  await syncSlots(fid, pid);
  return json(200, { medicine: toView({ ...current, ...merged.data, endDate: merged.data.endDate ?? undefined }) });
}

/** DELETE /families/{fid}/parents/{pid}/medicines/{medId} — stopped medicines are kept for the report history. */
export async function stopMedicine(event: APIGatewayProxyEventV2) {
  const { fid, pid } = await authorizedParent(event);
  const medId = pathParam(event, "medId");
  await ddb.send(
    new UpdateCommand({
      TableName: env.tableName,
      Key: keys.medicine(pid, medId),
      UpdateExpression: "SET active = :false, stoppedAt = :now",
      ConditionExpression: "attribute_exists(PK)",
      ExpressionAttributeValues: { ":false": false, ":now": new Date().toISOString() },
    }),
  ).catch((error: { name?: string }) => {
    if (error.name === "ConditionalCheckFailedException") throw new HttpError(404, "Medicine not found");
    throw error;
  });
  await syncSlots(fid, pid);
  return json(200, { medId, active: false });
}

const RefillSchema = z.object({ added: z.number().int().min(1).max(10_000) });

/** POST /families/{fid}/parents/{pid}/medicines/{medId}/refill — adds pills and re-arms the low-stock warning. */
export async function refillMedicine(event: APIGatewayProxyEventV2) {
  const { pid } = await authorizedParent(event);
  const medId = pathParam(event, "medId");
  const { added } = parseBody(event, RefillSchema);
  const result = await ddb
    .send(
      new UpdateCommand({
        TableName: env.tableName,
        Key: keys.medicine(pid, medId),
        UpdateExpression: "SET pillsLeft = if_not_exists(pillsLeft, :zero) + :added, needsRecount = :false REMOVE refillAlertedAt",
        ConditionExpression: "attribute_exists(PK) AND active = :true",
        ExpressionAttributeValues: { ":zero": 0, ":added": added, ":false": false, ":true": true },
        ReturnValues: "ALL_NEW",
      }),
    )
    .catch((error: { name?: string }) => {
      if (error.name === "ConditionalCheckFailedException") throw new HttpError(404, "Medicine not found");
      throw error;
    });
  return json(200, { medicine: toView(result.Attributes as MedicineItem) });
}
