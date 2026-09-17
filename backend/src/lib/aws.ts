import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { SFNClient } from "@aws-sdk/client-sfn";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { env } from "./env.js";

/** Clients are created once per Lambda container and reused across invocations. */
export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
export const sfn = new SFNClient({});
const ssm = new SSMClient({});

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
