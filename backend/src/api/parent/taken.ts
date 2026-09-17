import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { canMarkTaken, takenStatusFor } from "@dosecircle/shared";
import { z } from "zod";
import { ddb, metrics } from "../../lib/aws.js";
import { env } from "../../lib/env.js";
import { recordDoseEvent } from "../../lib/events.js";
import { HttpError, json, parseBody, pathParam, principalFrom, withErrors } from "../../lib/http.js";
import type { DoseItem } from "../../lib/model.js";
import { doseKey, getDose } from "../../lib/repository.js";
import { completeTask } from "../../lib/task-token.js";
import { notifyResolution } from "../../workflow/notify-resolution.js";
import { applyPillCount } from "../../lib/pills.js";
import { authorize } from "../../authz/avp.js";
import { doseEntity, familyEntity, parentEntity } from "../../authz/entities.js";
import { devicePrincipal } from "../../authz/principal-entity.js";
import { recordReading } from "../family/checks.js";

/** Measurements the parent filled in on the same screen, sent with the one confirming tap. */
const TakenSchema = z
  .object({ readings: z.array(z.object({ checkId: z.string().min(1).max(40), values: z.record(z.string().min(1).max(20), z.number()) })).max(5).default([]) })
  .default({ readings: [] });

/**
 * The parent confirms a dose. The app only sends this after its 10-second on-device Undo window,
 * because a completed Step Functions task can never be un-completed.
 */
export const handler = withErrors(async (event) => {
  const principal = await principalFrom(event);
  const doseId = pathParam(event, "doseId");
  const dose = await getDose(doseId);
  if (!dose) throw new HttpError(404, "Dose not found");
  const phone = devicePrincipal(principal, dose.pid);
  const decision = await authorize({
    principal: phone,
    action: "MarkTaken",
    resource: doseEntity(dose),
    entities: [familyEntity(dose.fid), parentEntity({ pid: dose.pid, fid: dose.fid })],
  });
  const body = parseBody(event, TakenSchema);

  // Readings are stored before the status flips, so a measurement is never lost to a lost race.
  // A bad number fails the whole request, so the parent can correct it and tap again.
  for (const reading of body.readings) {
    await recordReading({
      pid: dose.pid,
      checkId: reading.checkId,
      values: reading.values,
      doseId,
      recordedBy: { kind: "parent", id: phone.uid.id },
      demo: dose.channel === "inbox",
    });
  }
  if (body.readings.length > 0) metrics.addMetric("ReadingsRecorded", "Count", body.readings.length);

  if (!canMarkTaken(dose.status)) return json(200, { status: dose.status });

  const next = takenStatusFor(dose.status);
  const now = new Date().toISOString();
  let previous: DoseItem;
  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: env.tableName,
        Key: doseKey(doseId),
        UpdateExpression: "SET #status = :next, takenAt = :now, takenBy = :by",
        ConditionExpression: "#status = :previous",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":next": next,
          ":previous": dose.status,
          ":now": now,
          ":by": phone.uid.id,
        },
        ReturnValues: "ALL_OLD",
      }),
    );
    previous = result.Attributes as DoseItem;
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      // Another request changed the dose first; report the current state.
      return json(200, { status: (await getDose(doseId))?.status });
    }
    throw error;
  }

  await recordDoseEvent({ doseId, type: "TAKEN", at: now, detail: { authorizedBy: decision.determiningPolicies }, ttl: dose.ttl });
  metrics.addMetric(next === "TAKEN" ? "TakenOnTime" : "TakenLate", "Count", 1);

  if (previous.status === "CLAIMED") {
    // The escalation already ended with a claim, so no task is waiting: tell the family directly.
    await notifyResolution({ doseId, outcome: "TAKEN" });
  } else {
    // If the token is stale, the next workflow step sees the new status and completes itself.
    await completeTask(previous.currentToken, { outcome: "TAKEN" });
  }

  await applyPillCount(previous);
  metrics.publishStoredMetrics();
  return json(200, { status: next });
});
