import { DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import webpush from "web-push";
import { ddb, logger, metrics, secret } from "./aws.js";
import { env } from "./env.js";
import type { PushSubscriptionItem } from "./model.js";
import { encodePushPayload, type PushPayload } from "./push-payload.js";

let configured = false;

async function configure(): Promise<void> {
  if (configured) return;
  const [subject, publicKey, privateKey] = await Promise.all([
    secret("vapid/subject"),
    secret("vapid/public"),
    secret("vapid/private"),
  ]);
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export async function subscriptionsFor(subjectId: string): Promise<PushSubscriptionItem[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: env.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sub)",
      ExpressionAttributeValues: { ":pk": `SUBJ#${subjectId}`, ":sub": "SUB#" },
    }),
  );
  return (result.Items ?? []) as PushSubscriptionItem[];
}

export type PushResult = "sent" | "gone" | "failed";

/**
 * Sends one notification. Urgency is high so FCM can wake Android devices from Doze;
 * the Topic collapses repeats of the same step; TTL is always set (Apple rejects missing TTL).
 */
export async function sendPush(
  subscription: PushSubscriptionItem,
  payload: PushPayload,
  options: { ttlSeconds: number; topic: string },
): Promise<PushResult> {
  await configure();
  try {
    await webpush.sendNotification(subscription.subscription, encodePushPayload(payload), {
      TTL: options.ttlSeconds,
      urgency: "high",
      topic: options.topic,
    });
    return "sent";
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await ddb.send(new DeleteCommand({ TableName: env.tableName, Key: { PK: subscription.PK, SK: subscription.SK } }));
      metrics.addMetric("PushGone", "Count", 1);
      return "gone";
    }
    logger.warn("Push failed", { statusCode, error: (error as Error).message });
    return "failed";
  }
}
