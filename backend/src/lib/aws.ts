import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { SFNClient } from "@aws-sdk/client-sfn";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { env } from "./env.js";

/**
 * Timeouts and a retry budget for every AWS client.
 *
 * The SDK keeps HTTP connections alive between invocations and, by default, waits for ever for a
 * reply. A warm Lambda container that has been idle can hold a socket the other end has already
 * dropped, and the next call on it never returns: the invocation then burns its whole timeout and
 * dies with no log line at all. That was happening to roughly one dashboard request in five on the
 * deployed stack. With these settings a dead socket fails in a second or two and the SDK retries on
 * a fresh connection, which the caller never notices.
 *
 * The values suit short control-plane calls (DynamoDB, Step Functions, SSM, Scheduler, Verified
 * Permissions). Textract and Bedrock legitimately take much longer and set their own.
 */
export const FAST_CLIENT_CONFIG = {
  maxAttempts: 4,
  requestHandler: { connectionTimeout: 1_000, requestTimeout: 3_000 },
} as const;

/** Clients are created once per Lambda container and reused across invocations. */
export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient(FAST_CLIENT_CONFIG), {
  marshallOptions: { removeUndefinedValues: true },
});
export const sfn = new SFNClient(FAST_CLIENT_CONFIG);
const ssm = new SSMClient(FAST_CLIENT_CONFIG);

export const logger = new Logger({ serviceName: "dosecircle" });
/** EMF metrics. No per-family dimensions: each dimension combination is a billed custom metric. */
export const metrics = new Metrics({ namespace: "DoseCircle", serviceName: "dosecircle" });

const secretCache = new Map<string, string>();

/** Reads an SSM parameter (decrypted) once per container. */
export async function secret(name: string): Promise<string> {
  const cached = secretCache.get(name);
  if (cached) return cached;
  const result = await ssm.send(new GetParameterCommand({ Name: `${env.ssmPrefix}/${name}`, WithDecryption: true }));
  const value = result.Parameter?.Value;
  if (!value) throw new Error(`SSM parameter ${env.ssmPrefix}/${name} is empty`);
  secretCache.set(name, value);
  return value;
}

/** Like `secret`, but returns null when the parameter has not been created. */
export async function optionalSecret(name: string): Promise<string | null> {
  try {
    return await secret(name);
  } catch (error) {
    if ((error as { name?: string }).name === "ParameterNotFound") return null;
    throw error;
  }
}

/** Epoch seconds `days` from now, for DynamoDB TTL. */
export function ttlInDays(days: number, now = Date.now()): number {
  return Math.floor(now / 1000) + days * 24 * 60 * 60;
}

export function ttlInHours(hours: number, now = Date.now()): number {
  return Math.floor(now / 1000) + hours * 60 * 60;
}

/** DynamoDB may still return items whose TTL has passed; every read filters them out. */
export function isExpired(item: { ttl?: number } | undefined, now = Date.now()): boolean {
  return typeof item?.ttl === "number" && item.ttl * 1000 <= now;
}
