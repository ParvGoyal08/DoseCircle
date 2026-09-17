import { Duration, Stack } from "aws-cdk-lib";
import type { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import { CfnBudget } from "aws-cdk-lib/aws-budgets";
import {
  Alarm,
  ComparisonOperator,
  Dashboard,
  GraphWidget,
  MathExpression,
  Metric,
  SingleValueWidget,
  Stats,
  TextWidget,
  TreatMissingData,
} from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import type { Queue } from "aws-cdk-lib/aws-sqs";
import type { StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";

export interface ObservabilityProps {
  api: HttpApi;
  stateMachine: StateMachine;
  schedulerDeadLetters: Queue;
  scheduleGroupName: string;
  /** Alarm and budget emails go here. Without it, alarms still show on the dashboard. */
  alarmEmail?: string;
  monthlyBudgetUsd: number;
}

/**
 * One CloudWatch dashboard for running the service, 7 alarms (within the 10 free), and a budget.
 * App metrics come from Powertools EMF with only the default `service` dimension, so each name is one
 * custom metric — never per family or per parent.
 */
export class Observability extends Construct {
  constructor(scope: Construct, id: string, props: ObservabilityProps) {
    super(scope, id);
    const stack = Stack.of(this);

    const app = (metricName: string, statistic: string = Stats.SUM, label?: string) =>
      new Metric({ namespace: "DoseCircle", metricName, dimensionsMap: { service: "dosecircle" }, statistic, label, period: Duration.minutes(5) });
    const scheduler = (metricName: string, label: string) =>
      new Metric({ namespace: "AWS/Scheduler", metricName, dimensionsMap: { ScheduleGroup: props.scheduleGroupName }, statistic: Stats.SUM, label, period: Duration.minutes(5) });
    const lambdaAccount = (metricName: string) => new Metric({ namespace: "AWS/Lambda", metricName, statistic: Stats.SUM, period: Duration.minutes(5) });

    const sfnFailed = props.stateMachine.metricFailed({ period: Duration.minutes(5), label: "Failed" });
    const sfnTimedOut = props.stateMachine.metricTimedOut({ period: Duration.minutes(5), label: "Timed out" });
    const api5xx = props.api.metricServerError({ period: Duration.minutes(5), label: "5xx" });
    const dlq = props.schedulerDeadLetters.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5), label: "Dead letters" });

    const dashboard = new Dashboard(this, "Dashboard", { dashboardName: `${stack.stackName}-operations`, defaultInterval: Duration.days(1) });
    dashboard.addWidgets(
      new TextWidget({
        width: 24,
        height: 3,
        markdown: [
          "# DoseCircle operations",
          "A dose reminder is an EventBridge Scheduler schedule starting a Step Functions Standard execution that waits (for free) on task tokens.",
          "**Recurring cost ≈ $0.03 per parent per month** (≈810 state transitions at $0.0285 per 1,000 in Mumbai; Lambda, DynamoDB and web push are within free tiers at this scale).",
        ].join("\n\n"),
      }),
    );
    dashboard.addWidgets(
      new SingleValueWidget({
        title: "Dose funnel (period total)",
        width: 24,
        height: 4,
        setPeriodToTimeRange: true,
        metrics: [
          app("RemindersSent", Stats.SUM, "Reminders sent"),
          app("ReceiptsDelivered", Stats.SUM, "Reached the phone"),
          app("TakenOnTime", Stats.SUM, "Taken on time"),
          app("TakenLate", Stats.SUM, "Taken late"),
          app("EscalationAlerts", Stats.SUM, "Family alerts"),
          app("EscalationsClaimed", Stats.SUM, "Claimed by family"),
        ],
      }),
    );
    dashboard.addWidgets(
      new GraphWidget({
        title: "Push delivery latency (ms)",
        width: 8,
        left: [app("DeliveryLatencyMs", Stats.p(50), "p50"), app("DeliveryLatencyMs", Stats.p(90), "p90")],
      }),
      new GraphWidget({
        title: "Escalation workflow",
        width: 8,
        left: [props.stateMachine.metricStarted({ label: "Started" }), props.stateMachine.metricSucceeded({ label: "Succeeded" }), sfnFailed, sfnTimedOut],
      }),
      new GraphWidget({
        title: "Scheduler",
        width: 8,
        left: [scheduler("InvocationAttemptCount", "Invocations"), scheduler("TargetErrorCount", "Target errors"), dlq],
      }),
    );
    dashboard.addWidgets(
      new GraphWidget({
        title: "API",
        width: 8,
        left: [props.api.metricClientError({ label: "4xx" }), api5xx],
        right: [props.api.metricLatency({ statistic: Stats.p(90), label: "Latency p90 (ms)" })],
      }),
      new GraphWidget({
        title: "Lambda (all functions)",
        width: 8,
        left: [lambdaAccount("Errors"), lambdaAccount("Throttles")],
      }),
      new GraphWidget({
        title: "Cedar authorization (Verified Permissions)",
        width: 8,
        left: [app("AuthzAllowed", Stats.SUM, "Allowed"), app("AuthzDenied", Stats.SUM, "Denied")],
      }),
    );
    dashboard.addWidgets(
      new GraphWidget({
        title: "Prescription reading",
        width: 8,
        left: [app("ExtractionMs", Stats.p(50), "p50 (ms)"), app("ExtractionMs", Stats.p(90), "p90 (ms)")],
      }),
      new GraphWidget({
        title: "Prescriptions",
        width: 8,
        left: [app("PrescriptionsStarted", Stats.SUM, "Started"), app("PrescriptionsConfirmed", Stats.SUM, "Confirmed"), app("ExtractionFailed", Stats.SUM, "Could not read"), app("GuardrailInterventions", Stats.SUM, "Guardrail removed a note")],
      }),
      new GraphWidget({
        title: "Phones and demo",
        width: 8,
        left: [app("PhonesPaired", Stats.SUM, "Phones paired"), app("PushGone", Stats.SUM, "Subscriptions gone"), app("DemoSessions", Stats.SUM, "Demo sessions"), app("DemoRuns", Stats.SUM, "Demo doses")],
      }),
    );

    const topic = new Topic(this, "Alarms", { displayName: "DoseCircle alarms" });
    if (props.alarmEmail) topic.addSubscription(new EmailSubscription(props.alarmEmail));
    const alarm = (id: string, description: string, metric: Metric | MathExpression, threshold: number, evaluationPeriods = 1) => {
      const created = new Alarm(this, id, {
        alarmDescription: description,
        metric,
        threshold,
        evaluationPeriods,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
      });
      created.addAlarmAction(new SnsAction(topic));
      return created;
    };
    alarm("WorkflowFailed", "An escalation workflow failed or timed out: a family may not have been alerted.", new MathExpression({ expression: "failed + timedOut", usingMetrics: { failed: sfnFailed, timedOut: sfnTimedOut }, period: Duration.minutes(5), label: "Failed or timed out" }), 1);
    alarm("SchedulerDeadLetters", "A scheduled dose could not start its workflow.", dlq, 1);
    alarm("SchedulerTargetErrors", "EventBridge Scheduler could not start Step Functions.", scheduler("TargetErrorCount", "Target errors"), 1);
    alarm("Api5xx", "The API is returning server errors.", api5xx, 5);
    alarm("LambdaErrors", "Lambda functions are failing.", lambdaAccount("Errors"), 3);
    alarm("LambdaThrottles", "Lambda is throttling: check the account concurrency quota.", lambdaAccount("Throttles"), 1);
    alarm("ExtractionFailures", "Prescription reading keeps failing (Bedrock access, quota or Textract).", app("ExtractionFailed"), 3);

    // Budgets are global; this one watches the whole account's monthly cost.
    if (props.alarmEmail) {
      new CfnBudget(this, "MonthlyBudget", {
        budget: { budgetName: `${stack.stackName}-monthly`, budgetType: "COST", timeUnit: "MONTHLY", budgetLimit: { amount: props.monthlyBudgetUsd, unit: "USD" } },
        notificationsWithSubscribers: [50, 80, 100].map((threshold) => ({
          notification: { notificationType: threshold === 100 ? "FORECASTED" : "ACTUAL", comparisonOperator: "GREATER_THAN", threshold, thresholdType: "PERCENTAGE" },
          subscribers: [{ subscriptionType: "EMAIL", address: props.alarmEmail! }],
        })),
      });
    }
  }
}
