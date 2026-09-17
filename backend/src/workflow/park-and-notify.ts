import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { parseDoseId, type MissClass } from "@saathi/shared";
import { ddb, logger, metrics } from "../lib/aws.js";
import { appUrl, deliver, type Recipient } from "../lib/deliver.js";
import { env } from "../lib/env.js";
import { recordDoseEvent } from "../lib/events.js";
import { message, messageLanguage } from "../lib/messages.js";
import type { DoseItem, ParentItem } from "../lib/model.js";
import { doseKey, getDose, getParent, listMembers, listParentDevices } from "../lib/repository.js";
import { completeTask } from "../lib/task-token.js";

export interface ParkInput {
  token: string;
  doseId: string;
  step: "REMIND" | "NUDGE" | "ALERT" | "BROADCAST";
  ttlSeconds: number;
  memberIndex?: number;
  missClass?: MissClass;
}

/**
 * One handler for every human-in-the-loop step. It stores the task token on the dose (only if the
 * dose is still in the expected state), notifies the right people, and returns immediately; the
 * state machine then waits until Taken/claim completes the token or the step times out.
 *
 * If the dose already moved on (Taken or claimed between steps), it completes its own token so the
 * execution converges in one step instead of waiting for a timeout.
 */
export async function handler(event: ParkInput): Promise<void> {
  const { pid } = parseDoseId(event.doseId);
  const expected = event.step === "REMIND" || event.step === "NUDGE" ? "PENDING" : "ESCALATING";

  const current = await getDose(event.doseId);
  if (!current) {
    logger.warn("Dose not found", { doseId: event.doseId });
    return;
  }
  const parent = await getParent(current.fid, pid);
  if (!parent) {
    logger.warn("Parent not found", { doseId: event.doseId });
    return;
  }

  const recipients = await resolveRecipients(event, current, parent);

  let dose: DoseItem;
  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: env.tableName,
        Key: doseKey(event.doseId),
        UpdateExpression:
          recipients.some((r) => r.kind === "family")
            ? "SET currentToken = :token, currentStep = :step ADD alertedMemberIds :members"
            : "SET currentToken = :token, currentStep = :step",
        ConditionExpression: "#status = :expected",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":token": event.token,
          ":step": event.step,
          ":expected": expected,
          ...(recipients.some((r) => r.kind === "family")
            ? { ":members": new Set(recipients.filter((r) => r.kind === "family").map((r) => r.id)) }
            : {}),
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    dose = result.Attributes as DoseItem;
  } catch (error) {
    if ((error as { name?: string }).name !== "ConditionalCheckFailedException") throw error;
    const latest = await getDose(event.doseId);
    if (latest?.status === "TAKEN" || latest?.status === "TAKEN_LATE") {
      await completeTask(event.token, { outcome: "TAKEN" });
    } else if (latest?.status === "CLAIMED" && latest.claimedBy) {
      await completeTask(event.token, { outcome: "CLAIMED", by: latest.claimedBy });
    } else {
      logger.info("Dose not in expected state; letting the step time out", { doseId: event.doseId, status: latest?.status });
    }
    return;
  }

  const attempt = `${event.step}${event.memberIndex ?? ""}`;
  await Promise.all(
    recipients.map((recipient) =>
      deliver({
        channel: dose.channel,
        fid: dose.fid,
        doseId: dose.doseId,
        step: event.step,
        attempt,
        recipient,
        notification: notificationFor(event, recipient, parent.displayName, dose.slotName),
        url: appUrl(recipient.kind === "parent" ? `/parent/dose/${dose.doseId}` : `/alerts/${dose.doseId}`),
        ttlSeconds: Math.max(60, event.ttlSeconds),
      }),
    ),
  );

  const eventType =
    event.step === "REMIND" ? "REMINDER_SENT" : event.step === "NUDGE" ? "NUDGE_SENT" : event.step === "ALERT" ? "MEMBER_ALERTED" : "FAMILY_ALERTED";
  const members = recipients.filter((r) => r.kind === "family").map((r) => r.id);
  await recordDoseEvent({ doseId: dose.doseId, type: eventType, dedupeKey: attempt, detail: members.length ? { memberIds: members, missClass: event.missClass } : undefined, ttl: dose.ttl });

  metrics.addMetric(event.step === "REMIND" ? "RemindersSent" : event.step === "ALERT" || event.step === "BROADCAST" ? "EscalationAlerts" : "NudgesSent", "Count", 1);
  metrics.publishStoredMetrics();
}

async function resolveRecipients(event: ParkInput, dose: DoseItem, parent: ParentItem): Promise<Recipient[]> {
  if (event.step === "REMIND" || event.step === "NUDGE") {
    // The demo parent pane is a simulated device with a stable id.
    if (dose.channel === "inbox") return [{ id: `parent-${dose.pid}`, lang: parent.lang, kind: "parent" }];
    const devices = await listParentDevices(dose.pid);
    return devices.map((d) => ({ id: d.deviceId, lang: d.lang, kind: "parent" as const }));
  }
  const members = await listMembers(dose.fid);
  if (event.step === "ALERT") {
    const mid = parent.ladder[event.memberIndex ?? -1];
    const member = members.find((m) => m.mid === mid);
    return member ? [{ id: member.mid, lang: member.lang, kind: "family" }] : [];
  }
  return members.map((m) => ({ id: m.mid, lang: m.lang, kind: "family" as const }));
}

function notificationFor(event: ParkInput, recipient: Recipient, parentName: string, slotName: DoseItem["slotName"]) {
  if (event.step === "REMIND" || event.step === "NUDGE") {
    const titleKey = `push.remind.title.${slotName}`;
    const bodyKey = event.step === "REMIND" ? "push.remind.body" : "push.nudge.body";
    return { title: message(recipient.lang, titleKey), body: message(recipient.lang, bodyKey), lang: messageLanguage(recipient.lang, bodyKey) };
  }
  const bodyKey =
    event.step === "BROADCAST" ? "push.broadcast.body" : event.missClass === "OFFLINE" ? "push.alert.body.offline" : "push.alert.body.missed";
  // Names only ever go in the title; the regional sentence in the body is never modified.
  return { title: parentName, body: message(recipient.lang, bodyKey), lang: messageLanguage(recipient.lang, bodyKey) };
}
