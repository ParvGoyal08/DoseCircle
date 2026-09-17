import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { DoseCircleStack } from "../lib/dosecircle-stack.js";

interface AslState {
  Type: string;
  Next?: string;
  Default?: string;
  Choices?: { Next: string }[];
  Catch?: { Next: string; ErrorEquals: string[] }[];
  TimeoutSecondsPath?: string;
}

const asl = JSON.parse(readFileSync(new URL("../statemachines/dose-escalation.asl.json", import.meta.url), "utf8")) as {
  StartAt: string;
  States: Record<string, AslState>;
};

describe("dose escalation state machine", () => {
  const targets = (state: AslState) => [
    state.Next,
    state.Default,
    ...(state.Choices ?? []).map((c) => c.Next),
    ...(state.Catch ?? []).map((c) => c.Next),
  ].filter((t): t is string => Boolean(t));

  it("has no dangling or unreachable states", () => {
    const names = new Set(Object.keys(asl.States));
    const reached = new Set(Object.values(asl.States).flatMap(targets));
    expect([...reached].filter((t) => !names.has(t))).toEqual([]);
    expect([...names].filter((n) => n !== asl.StartAt && !reached.has(n))).toEqual([]);
  });

  it("bounds every human wait with a timeout that demo speed can scale", () => {
    const waits = Object.entries(asl.States).filter(([, s]) => JSON.stringify(s).includes("waitForTaskToken"));
    expect(waits.map(([name]) => name).sort()).toEqual(["AlertFamilyMember", "AlertWholeFamily", "NudgeParent", "RemindParent"]);
    for (const [, state] of waits) {
      expect(state.TimeoutSecondsPath).toMatch(/^\$\.ladder\.timings\./);
      expect(state.Catch?.some((c) => c.ErrorEquals.includes("States.Timeout"))).toBe(true);
    }
  });

  it("treats a lost race on the dose status as success, not failure", () => {
    for (const name of ["MarkEscalating", "MarkUnresolved"]) {
      expect(asl.States[name]?.Catch?.[0]?.ErrorEquals).toEqual(["DynamoDB.ConditionalCheckFailedException"]);
    }
  });
});

describe("DoseCircleStack", () => {
  let template: Template;

  beforeAll(() => {
    // Skip Lambda bundling in unit tests; `pnpm synth` exercises it.
    const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
    const stack = new DoseCircleStack(app, "Test", {
      env: { account: "111111111111", region: "ap-south-1" },
      appOrigin: "https://example.test",
      ssmPrefix: "/dosecircle",
    });
    template = Template.fromStack(stack);
  });

  it("runs every function on Node.js 24, arm64", () => {
    const functions = template.findResources("AWS::Lambda::Function");
    for (const fn of Object.values(functions)) {
      expect(fn.Properties.Runtime).toBe("nodejs24.x");
      expect(fn.Properties.Architectures).toEqual(["arm64"]);
    }
  });

  it("sets log retention on every log group", () => {
    for (const group of Object.values(template.findResources("AWS::Logs::LogGroup"))) {
      expect(group.Properties.RetentionInDays).toBe(14);
    }
  });

  it("uses a standard workflow and TTL on the table", () => {
    template.hasResourceProperties("AWS::StepFunctions::StateMachine", { StateMachineType: "STANDARD" });
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
    });
  });

  it("keeps prescription images private and short-lived", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      LifecycleConfiguration: { Rules: [Match.objectLike({ ExpirationInDays: 7, Prefix: "rx/" })] },
    });
  });

  it("gives the browser client no secret and uses the Essentials plan", () => {
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", { GenerateSecret: false });
    template.hasResourceProperties("AWS::Cognito::UserPool", { UserPoolTier: "ESSENTIALS" });
  });

  it("throttles the API per route", () => {
    template.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      DefaultRouteSettings: { ThrottlingRateLimit: 20, ThrottlingBurstLimit: 40 },
      RouteSettings: { "POST /push/receipt": { ThrottlingRateLimit: 20, ThrottlingBurstLimit: 40 } },
    });
  });
});
