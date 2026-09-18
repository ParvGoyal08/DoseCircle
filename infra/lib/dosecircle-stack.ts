import { ArnFormat, CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { CorsHttpMethod, CfnRoute, CfnStage, HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaAuthorizer, HttpLambdaResponseType, HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { AccountRecovery, FeaturePlan, UserPool, UserPoolEmail } from "aws-cdk-lib/aws-cognito";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { CfnPolicy, CfnPolicyStore } from "aws-cdk-lib/aws-verifiedpermissions";
import { readdirSync, readFileSync } from "node:fs";
import { Effect, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import type { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { BlockPublicAccess, Bucket, BucketEncryption, EventType, HttpMethods } from "aws-cdk-lib/aws-s3";
import { CfnScheduleGroup } from "aws-cdk-lib/aws-scheduler";
import { CfnGuardrail, CfnGuardrailVersion } from "aws-cdk-lib/aws-bedrock";
import { LambdaDestination } from "aws-cdk-lib/aws-s3-notifications";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { DefinitionBody, LogLevel, StateMachine, StateMachineType } from "aws-cdk-lib/aws-stepfunctions";
import type { Construct } from "constructs";
import { fileURLToPath } from "node:url";
import { doseCircleFunction } from "./functions.js";
import { Observability } from "./observability.js";
import { DEMO_ROUTE_KEYS, FAMILY_ROUTE_KEYS, PARENT_ROUTE_KEYS } from "./routes.js";

export interface DoseCircleStackProps extends StackProps {
  /** Public origin of the web app (Amplify URL), used for CORS and notification links. */
  appOrigin: string;
  /** SSM Parameter Store prefix holding VAPID keys and secrets (created by scripts/init-secrets.ts). */
  ssmPrefix: string;
  /** Verified SES sender in ap-south-1. Without it Cognito's default sender allows only 50 emails/day. */
  sesFromEmail?: string;
  /** Bedrock inference profile for prescription reading. Only Global profiles serve Claude from Mumbai. */
  bedrockModelId?: string;
  /** Receives alarm and budget emails. */
  alarmEmail?: string;
}

export class DoseCircleStack extends Stack {
  constructor(scope: Construct, id: string, props: DoseCircleStackProps) {
    super(scope, id, props);

    // ── Data ────────────────────────────────────────────────────────────────
    const table = new Table(this, "Table", {
      partitionKey: { name: "PK", type: AttributeType.STRING },
      sortKey: { name: "SK", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    // Users → memberships, and parent → devices.
    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: AttributeType.STRING },
    });
    // Sparse index of doses that are currently escalating, per family.
    table.addGlobalSecondaryIndex({
      indexName: "GSI2",
      partitionKey: { name: "GSI2PK", type: AttributeType.STRING },
      sortKey: { name: "GSI2SK", type: AttributeType.STRING },
    });

    const prescriptions = new Bucket(this, "Prescriptions", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ prefix: "rx/", expiration: Duration.days(7) }],
      cors: [{ allowedMethods: [HttpMethods.POST], allowedOrigins: [props.appOrigin], allowedHeaders: ["*"], maxAge: 3000 }],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ── Family sign-in ──────────────────────────────────────────────────────
    const userPool = new UserPool(this, "Family", {
      featurePlan: FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      passwordPolicy: { minLength: 10, requireSymbols: false },
      email: props.sesFromEmail
        ? UserPoolEmail.withSES({ fromEmail: props.sesFromEmail, fromName: "DoseCircle", sesRegion: "ap-south-1" })
        : UserPoolEmail.withCognito(),
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const webClient = userPool.addClient("Web", {
      generateSecret: false, // browser clients must not have a secret
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
    });

    // ── Authorization: Cedar policies in Amazon Verified Permissions ─────────
    // The same schema and policy files are validated and scenario-tested offline (backend/test/cedar.test.ts).
    const cedarDir = new URL("../../cedar/", import.meta.url);
    const policyStore = new CfnPolicyStore(this, "Authorization", {
      description: "DoseCircle family access rules",
      validationSettings: { mode: "STRICT" },
      schema: { cedarJson: JSON.stringify(JSON.parse(readFileSync(new URL("schema.json", cedarDir), "utf8"))) },
    });
    const policyNames: Record<string, string> = {};
    for (const file of readdirSync(new URL("policies/", cedarDir)).filter((f) => f.endsWith(".cedar")).sort()) {
      const name = file.replace(/\.cedar$/, "");
      const statement = readFileSync(new URL(`policies/${file}`, cedarDir), "utf8");
      const policy = new CfnPolicy(this, `Policy-${name}`, {
        policyStoreId: policyStore.attrPolicyStoreId,
        definition: { static: { statement, description: name } },
      });
      policyNames[name] = policy.attrPolicyId;
    }
    // Lambdas map Verified Permissions policy ids back to readable names for logs and the timeline.
    const policyNamesById = Stack.of(this).toJsonString(Object.fromEntries(Object.entries(policyNames).map(([name, id]) => [id, name])));
    const isAuthorized = new PolicyStatement({ actions: ["verifiedpermissions:IsAuthorized"], resources: [policyStore.attrArn] });

    // ── Shared function settings ────────────────────────────────────────────
    const baseEnv = {
      TABLE_NAME: table.tableName,
      SSM_PREFIX: props.ssmPrefix,
      APP_ORIGIN: props.appOrigin,
      POLICY_STORE_ID: policyStore.attrPolicyStoreId,
      POLICY_NAMES: policyNamesById,
    };
    const ssmRead = new PolicyStatement({
      actions: ["ssm:GetParameter"],
      resources: [this.formatArn({ service: "ssm", resource: "parameter", resourceName: props.ssmPrefix.replace(/^\//, "") + "/*" })],
    });
    const kmsViaSsm = new PolicyStatement({
      actions: ["kms:Decrypt"],
      resources: ["*"],
      conditions: { StringEquals: { "kms:ViaService": `ssm.${this.region}.amazonaws.com` } },
    });
    const withSecrets = (fn: NodejsFunction) => {
      fn.addToRolePolicy(ssmRead);
      fn.addToRolePolicy(kmsViaSsm);
      return fn;
    };

    // ── Escalation workflow ─────────────────────────────────────────────────
    const prepareDose = doseCircleFunction(this, "PrepareDose", "workflow/prepare-dose.ts", { environment: baseEnv });
    const parkAndNotify = withSecrets(doseCircleFunction(this, "ParkAndNotify", "workflow/park-and-notify.ts", { environment: baseEnv, timeout: Duration.seconds(20) }));
    const notifyResolution = withSecrets(doseCircleFunction(this, "NotifyResolution", "workflow/notify-resolution.ts", { environment: baseEnv, timeout: Duration.seconds(20) }));
    table.grantReadWriteData(prepareDose);
    table.grantReadWriteData(parkAndNotify);
    table.grantReadWriteData(notifyResolution);

    const stateMachineName = `${this.stackName}-DoseEscalation`;
    const stateMachine = new StateMachine(this, "DoseEscalation", {
      stateMachineName,
      stateMachineType: StateMachineType.STANDARD,
      definitionBody: DefinitionBody.fromFile(fileURLToPath(new URL("../statemachines/dose-escalation.asl.json", import.meta.url))),
      definitionSubstitutions: {
        PrepareDoseFunctionArn: prepareDose.functionArn,
        ParkFunctionArn: parkAndNotify.functionArn,
        NotifyResolutionFunctionArn: notifyResolution.functionArn,
        TableName: table.tableName,
      },
      tracingEnabled: true,
      logs: {
        destination: new LogGroup(this, "DoseEscalationLogs", { retention: RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
        level: LogLevel.ERROR,
        includeExecutionData: false,
      },
    });
    prepareDose.grantInvoke(stateMachine);
    parkAndNotify.grantInvoke(stateMachine);
    notifyResolution.grantInvoke(stateMachine);
    table.grant(stateMachine, "dynamodb:GetItem", "dynamodb:UpdateItem");
    // Taken and claim complete waiting tasks; park-and-notify completes its own token after a race.
    // The ARN is built from the fixed name, not a reference: the state machine already references
    // this function, so a reference back would create a CloudFormation dependency cycle.
    const taskResponse = new PolicyStatement({
      actions: ["states:SendTaskSuccess", "states:SendTaskFailure", "states:SendTaskHeartbeat"],
      resources: [this.formatArn({ service: "states", resource: "stateMachine", resourceName: stateMachineName, arnFormat: ArnFormat.COLON_RESOURCE_NAME })],
    });
    parkAndNotify.addToRolePolicy(taskResponse);

    // ── EventBridge Scheduler: one schedule per parent time slot starts the workflow directly ──
    const scheduleGroup = new CfnScheduleGroup(this, "DoseSchedules", { name: `${this.stackName.toLowerCase()}-doses` });
    const schedulerDlq = new Queue(this, "SchedulerDeadLetters", { retentionPeriod: Duration.days(14) }); // standard queue: FIFO is not supported
    const schedulerRole = new Role(this, "SchedulerRole", { assumedBy: new ServicePrincipal("scheduler.amazonaws.com") });
    stateMachine.grantStartExecution(schedulerRole);
    schedulerDlq.grantSendMessages(schedulerRole);

    // ── Prescription reading: Textract (Mumbai) → Claude via Bedrock → Guardrail (Classic tier, Mumbai) ──
    const guardrail = new CfnGuardrail(this, "NoMedicalAdvice", {
      name: `${this.stackName}-no-medical-advice`,
      description: "Keeps the prescription reader's free-text notes to transcription problems only.",
      blockedInputMessaging: "This note was removed.",
      blockedOutputsMessaging: "This note was removed.",
      topicPolicyConfig: {
        // Classic tier keeps processing in ap-south-1. It is English-only, which is fine: only the
        // model's English notes are screened, and users only ever see reviewed fixed strings otherwise.
        topicsTierConfig: { tierName: "CLASSIC" },
        topicsConfig: [
          {
            name: "MedicalAdvice",
            type: "DENY",
            definition: "Advice or opinions about taking, changing, stopping, combining or dosing medicines, or about diagnoses, symptoms or treatment.",
            examples: [
              "You should take two tablets instead of one.",
              "This dose seems too high for an elderly patient.",
              "Stop this medicine if you feel dizzy.",
              "These two medicines should not be taken together.",
              "Metformin is used to treat diabetes.",
            ],
          },
        ],
      },
      contentPolicyConfig: {
        contentFiltersTierConfig: { tierName: "CLASSIC" },
        filtersConfig: ["HATE", "INSULTS", "SEXUAL", "VIOLENCE", "MISCONDUCT"].map((type) => ({ type, inputStrength: "HIGH", outputStrength: "HIGH" })),
      },
    });
    const guardrailVersion = new CfnGuardrailVersion(this, "NoMedicalAdviceVersion", {
      guardrailIdentifier: guardrail.attrGuardrailId,
      description: "Deployed with the stack",
    });

    const inferenceProfileId = props.bedrockModelId ?? "global.anthropic.claude-sonnet-4-6";
    const foundationModelId = inferenceProfileId.replace(/^global\./, "");
    const inferenceProfileArn = this.formatArn({ service: "bedrock", resource: "inference-profile", resourceName: inferenceProfileId });
    const extractor = doseCircleFunction(this, "ExtractPrescription", "ai/extract-prescription.ts", {
      environment: { ...baseEnv, BEDROCK_MODEL_ID: inferenceProfileId, GUARDRAIL_ID: guardrail.attrGuardrailId, GUARDRAIL_VERSION: guardrailVersion.attrVersion },
      timeout: Duration.seconds(90),
      memorySize: 512,
    });
    table.grantReadWriteData(extractor);
    prescriptions.grantRead(extractor, "rx/*");
    extractor.addToRolePolicy(new PolicyStatement({ actions: ["textract:DetectDocumentText"], resources: ["*"] }));
    // Global cross-Region inference needs three statements: the profile, the in-Region model reached
    // through that profile, and the Region-less global model ARN.
    extractor.addToRolePolicy(new PolicyStatement({ actions: ["bedrock:InvokeModel"], resources: [inferenceProfileArn] }));
    extractor.addToRolePolicy(
      new PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [`arn:${this.partition}:bedrock:${this.region}::foundation-model/${foundationModelId}`],
        conditions: { StringLike: { "bedrock:InferenceProfileArn": inferenceProfileArn } },
      }),
    );
    extractor.addToRolePolicy(
      new PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [`arn:${this.partition}:bedrock:::foundation-model/${foundationModelId}`],
        conditions: { StringEquals: { "aws:RequestedRegion": "unspecified" }, StringLike: { "bedrock:InferenceProfileArn": inferenceProfileArn } },
      }),
    );
    extractor.addToRolePolicy(new PolicyStatement({ actions: ["bedrock:ApplyGuardrail"], resources: [guardrail.attrGuardrailArn] }));
    // Bedrock checks the account's Marketplace subscription for an Anthropic model on the calling
    // role, not just at first use, and answers "Model access is denied ... required AWS Marketplace
    // actions" without them. A deployed extraction failed exactly this way once the cached
    // subscription lapsed, so it is the role's permission rather than a one-time setup step.
    // These actions take no resource ARN.
    extractor.addToRolePolicy(
      new PolicyStatement({ actions: ["aws-marketplace:ViewSubscriptions", "aws-marketplace:Subscribe"], resources: ["*"] }),
    );
    // Only the full-size upload starts extraction; nothing is ever written back under rx/, so it cannot loop.
    prescriptions.addEventNotification(EventType.OBJECT_CREATED, new LambdaDestination(extractor), { prefix: "rx/", suffix: "original.jpg" });

    // ── HTTP API ────────────────────────────────────────────────────────────
    const deviceOrDemoAuthorizerFn = withSecrets(doseCircleFunction(this, "DeviceDemoAuthorizer", "authorizers/device-demo.ts", { environment: baseEnv }));
    table.grantReadData(deviceOrDemoAuthorizerFn);
    const deviceOrDemo = new HttpLambdaAuthorizer("DeviceOrDemo", deviceOrDemoAuthorizerFn, {
      responseTypes: [HttpLambdaResponseType.SIMPLE],
      identitySource: ["$request.header.Authorization", "$context.routeKey"],
      resultsCacheTtl: Duration.minutes(5),
    });
    const family = new HttpUserPoolAuthorizer("Family", userPool, { userPoolClients: [webClient] });

    const api = new HttpApi(this, "Api", {
      corsPreflight: {
        allowOrigins: [props.appOrigin],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PUT, CorsHttpMethod.PATCH, CorsHttpMethod.DELETE],
        allowHeaders: ["authorization", "content-type"],
        maxAge: Duration.hours(1),
      },
    });

    const apiEnv = {
      ...baseEnv,
      STATE_MACHINE_ARN: stateMachine.stateMachineArn,
      SCHEDULE_GROUP: scheduleGroup.name!,
      SCHEDULER_ROLE_ARN: schedulerRole.roleArn,
      SCHEDULER_DLQ_ARN: schedulerDlq.queueArn,
      PRESCRIPTIONS_BUCKET: prescriptions.bucketName,
    };
    const apiFunction = (id: string, entry: string, timeout = Duration.seconds(10)) => {
      const fn = withSecrets(doseCircleFunction(this, id, entry, { environment: apiEnv, timeout }));
      table.grantReadWriteData(fn);
      fn.addToRolePolicy(isAuthorized);
      return fn;
    };
    type Authorizer = HttpLambdaAuthorizer | HttpUserPoolAuthorizer | undefined;
    const addRoutes = (fn: NodejsFunction, routes: Record<string, Authorizer>) => {
      const integration = new HttpLambdaIntegration(`${fn.node.id}Integration`, fn);
      for (const [routeKey, authorizer] of Object.entries(routes)) {
        const [method, path] = routeKey.split(" ") as [HttpMethod, string];
        api.addRoutes({ path, methods: [method], integration, authorizer });
      }
    };

    // Taken and claim complete the waiting workflow task, so they get their own small functions.
    const taken = apiFunction("Taken", "api/parent/taken.ts");
    taken.addToRolePolicy(taskResponse);
    addRoutes(taken, { "POST /parent/doses/{doseId}/taken": deviceOrDemo, "POST /demo/doses/{doseId}/taken": deviceOrDemo });

    const claim = apiFunction("Claim", "api/family/claim.ts");
    claim.addToRolePolicy(taskResponse);
    addRoutes(claim, { "POST /doses/{doseId}/claim": family, "POST /demo/doses/{doseId}/claim": deviceOrDemo });

    // Receipts are signed with an HMAC inside the push payload, so there is no auth header.
    addRoutes(apiFunction("PushReceipt", "api/push/receipt.ts"), { "POST /push/receipt": undefined });

    // Family app: sign-in with Cognito. Keys must match FAMILY_ROUTES (checked in stack.test.ts).
    const familyApi = apiFunction("FamilyApi", "api/family/index.ts", Duration.seconds(20));
    stateMachine.grantStartExecution(familyApi); // "Send a test reminder"
    stateMachine.grantExecution(familyApi, "states:GetExecutionHistory"); // "Why am I seeing this?"
    familyApi.addToRolePolicy(
      new PolicyStatement({
        actions: ["scheduler:CreateSchedule", "scheduler:UpdateSchedule", "scheduler:DeleteSchedule", "scheduler:GetSchedule"],
        resources: [this.formatArn({ service: "scheduler", resource: "schedule", resourceName: `${scheduleGroup.name}/*` })],
      }),
    );
    schedulerRole.grantPassRole(familyApi.grantPrincipal);
    // Presigned uploads and the review image are signed with this function's role.
    prescriptions.grantPut(familyApi, "rx/*");
    prescriptions.grantRead(familyApi, "rx/*");
    addRoutes(
      familyApi,
      Object.fromEntries(FAMILY_ROUTE_KEYS.map((key) => [key, family])),
    );

    // Parent phone: pairing is public (the one-time code is the credential); everything else needs the device token.
    const parentApi = apiFunction("ParentApi", "api/parent/index.ts");
    addRoutes(parentApi, Object.fromEntries(PARENT_ROUTE_KEYS.map((key) => [key, key === "POST /parent/pair" ? undefined : deviceOrDemo])));

    // Judge demo: starting a session is public and capped; the rest needs the demo token.
    const demoApi = apiFunction("DemoApi", "api/demo/index.ts", Duration.seconds(20));
    stateMachine.grantStartExecution(demoApi);
    stateMachine.grantExecution(demoApi, "states:DescribeExecution", "states:StopExecution", "states:GetExecutionHistory");
    addRoutes(demoApi, Object.fromEntries(DEMO_ROUTE_KEYS.map((key) => [key, key === "POST /demo/sessions" ? undefined : deviceOrDemo])));

    // Per-route throttles: CDK's HttpStage only supports stage-wide limits, so set them on the L1 stage.
    const stage = api.defaultStage!.node.defaultChild as CfnStage;
    stage.defaultRouteSettings = { throttlingRateLimit: 20, throttlingBurstLimit: 40 };
    // routeSettings is passed to CloudFormation verbatim, so keys must use CloudFormation's casing.
    stage.routeSettings = {
      "POST /push/receipt": { ThrottlingRateLimit: 20, ThrottlingBurstLimit: 40 },
      // Guessing an 8-character code is hopeless at this rate; invites also expire after 48 hours.
      "POST /parent/pair": { ThrottlingRateLimit: 1, ThrottlingBurstLimit: 2 },
      "POST /demo/sessions": { ThrottlingRateLimit: 2, ThrottlingBurstLimit: 5 },
      "POST /demo/doses": { ThrottlingRateLimit: 5, ThrottlingBurstLimit: 10 },
      "POST /families/{fid}/parents/{pid}/test-dose": { ThrottlingRateLimit: 1, ThrottlingBurstLimit: 2 },
      "POST /families/{fid}/prescriptions": { ThrottlingRateLimit: 1, ThrottlingBurstLimit: 3 },
    };
    // CloudFormation validates every key in routeSettings against the routes that already exist, and
    // it creates the stage and the routes in parallel. Without this the first deploy fails with
    // "Unable to find Route by key ...". CDK does not add the dependency itself, because its own L2
    // stage only supports stage-wide limits.
    for (const route of api.node.findAll().filter((child): child is CfnRoute => child instanceof CfnRoute)) {
      stage.addDependency(route);
    }

    new Observability(this, "Observability", {
      api,
      stateMachine,
      schedulerDeadLetters: schedulerDlq,
      scheduleGroupName: scheduleGroup.name!,
      alarmEmail: props.alarmEmail,
      monthlyBudgetUsd: 25,
    });

    // ── Outputs for the web app's environment ───────────────────────────────
    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: webClient.userPoolClientId });
    new CfnOutput(this, "TableName", { value: table.tableName });
    new CfnOutput(this, "PolicyStoreId", { value: policyStore.attrPolicyStoreId });
    new CfnOutput(this, "PrescriptionsBucket", { value: prescriptions.bucketName });
    new CfnOutput(this, "StateMachineArn", { value: stateMachine.stateMachineArn });
    new CfnOutput(this, "ScheduleGroupName", { value: scheduleGroup.name! });
    new CfnOutput(this, "SchedulerRoleArn", { value: schedulerRole.roleArn });
    new CfnOutput(this, "SchedulerDeadLetterQueueArn", { value: schedulerDlq.queueArn });
    new CfnOutput(this, "GuardrailId", { value: guardrail.attrGuardrailId });
  }
}
