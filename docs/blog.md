# A reminder that waits for a person: building DoseCircle on Step Functions

*Built for the WeMakeDevs × AWS First Commit hackathon, 17–20 September 2026. Live at https://main.d38ff1sjrywo9e.amplifyapp.com · code at https://github.com/ParvGoyal08/DoseCircle*

## The problem

Millions of parents in India take their medicines alone while their children live in other cities. Reminder apps already exist, and they all do the same thing: they ring. What happens when nobody answers is left to chance. Usually nobody finds out. Sometimes everybody finds out at once, and five worried people call the same person.

We wanted to answer a different question: **if she misses her medicine, does the right person know, and only them?** That became DoseCircle. When a dose isn't confirmed, it checks whether the reminder actually reached her phone. Then it asks the family one at a time, in an order they choose. The first person to tap "I'll handle it" takes the dose on, and everyone else is told to stand down.

The person taking the medicines never creates an account. A family member sets everything up, and her phone joins by scanning a QR code.

## The stack

Everything runs serverless in Mumbai (ap-south-1) and is deployed with the AWS CDK in TypeScript.

![DoseCircle architecture](https://raw.githubusercontent.com/ParvGoyal08/DoseCircle/main/docs/images/architecture.png)

- **EventBridge Scheduler** holds one schedule per person per time of day, in `Asia/Kolkata`, and starts a Step Functions execution directly, with no Lambda in between.
- **Step Functions (Standard)** runs one execution per dose. This is the heart of the app.
- **Lambda** (Node.js 24 on arm64) serves the APIs and the workflow steps, and sends web push notifications.
- **API Gateway HTTP API** accepts Cognito tokens from family members and runs a Lambda authorizer for paired phones.
- **DynamoDB** is a single table. Conditional writes carry most of the correctness.
- **Amazon Verified Permissions** holds 18 Cedar policies that decide who may see, change or claim what.
- **Textract, Claude Sonnet 4.6 on Bedrock and Bedrock Guardrails** turn a photo of a prescription into draft medicines.
- **CloudWatch, X-Ray, SSM Parameter Store and Budgets** keep it observable and cheap.

It costs about **$0.03 (₹2.5) per person per month**.

## The idea that made it work: a workflow that waits for a person

The core of DoseCircle is a state machine called `DoseEscalation`. It starts at the scheduled time, sends the reminder, and then **waits for a human**:

```json
"RemindParent": {
  "Type": "Task",
  "Resource": "arn:aws:states:::lambda:invoke.waitForTaskToken",
  "TimeoutSecondsPath": "$.ladder.timings.parentWaitSeconds",
  "Catch": [{ "ErrorEquals": ["States.Timeout"], "Next": "HasNudge" }]
}
```

The Lambda stores the task token on the dose record and sends the push notification. When she taps "Taken", the API calls `SendTaskSuccess` with that token. If she doesn't tap, the timeout fires and the workflow moves on to a gentle nudge. After that it checks delivery, then asks the family, one person at a time.

Two things surprised us:

1. **Waiting is free.** Standard workflows are billed per state transition, not per second. A 20-minute wait for a tap costs nothing extra, so a whole month of reminders for one person costs under three US cents in Step Functions.
2. **The timeout comes from the input.** `TimeoutSecondsPath` reads the wait from the execution's own data. That let us give critical medicines a faster ladder, and our demo mode a 60× faster one, without a second state machine.

The same workflow also gives us an audit trail for free. The "Why am I seeing this?" screen in the app is built from the execution history, so every alert can explain which step sent it and when.

## "Missed" and "offline" are different facts

If a phone is switched off, the reminder never arrives, and telling the family "she missed her medicine" would be wrong and frightening. So the service worker posts a small delivery receipt the moment a push notification lands, signed with an HMAC because it carries no user session. After the waiting period, a Choice state asks one question: *did the reminder reach the phone?* Yes means a missed dose. No means "her phone seems to be offline".

That single distinction ended up everywhere. It changes the wording of the alert, the doctor report ("unknown", never "missed") and the adherence percentage.

## Two people, one claim

Several family members can see the same alert, and they might tap "I'll handle it" at the same moment. Cedar decides whether each person is *allowed* to claim. DynamoDB decides who *actually* gets it, in one atomic write:

```ts
ConditionExpression:
  "#status = :escalating AND attribute_not_exists(claimedBy) AND contains(alertedMemberIds, :mid)"
```

The first write wins. The second gets a clear "someone else got there first" from the conditional check failure. Only then does the API complete the workflow's task token, and the workflow tells everyone else to stand down.

Verified Permissions also turned out to be more than a gate. It returns the policies that decided each request, so we record them on the dose's timeline. A family member can see *why* they were allowed to act.

## Prescriptions: the model transcribes, code decides

Indian prescriptions have their own shorthand: `1-0-1` (morning, none at noon, night), `BD`, `HS`, `SOS`, and durations like `5/7` (five days). We use Textract to read the lines and Claude Sonnet 4.6 on Bedrock to transcribe each medicine *exactly as written*. The shorthand is then decoded by a fixed lookup table in code, with unit tests, never by the model. A Bedrock Guardrail removes anything resembling advice from the model's free-text notes.

Nothing is saved until a person has ticked every line. Handwritten Indian prescriptions are hard even for the best models, so human confirmation is the feature, not a formality.

One honest trade-off: from Mumbai, Claude is reached through Bedrock's Global cross-Region inference profile, which can process a request outside India. The app says so and asks for consent when a photo is uploaded.

## What fought back

**Bugs that only existed on AWS.** Our first real deploy surfaced four bugs that had passed 173 local tests. The best one: roughly one dashboard request in five hung until the 20-second timeout, with no log line at all. Memory told the story. A warm container climbed 303 → 465 → 627 → 786 → 941 → 1022 MB and then stalled. We were building `Intl.DateTimeFormat` objects inside helpers called for every dose. Each one holds native ICU memory, and because V8's own heap stayed small, garbage collection never felt the pressure. Moving the formatters to module scope fixed it: memory is now flat at 169 MB, and the request dropped from 2.5–6 seconds to 0.25. Raising the memory limit first *looked* like a fix. It just moved the wall.

**An API Gateway stage doesn't wait for its own routes.** Per-route throttles are validated against routes that CloudFormation is still creating in parallel. We now make the stage depend on all 54 routes, and a test asserts it.

**Reserved words hide from mocks.** Our "remove this person" cleanup listed `sub` in a `ProjectionExpression`. DynamoDB rejects that because `sub` is a reserved word, and no local mock enforces the rule. The operation failed safely, before deleting anything, but only real AWS could show us the bug.

**Test data leaked into real numbers.** Families can send a test reminder to check a phone works. An unanswered test was being counted as a missed dose, and worse, it raised the person's miss streak. That streak makes *real* doses escalate faster. The fix was two small changes. Test runs are now excluded from every family-facing number. And a new Choice state skips the streak update when an execution says it's a test:

```json
"IsRealDoseMissed": {
  "Type": "Choice",
  "Choices": [{ "And": [
    { "Variable": "$.prep.dose.countsTowardStreak", "IsPresent": true },
    { "Variable": "$.prep.dose.countsTowardStreak", "BooleanEquals": false } ],
    "Next": "ShouldAlertFamily" }],
  "Default": "IncrementMissStreak"
}
```

The `IsPresent` check matters. Executions already running when we deployed had no flag, and without it this Choice state would have failed them.

**Languages that AWS doesn't speak.** The event was in Bengaluru, so treating Hindi as *the* Indian language would have been wrong. Kannada is first-class in DoseCircle. But Amazon Polly's only Indian voices are Hindi and Indian English, so Kannada voice clips need a native speaker. We also learned not to splice names or numbers into translated sentences: Kannada attaches case endings to them, so every string is a whole sentence. Kannada and Hindi ship clearly labelled as draft translations until a native speaker reviews them.

**The installed app "logged out".** It didn't. The installed web app opened on the marketing page, which to an older user looks exactly like being signed out. It now starts at a small `/app` route that sends each phone to the right screen.

## What we learned

- `waitForTaskToken` plus a timeout is the cleanest way we've found to model "a person has N minutes to respond", and the waiting really is free.
- Conditional writes are where correctness lives. Authorization says who *may* act; the condition decides who *did*.
- Some bugs exist only on real AWS: reserved words, resource creation order, memory behaviour. Deploy early and deploy often.
- Test traffic must be marked as test traffic from the first line of code.
- For health-adjacent software, the most important features are the ones you refuse to build. DoseCircle records blood pressure but never labels it high or low, and it never saves AI output a person hasn't checked.

## Try it

- **Live app:** https://main.d38ff1sjrywo9e.amplifyapp.com
- **Judge demo** (a fictional family, running the real workflow at 60× speed): https://main.d38ff1sjrywo9e.amplifyapp.com/demo
- **Code (MIT):** https://github.com/ParvGoyal08/DoseCircle

*DoseCircle sends reminders and family alerts only. It does not give medical advice.*
