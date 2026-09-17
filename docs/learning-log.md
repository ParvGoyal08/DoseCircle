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

## Thursday 17 September, later

**New**
- **Amazon Verified Permissions returns the policies that decided a request.** We record those ids on the
  dose event, so the app can tell a family member *why* they were allowed to claim a dose. Authorization
  became a feature, not just a gate.
- **Amplify Hosting can be driven entirely from the CLI**: `create-deployment` hands back a signed URL, you
  `PUT` a zip of `dist` to it, then `start-deployment`. No GitHub authorisation needed, which also means the
  deploy script works for anyone who clones the repo.
- **Web push needs the service worker registered by hand** when `vite-plugin-pwa` runs with
  `injectRegister: false`. We had shipped a service worker that nothing ever registered, so reminders would
  have failed silently in production. Found while making the local preview's buttons work.
- **Browsers can replace a push subscription at any time**, and the old endpoint just goes dead. The service
  worker gets a `pushsubscriptionchange` event but has no credentials to call our API with, so the app
  re-checks its subscription on every launch instead.
- **Intl does the grammar we were about to get wrong.** `Intl.NumberFormat` with `style: "unit"` renders
  "10 ನಿಮಿಷ" and "10 मिनट" correctly, so numbers never have to be spliced into a translated sentence.

**What fought back**
- **Turmeric yellow is unreadable as text.** #F4B400 is 1.85:1 on white, far below the 4.5:1 floor. The whole
  palette had to be rebuilt so haldi is only ever a fill behind near-black text, which measures 9.6:1.
- **Tree-shaking three.js barely helps.** While costing a possible 3D feature we measured 135 KB gzipped for a
  minimal three.js import, versus 268 KB for the entire current app. Good to know before promising it.
- **A development-only mock must be excluded deliberately.** Guarding it with a constant wasn't enough; the
  bundler still emitted the chunk until the dynamic import itself was wrapped in `import.meta.env.DEV`.

**Domain detail we didn't know**
- **Irregular dose timing predicts missed doses:** in pill-bottle monitoring, the people whose dose times
  varied most were 9.3× more likely to fall below 95% of doses taken. That turned "when did she take it"
  from a nice-to-have chart into one of the dashboard's main signals.
- **80% is the accepted line for good adherence** (Pharmacy Quality Alliance), so the trend chart draws it.
- **An offline phone is not a missed dose.** Keeping those two apart, end to end, changes what the family is
  told, what the doctor report says, and what the adherence number means.
