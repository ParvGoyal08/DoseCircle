import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { LanguageCode } from "@saathi/shared";
import { ddb, metrics, secret, ttlInHours } from "./aws.js";
import { signReceipt, pushTopic } from "./crypto.js";
import { env } from "./env.js";
import type { DeliveryChannel } from "./model.js";
import type { PushPayload, PushStep } from "./push-payload.js";
import { sendPush, subscriptionsFor } from "./webpush.js";

export interface Recipient {
  /** Member id or parent device id. */
  id: string;
  lang: LanguageCode;
  kind: "parent" | "family";
}

export interface Notification {
  title: string;
  body: string;
  lang: LanguageCode;
}

/**
 * Delivers one step's notification to one recipient, at most once per (dose, step, attempt, recipient).
 * Live doses use web push; demo doses write to an in-app inbox that the split view polls.
 */
export async function deliver(input: {
  channel: DeliveryChannel;
  fid: string;
  doseId?: string;
  step: PushStep;
  attempt: string;
  recipient: Recipient;
  notification: Notification;
  url: string;
  ttlSeconds: number;
}): Promise<void> {
  const { recipient, notification } = input;
  const dedupeId = input.doseId ?? `refill-${input.fid}`;

  try {
    await ddb.send(
      new PutCommand({
        TableName: env.tableName,
        Item: {
          PK: `DOSE#${dedupeId}`,
          SK: `NOTIF#${input.step}#${input.attempt}#${recipient.id}`,
          sentAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 120 * 24 * 3600,
        },
        ConditionExpression: "attribute_not_exists(SK)",
      }),
    );
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") return; // already sent (Lambda retry)
    throw error;
  }

  const sig = input.doseId ? signReceipt(await secret("receipt-hmac"), input.doseId, input.step, recipient.id) : "";
  const payload: PushPayload = {
    t: notification.title,
    b: notification.body,
    l: notification.lang,
    doseId: input.doseId,
    step: input.step,
    r: recipient.id,
    url: input.url,
    kind: recipient.kind,
    sig,
  };

  if (input.channel === "inbox") {
    const at = new Date().toISOString();
    await ddb.send(
      new PutCommand({
        TableName: env.tableName,
        Item: { PK: `FAM#${input.fid}`, SK: `INBOX#${recipient.id}#${at}`, ...payload, at, ttl: ttlInHours(2) },
      }),
    );
    metrics.addMetric("InboxDelivered", "Count", 1);
    return;
  }

  const subscriptions = await subscriptionsFor(recipient.id);
  const topic = pushTopic(dedupeId, input.step);
  await Promise.allSettled(
    subscriptions.map((subscription) => sendPush(subscription, payload, { ttlSeconds: input.ttlSeconds, topic })),
  );
}

export function appUrl(path: string): string {
  return new URL(path, env.appOrigin).toString();
}
