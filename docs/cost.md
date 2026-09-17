# Cost

Mumbai (ap-south-1) prices, on-demand, no reservations. Two numbers matter: what one parent costs per month,
and the fixed cost of running the service at all.

## Per parent, per month

Assume 3 reminder times a day, 90 doses a month, of which about 10 escalate to the family.

| What | Amount | Unit price | Cost |
|---|---|---|---|
| Step Functions state transitions | ~720 for doses taken on time (8 each) + ~200 for escalations (~20 each) ≈ **920** | $0.0285 per 1,000 | **$0.026** |
| Verified Permissions `IsAuthorized` | ~300 (taps, dashboard views) | $0.000005 each | $0.0015 |
| DynamoDB writes | ~900 | $0.71 per million | $0.0006 |
| API Gateway requests | ~300 | $1.05 per million | $0.0003 |
| Lambda invocations | ~750, 256 MB, short | mostly free tier | ≈$0.0002 |
| EventBridge Scheduler | 90 invocations | 14M free per month | $0 |
| Web push | 90 notifications | free (browser push services) | $0 |

**About $0.03, or roughly ₹2.5, per parent per month.** The waiting itself is free: a Standard workflow is
billed per step, not per minute, so a 20-minute wait for a tap adds nothing.

## Per prescription photo

| What | Cost |
|---|---|
| Textract `DetectDocumentText`, 1 page | $0.0015 |
| Claude Sonnet 4.6: ~3.6k input tokens (photo + OCR lines + prompt) at $3/M, ~700 output at $15/M | ~$0.021 |
| Bedrock Guardrail on the model's notes only | a fraction of a cent |

**About $0.023 (₹2) per prescription**, and only when a family uploads one.

## Fixed monthly cost

| What | Cost |
|---|---|
| CloudWatch custom metrics: the app publishes ~23 metric names; 10 are free | ~$3.90 |
| CloudWatch dashboard (3 free) and 7 alarms (10 free) | $0 |
| Logs, 14-day retention, low volume | cents |
| DynamoDB storage, first 25 GB free | $0 |
| Cognito, Essentials plan, 10,000 monthly active users free | $0 |
| Amplify Hosting, small build and traffic | free tier, then cents |
| SSM standard parameters, SNS alarm emails, Budgets | $0 |

**Roughly $4 a month**, dominated by custom metrics. If that mattered, the honest fix is to publish fewer
metric names rather than sample them; the dose funnel could be five names instead of twenty-three.

## For the hackathon itself

Judging traffic is negligible: each demo session is one fictional family with a 2-hour TTL, capped at 20
doses per session and 300 sessions a day. Building, deploying and judging should total **well under $10**,
against the $25 budget the stack creates. The budget emails at 50%, 80% and a forecast 100%.

## Deliberate cost choices

- **One workflow per dose, not a polling loop.** Polling every minute would cost far more in invocations and
  transitions than an execution that sleeps for free.
- **Scheduler starts Step Functions directly,** so there is no Lambda hop per dose.
- **`DetectDocumentText`, not Textract's form or query APIs,** which cost several times more and answer a
  question we don't need to ask.
- **One Bedrock call per prescription,** with the photo and OCR lines together, rather than a call per line.
- **Voice clips generated once at build time** and served as static files, instead of calling Polly per
  reminder.
- **Web push instead of SMS,** which in India also needs TRAI DLT registration.
