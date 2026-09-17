# Learning log

Three lines a day: what was new, what broke, how we fixed it. This becomes the "What we learned" section of the submission and the Builder Center blog.

## Thursday 17 September

**New**
- Step Functions `waitForTaskToken`: a workflow step can wait for a human. Waiting on a Standard workflow is free; it is billed per state transition, so a 20-minute wait for a parent to tap "Taken" costs nothing extra.
- EventBridge Scheduler can start a Step Functions execution directly with a templated target, no Lambda in between.
- AWS has no Kannada text-to-speech. Amazon Polly's only Indian voices are Hindi and Indian English, so Kannada voice clips must be recorded by native speakers.
- Claude on Bedrock is only reachable from Mumbai through the Global cross-Region inference profile, which can process requests outside India.
- Lambda `nodejs20.x` has been deprecated since 30 April 2026; we use `nodejs24.x` on arm64.

**What fought back**
- A CloudFormation dependency cycle: the state machine referenced the notify Lambda, and the Lambda's permission to complete tasks referenced the state machine. Fixed by giving the state machine a fixed name and building the permission's ARN from that name.
- API Gateway per-route throttles silently used the wrong key casing. CDK passes `routeSettings` to CloudFormation unchanged, so the keys must be `ThrottlingRateLimit`, not `throttlingRateLimit`. A unit test on the synthesised template caught it.
- Running the CDK app without the CLI skips `cdk.json` context, so the app now has explicit defaults.

**Domain detail we didn't know**
- Indian prescriptions write durations as `5/7` (5 days), `2/52` (2 weeks) and `1/12` (1 month), and doses as `1-0-1` (morning–afternoon–night). We map these with a fixed, tested lookup table instead of asking the AI model to interpret them.
