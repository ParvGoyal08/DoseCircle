import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "./aws.js";
import { env } from "./env.js";

/**
 * Atomic counter with a ceiling, e.g. "3 test reminders per parent per day". Returns false once the
 * budget is used up. The item expires with the window, so no cleanup is needed.
 */
export async function takeFromBudget(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: env.tableName,
        Key: { PK: `RATE#${key}`, SK: "META" },
        UpdateExpression: "SET c = if_not_exists(c, :zero) + :one, #ttl = if_not_exists(#ttl, :ttl)",
        ConditionExpression: "attribute_not_exists(c) OR c < :max",
        ExpressionAttributeNames: { "#ttl": "ttl" },
        ExpressionAttributeValues: { ":zero": 0, ":one": 1, ":max": max, ":ttl": Math.floor(Date.now() / 1000) + windowSeconds },
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}
