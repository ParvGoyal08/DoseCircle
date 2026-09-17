import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, metrics } from "../lib/aws.js";
import { appUrl, deliver } from "../lib/deliver.js";
import { env } from "../lib/env.js";
import { recordDoseEvent } from "../lib/events.js";
import { message, messageLanguage } from "../lib/messages.js";
import { doseKey, getDose, getParent, listMembers } from "../lib/repository.js";

export interface NotifyResolutionInput {
  doseId: string;
  outcome: "CLAIMED" | "TAKEN";
}

/**
 * Tells everyone already alerted how an escalation ended: someone claimed it (others stand down)
 * or the parent confirmed late. Also used directly by the API when the execution has already ended.
 */
export async function notifyResolution(input: NotifyResolutionInput): Promise<void> {
  const dose = await getDose(input.doseId);
  if (!dose) return;
  const [parent, members] = await Promise.all([getParent(dose.fid, dose.pid), listMembers(dose.fid)]);
  const alerted = new Set(dose.alertedMemberIds ?? []);
  const claimer = members.find((m) => m.mid === dose.claimedBy);

  const recipients = members.filter((m) => alerted.has(m.mid) && !(input.outcome === "CLAIMED" && m.mid === dose.claimedBy));
  const bodyKey = input.outcome === "CLAIMED" ? "push.standDown.body" : "push.tookLate.body";
  const title = input.outcome === "CLAIMED" ? (claimer?.displayName ?? "") : (parent?.displayName ?? "");

  await Promise.all(
    recipients.map((member) =>
      deliver({
        channel: dose.channel,
        fid: dose.fid,
        doseId: dose.doseId,
        step: input.outcome === "CLAIMED" ? "STAND_DOWN" : "TOOK_LATE",
        attempt: "0",
        recipient: { id: member.mid, lang: member.lang, kind: "family" },
        notification: { title, body: message(member.lang, bodyKey), lang: messageLanguage(member.lang, bodyKey) },
        url: appUrl(`/alerts/${dose.doseId}`),
        ttlSeconds: 3600,
      }),
    ),
  );

  await ddb.send(
    new UpdateCommand({
      TableName: env.tableName,
      Key: doseKey(dose.doseId),
      UpdateExpression: "REMOVE GSI2PK, GSI2SK, currentToken",
    }),
  );
  await recordDoseEvent({ doseId: dose.doseId, type: "STAND_DOWN_SENT", dedupeKey: input.outcome, detail: { outcome: input.outcome, recipients: recipients.map((m) => m.mid) }, ttl: dose.ttl });
  metrics.addMetric(input.outcome === "CLAIMED" ? "EscalationsClaimed" : "FamilyToldTaken", "Count", 1);
  metrics.publishStoredMetrics();
}

export const handler = notifyResolution;
