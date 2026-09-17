import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { readdirSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { DoseCircleStack } from "../lib/dosecircle-stack.js";
import { DEMO_ROUTE_KEYS, FAMILY_ROUTE_KEYS, PARENT_ROUTE_KEYS } from "../lib/routes.js";

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

  it("stores one strictly validated Cedar policy per file", () => {
    template.hasResourceProperties("AWS::VerifiedPermissions::PolicyStore", { ValidationSettings: { Mode: "STRICT" } });
    const policies = Object.values(template.findResources("AWS::VerifiedPermissions::Policy"));
    const files = readdirSync(new URL("../../cedar/policies/", import.meta.url)).filter((f) => f.endsWith(".cedar"));
    expect(policies).toHaveLength(files.length);
    expect(policies.map((p) => p.Properties.Definition.Static.Description).sort()).toEqual(files.map((f) => f.replace(".cedar", "")).sort());
  });

  it("lets API functions call Verified Permissions", () => {
    const statements = Object.values(template.findResources("AWS::IAM::Policy")).flatMap((p) => p.Properties.PolicyDocument.Statement);
    expect(statements.some((s: { Action: string | string[] }) => [s.Action].flat().includes("verifiedpermissions:IsAuthorized"))).toBe(true);
  });

  it("throttles the API per route, strictest on public routes", () => {
    template.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      DefaultRouteSettings: { ThrottlingRateLimit: 20, ThrottlingBurstLimit: 40 },
      RouteSettings: Match.objectLike({
        "POST /push/receipt": { ThrottlingRateLimit: 20, ThrottlingBurstLimit: 40 },
        "POST /parent/pair": { ThrottlingRateLimit: 1, ThrottlingBurstLimit: 2 },
        "POST /demo/sessions": { ThrottlingRateLimit: 2, ThrottlingBurstLimit: 5 },
      }),
    });
    // Every throttled route must exist, or CloudFormation rejects the stage.
    const stage = Object.values(template.findResources("AWS::ApiGatewayV2::Stage"))[0]!;
    const routeKeys = Object.values(template.findResources("AWS::ApiGatewayV2::Route")).map((r) => r.Properties.RouteKey);
    for (const key of Object.keys(stage.Properties.RouteSettings)) expect(routeKeys).toContain(key);
  });

  it("serves exactly the routes each backend router handles", () => {
    const routerKeys = (file: string, name: string) => {
      const source = readFileSync(new URL(`../../backend/src/api/${file}`, import.meta.url), "utf8");
      const block = source.slice(source.indexOf(`export const ${name}`));
      return [...block.slice(0, block.indexOf("} as const")).matchAll(/"((?:GET|POST|PUT|PATCH|DELETE) [^"]+)"/g)].map((m) => m[1]).sort();
    };
    expect([...FAMILY_ROUTE_KEYS].sort()).toEqual(routerKeys("family/index.ts", "FAMILY_ROUTES"));
    expect([...PARENT_ROUTE_KEYS].sort()).toEqual(routerKeys("parent/index.ts", "PARENT_ROUTES"));
    expect([...DEMO_ROUTE_KEYS].sort()).toEqual(routerKeys("demo/index.ts", "DEMO_ROUTES"));
  });

  it("leaves only pairing, demo start and signed receipts without an authorizer", () => {
    const routes = Object.values(template.findResources("AWS::ApiGatewayV2::Route")).map((r) => r.Properties);
    const open = routes.filter((r) => (r.AuthorizationType ?? "NONE") === "NONE").map((r) => r.RouteKey).sort();
    expect(open).toEqual(["POST /demo/sessions", "POST /parent/pair", "POST /push/receipt"]);
    for (const route of routes.filter((r) => FAMILY_ROUTE_KEYS.includes(r.RouteKey) || r.RouteKey === "POST /doses/{doseId}/claim")) {
      expect(route.AuthorizationType).toBe("JWT");
    }
    for (const route of routes.filter((r) => r.RouteKey.includes(" /demo/") && r.RouteKey !== "POST /demo/sessions")) {
      expect(route.AuthorizationType).toBe("CUSTOM");
    }
  });

  it("scopes schedule management to the dose schedule group", () => {
    const statements = Object.values(template.findResources("AWS::IAM::Policy")).flatMap((p) => p.Properties.PolicyDocument.Statement) as { Action: string | string[]; Resource: unknown }[];
    const scheduler = statements.filter((s) => [s.Action].flat().some((a) => a.startsWith("scheduler:")));
    expect(scheduler.length).toBeGreaterThan(0);
    for (const statement of scheduler) expect(JSON.stringify(statement.Resource)).toContain("-doses/*");
    expect(statements.some((s) => [s.Action].flat().includes("iam:PassRole"))).toBe(true);
  });
});
