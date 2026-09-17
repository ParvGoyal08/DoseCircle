import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dailyUse, decrementPills, shouldWarnRefill } from "@saathi/shared";
import { ddb, logger, metrics } from "./aws.js";
import { appUrl, deliver } from "./deliver.js";
import { env } from "./env.js";
import { message, messageLanguage } from "./messages.js";
import type { DoseItem, MedicineItem } from "./model.js";
import { getMedicine, listMembers } from "./repository.js";

/**
 * After a successful Taken: reduce each medicine's pill count and warn the family once when a
 * medicine is about to run out. Missed doses never reduce the count (we cannot know).
 */
export async function applyPillCount(dose: DoseItem): Promise<void> {
  for (const medId of dose.medIds) {
    const medicine = await getMedicine(dose.pid, medId);
    if (!medicine || medicine.asNeeded || medicine.pillsLeft === null) continue;
    const taken = medicine.slots[dose.slotName] ?? 0;
    if (taken <= 0) continue;

    const { pillsLeft, needsRecount } = decrementPills(medicine.pillsLeft, taken);
    const result = await ddb.send(
      new UpdateCommand({
        TableName: env.tableName,
        Key: { PK: medicine.PK, SK: medicine.SK },
        UpdateExpression: "SET pillsLeft = :left, needsRecount = :recount",
        ConditionExpression: "pillsLeft = :expected",
        ExpressionAttributeValues: { ":left": pillsLeft, ":recount": needsRecount, ":expected": medicine.pillsLeft },
        ReturnValues: "ALL_NEW",
      }),
    ).catch((error: { name?: string }) => {
      if (error.name === "ConditionalCheckFailedException") {
        logger.warn("Pill count changed concurrently; skipping decrement", { medId });
        return undefined;
      }
      throw error;
    });
    const updated = result?.Attributes as MedicineItem | undefined;
    if (updated) await maybeWarnRefill(dose, updated);
  }
}

async function maybeWarnRefill(dose: DoseItem, medicine: MedicineItem): Promise<void> {
  const perDay = dailyUse(medicine);
  if (
    !shouldWarnRefill({
      pillsLeft: medicine.pillsLeft ?? 0,
      perDay,
      thresholdDays: medicine.refillThresholdDays,
      alreadyAlerted: Boolean(medicine.refillAlertedAt),
    })
  ) {
    return;
  }

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: env.tableName,
        Key: { PK: medicine.PK, SK: medicine.SK },
        UpdateExpression: "SET refillAlertedAt = :now",
        ConditionExpression: "attribute_not_exists(refillAlertedAt)",
        ExpressionAttributeValues: { ":now": new Date().toISOString() },
      }),
    );
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") return; // someone else warned
    throw error;
  }

  const members = await listMembers(dose.fid);
  await Promise.all(
    members.map((member) =>
      deliver({
        channel: dose.channel,
        fid: dose.fid,
        step: "REFILL",
        attempt: medicine.medId,
        recipient: { id: member.mid, lang: member.lang, kind: "family" },
        // The medicine name stays exactly as printed, in the title only.
        notification: { title: medicine.nameAsPrinted, body: message(member.lang, "push.refill.body"), lang: messageLanguage(member.lang, "push.refill.body") },
        url: appUrl("/medicines"),
        ttlSeconds: 24 * 3600,
      }),
    ),
  );
  metrics.addMetric("RefillWarnings", "Count", 1);
}
