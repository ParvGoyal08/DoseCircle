import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { ddb, metrics, secret } from "../../lib/aws.js";
import { verifyReceipt } from "../../lib/crypto.js";
import { env } from "../../lib/env.js";
import { recordDoseEvent } from "../../lib/events.js";
import { HttpError, json, parseBody, withErrors } from "../../lib/http.js";
import { doseKey, getDose } from "../../lib/repository.js";

const ReceiptSchema = z.object({
  doseId: z.string().min(1).max(100),
  step: z.enum(["REMIND", "NUDGE", "ALERT", "BROADCAST", "STAND_DOWN", "TOOK_LATE"]),
  recipient: z.string().min(1).max(100),
  sig: z.string().min(1).max(100),
});

/**
 * The service worker posts this the moment a push arrives, before the person taps anything.
 * It is what lets the workflow tell "reminder reached the phone" (MISSED) from "phone offline".
 * No credentials are needed: the HMAC in the push payload proves the receipt is genuine.
 */
export const handler = withErrors(async (event) => {
  const receipt = parseBody(event, ReceiptSchema);
  const valid = verifyReceipt(await secret("receipt-hmac"), receipt.doseId, receipt.step, receipt.recipient, receipt.sig);
  if (!valid) throw new HttpError(401, "Invalid receipt");

  const dose = await getDose(receipt.doseId, false);
  if (!dose) return json(204);
  const now = new Date().toISOString();

  if (receipt.step === "REMIND" || receipt.step === "NUDGE") {
    try {
      await ddb.send(
        new UpdateCommand({
          TableName: env.tableName,
          Key: doseKey(receipt.doseId),
          UpdateExpression: "SET deliveredAt = :now, deliveredTo = :recipient",
          ConditionExpression: "attribute_not_exists(deliveredAt)",
          ExpressionAttributeValues: { ":now": now, ":recipient": receipt.recipient },
        }),
      );
      metrics.addMetric("ReceiptsDelivered", "Count", 1);
      metrics.addMetric("DeliveryLatencyMs", "Milliseconds", Date.parse(now) - Date.parse(dose.scheduledAt));
    } catch (error) {
      if ((error as { name?: string }).name !== "ConditionalCheckFailedException") throw error;
    }
  }

  await recordDoseEvent({ doseId: receipt.doseId, type: "DELIVERED", at: now, dedupeKey: `${receipt.step}#${receipt.recipient}`, detail: { step: receipt.step, recipient: receipt.recipient }, ttl: dose.ttl });
  metrics.publishStoredMetrics();
  return json(204);
});
