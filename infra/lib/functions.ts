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

  return new NodejsFunction(scope, id, {
    entry: `${repoRoot}backend/src/${entry}`,
    handler: "handler",
    runtime: Runtime.NODEJS_24_X,
    architecture: Architecture.ARM_64,
    memorySize: 256,
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
      NODE_OPTIONS: "--enable-source-maps",
      POWERTOOLS_SERVICE_NAME: "dosecircle",
      ...props.environment,
    },
  });
}
