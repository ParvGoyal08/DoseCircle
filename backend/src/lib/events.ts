import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { keys } from "@dosecircle/shared";
import { ddb } from "./aws.js";
import { env } from "./env.js";

export type DoseEventType =
  | "REMINDER_SENT"
  | "NUDGE_SENT"
  | "DELIVERED"
  | "TAKEN"
  | "ESCALATED"
  | "MEMBER_ALERTED"
  | "FAMILY_ALERTED"
  | "CLAIMED"
  | "STAND_DOWN_SENT"
  | "UNRESOLVED";

/**
 * Appends to a dose's event log (feeds the "Why am I seeing this?" timeline).
 * `dedupeKey` makes retries idempotent: the same event is written at most once.
 */
export async function recordDoseEvent(input: {
  doseId: string;
  type: DoseEventType;
  at?: string;
  actorName?: string;
  detail?: Record<string, unknown>;
  dedupeKey?: string;
  ttl?: number;
}): Promise<void> {
  const at = input.at ?? new Date().toISOString();
  const key = keys.event(input.doseId, input.dedupeKey ? "0" : at, input.dedupeKey ? `${input.type}#${input.dedupeKey}` : input.type);
  try {
    await ddb.send(
      new PutCommand({
        TableName: env.tableName,
        Item: { ...key, doseId: input.doseId, type: input.type, at, actorName: input.actorName, detail: input.detail, ttl: input.ttl },
        ConditionExpression: input.dedupeKey ? "attribute_not_exists(SK)" : undefined,
      }),
    );
  } catch (error) {
    if ((error as { name?: string }).name !== "ConditionalCheckFailedException") throw error;
  }
}
