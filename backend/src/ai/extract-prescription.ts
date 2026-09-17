import { ApplyGuardrailCommand, BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DetectDocumentTextCommand, TextractClient } from "@aws-sdk/client-textract";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { keys } from "@dosecircle/shared";
import type { S3Event } from "aws-lambda";
import { ddb, logger, metrics } from "../lib/aws.js";
import { env, requireEnv } from "../lib/env.js";
import { runExtraction } from "./pipeline.js";

const s3 = new S3Client({});
const textract = new TextractClient({});
const bedrock = new BedrockRuntimeClient({});

const KEY = /^rx\/([a-z0-9-]+)\/(rx-[a-f0-9]+)\/original\.jpg$/;

async function readObject(bucket: string, key: string): Promise<Uint8Array | null> {
  // The app uploads model.jpg before original.jpg, but give a slow network a few seconds.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return (await object.Body?.transformToByteArray()) ?? null;
    } catch (error) {
      if ((error as { name?: string }).name !== "NoSuchKey") throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  return null;
}

/** S3 ObjectCreated (prefix rx/, suffix original.jpg). Delivery is at least once, so it claims the work first. */
export async function handler(event: S3Event): Promise<void> {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const match = KEY.exec(key);
    if (!match) {
      logger.warn("Ignoring unexpected object", { key });
      continue;
    }
    const [, fid, rxId] = match as unknown as [string, string, string];
    const rxKey = keys.prescription(fid, rxId);

    try {
      await ddb.send(
        new UpdateCommand({
          TableName: env.tableName,
          Key: rxKey,
          UpdateExpression: "SET #status = :extracting",
          ConditionExpression: "#status = :awaiting",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":extracting": "EXTRACTING", ":awaiting": "AWAITING_UPLOAD" },
        }),
      );
    } catch (error) {
      if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
        logger.info("Duplicate or unknown upload event; skipping", { rxId });
        continue;
      }
      throw error;
    }

    const started = Date.now();
    const modelId = requireEnv("BEDROCK_MODEL_ID");
    try {
      const result = await runExtraction(modelId, {
        detectText: async () => (await textract.send(new DetectDocumentTextCommand({ Document: { S3Object: { Bucket: bucket, Name: key } } }))).Blocks ?? [],
        modelImage: () => readObject(bucket, key.replace(/original\.jpg$/, "model.jpg")),
        converse: (input) => bedrock.send(new ConverseCommand(input)),
        applyGuardrail: ({ content }) =>
          bedrock.send(
            new ApplyGuardrailCommand({
              guardrailIdentifier: requireEnv("GUARDRAIL_ID"),
              guardrailVersion: requireEnv("GUARDRAIL_VERSION"),
              source: "OUTPUT",
              content,
            }),
          ),
      });
      const extractionMs = Date.now() - started;

      await ddb.send(
        new UpdateCommand({
          TableName: env.tableName,
          Key: rxKey,
          UpdateExpression: result.ok
            ? "SET #status = :status, #lines = :lines, #rows = :rows, modelId = :modelId, guardrailInterventions = :gi, extractionMs = :ms"
            : "SET #status = :status, #lines = :lines, failure = :failure, extractionMs = :ms",
          ExpressionAttributeNames: { "#status": "status", "#lines": "lines", ...(result.ok ? { "#rows": "rows" } : {}) },
          ExpressionAttributeValues: result.ok
            ? { ":status": "READY", ":lines": result.lines, ":rows": result.rows, ":modelId": modelId, ":gi": result.guardrailInterventions, ":ms": extractionMs }
            : { ":status": "FAILED", ":lines": result.lines, ":failure": result.failure, ":ms": extractionMs },
        }),
      );

      metrics.addMetric("ExtractionMs", "Milliseconds", extractionMs);
      if (result.ok) {
        metrics.addMetric("GuardrailInterventions", "Count", result.guardrailInterventions);
        logger.info("Prescription ready", { rxId, rows: result.rows.length, levels: result.rows.map((r) => r.level), extractionMs });
      } else {
        metrics.addMetric("ExtractionFailed", "Count", 1);
        logger.info("Prescription could not be read", { rxId, failure: result.failure });
      }
    } catch (error) {
      logger.error("Extraction failed", { rxId, error: (error as Error).message });
      metrics.addMetric("ExtractionFailed", "Count", 1);
      await ddb.send(
        new UpdateCommand({
          TableName: env.tableName,
          Key: rxKey,
          UpdateExpression: "SET #status = :failed, failure = :error",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":failed": "FAILED", ":error": "error" },
        }),
      );
    } finally {
      metrics.publishStoredMetrics();
    }
  }
}
