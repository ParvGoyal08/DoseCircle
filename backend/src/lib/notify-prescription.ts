import { appUrl, deliver } from "./deliver.js";
import { logger } from "./aws.js";
import { message, messageLanguage } from "./messages.js";
import { getParent, listMembers } from "./repository.js";

/**
 * Tells the family when a prescription changes: one notification when a photo is ready to be
 * checked, and one when the medicines actually change.
 *
 * It goes to **the person whose turn it is first** in that parent's alert order — the one the family
 * chose as responsible — rather than to everybody. Confirming a prescription is a job for one person,
 * and the app's whole discipline is asking one person at a time instead of making a group everyone
 * ignores. If the order is empty, everyone is told, because silence would be worse.
 *
 * Nothing here is time critical: it is never escalated, and a missed notification only means the
 * draft waits on the dashboard, where it is also visible.
 */
export async function notifyPrescription(input: { fid: string; pid: string; rxId: string; kind: "READY" | "CONFIRMED"; exceptMid?: string }): Promise<void> {
  const [parent, members] = await Promise.all([getParent(input.fid, input.pid), listMembers(input.fid)]);
  if (!parent) return;

  const byId = new Map(members.map((m) => [m.mid, m]));
  const responsible = parent.ladder.map((mid) => byId.get(mid)).find((m) => m && m.mid !== input.exceptMid);
  // Whoever confirmed it already knows, so they are skipped; with no order at all, tell everyone.
  const recipients = responsible ? [responsible] : members.filter((m) => m.mid !== input.exceptMid);
  if (recipients.length === 0) return;

  const bodyKey = input.kind === "READY" ? "push.rx.ready.body" : "push.rx.confirmed.body";
  const url = appUrl(input.kind === "READY" ? `/parents/${input.pid}/prescription?rx=${input.rxId}` : `/parents/${input.pid}/medicines`);

  await Promise.all(
    recipients.map((member) =>
      deliver({
        channel: "webpush",
        fid: input.fid,
        step: input.kind === "READY" ? "RX_READY" : "RX_CONFIRMED",
        attempt: `${input.kind}#${input.rxId}`,
        recipient: { id: member.mid, lang: member.lang, kind: "family" },
        // The parent's name goes in the title; the translated sentence never has anything inserted.
        notification: { title: parent.displayName, body: message(member.lang, bodyKey), lang: messageLanguage(member.lang, bodyKey) },
        url,
        ttlSeconds: 6 * 3600,
      }).catch((error: Error) => logger.warn("Prescription notice failed", { mid: member.mid, error: error.message })),
    ),
  );
}
