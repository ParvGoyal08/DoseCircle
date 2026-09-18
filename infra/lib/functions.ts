import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Architecture, Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat, type NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

/**
 * Every Lambda: Node.js 24 on arm64 (nodejs20.x has been deprecated since 30 Apr 2026),
 * X-Ray tracing, and a log group with 14-day retention (CloudWatch keeps logs forever by default).
 *
 * 512 MB, not 256. The analytics handlers build a month of history in memory, and more memory also
 * means more vCPU: the dashboard request went from about six seconds to just over one. At this
 * volume Lambda is billed per GB-millisecond and stays inside the free tier either way.
 *
 * Memory alone was not the bug it first looked like. A warm container climbed towards whatever
 * limit it was given and then stalled for its whole timeout; raising the limit only moved the
 * wall. The real cause was an `Intl.DateTimeFormat` built per call in the analytics helpers
 * (`views/insights.ts`), which holds native memory V8 has no reason to reclaim.
 */
export function doseCircleFunction(
  scope: Construct,
  id: string,
  entry: string,
  props: Partial<NodejsFunctionProps> = {},
): NodejsFunction {
  const logGroup = new LogGroup(scope, `${id}Logs`, {
    retention: RetentionDays.TWO_WEEKS,
    removalPolicy: RemovalPolicy.DESTROY,
  });

  // V8 sizes its heap from the machine's memory, not the Lambda limit, so a warm container happily
  // grows until it is touching the ceiling and then spends every invocation in garbage collection
  // instead of doing work. Capping the old space well below the limit makes it collect in good time.
  const memorySize = props.memorySize ?? 512;
  const heapMb = Math.floor(memorySize * 0.7);

  return new NodejsFunction(scope, id, {
    entry: `${repoRoot}backend/src/${entry}`,
    handler: "handler",
    runtime: Runtime.NODEJS_24_X,
    architecture: Architecture.ARM_64,
    memorySize,
    timeout: Duration.seconds(10),
    tracing: Tracing.ACTIVE,
    logGroup,
    projectRoot: repoRoot,
    depsLockFilePath: `${repoRoot}pnpm-lock.yaml`,
    bundling: {
      format: OutputFormat.CJS,
      target: "node24",
      minify: true,
      sourceMap: true,
      // The Node.js 24 runtime ships AWS SDK v3; keep bundles small.
      externalModules: ["@aws-sdk/*"],
    },
    ...props,
    environment: {
      NODE_OPTIONS: `--enable-source-maps --max-old-space-size=${heapMb}`,
      POWERTOOLS_SERVICE_NAME: "dosecircle",
      ...props.environment,
    },
  });
}
