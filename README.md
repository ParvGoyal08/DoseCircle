# DoseCircle

**When a parent misses their medicine, the right person in the family knows.**

An elderly parent in another city takes daily medicines. If a dose isn't confirmed, the app works out whether the reminder actually reached their phone, then alerts family members one at a time. The first person to tap **"I'll handle it"** claims it, and everyone else is told to stand down.

Built for WeMakeDevs × AWS **First Commit** (Bharat Builds Tour), 17–20 September 2026.

> Reminders and family alerts only. This app does not give medical advice.

## Status

| Area | State |
|---|---|
| Domain rules (statuses, ladder timings, prescription shorthand, refill maths, report) | ✅ Built and unit-tested |
| Escalation workflow (Step Functions definition + Lambdas for remind, nudge, alert, claim, Taken, delivery receipts) | ✅ Built, synthesises; not yet deployed |
| Infrastructure (CDK: DynamoDB, S3, Cognito, HTTP API, Scheduler group, Step Functions) | ✅ Synthesises offline; not yet deployed |
| Web app, demo mode, prescription photo, voice, doctor report | ⏳ Next |

## Architecture

```
EventBridge Scheduler (Asia/Kolkata) ──StartExecution──► Step Functions "DoseEscalation"
                                                             │
         ┌───────────────────────────────────────────────────┤ waitForTaskToken
         ▼                                                   ▼
  Lambda: remind parent (web push)          Lambda: alert family member n (web push)
         │                                                   │
  service worker receipt ──► API ──► DynamoDB (deliveredAt)  │
         │                                                   │
  parent taps Taken ──► API ──► SendTaskSuccess     family taps "I'll handle it" ──► conditional write ──► SendTaskSuccess
```

- **Missed vs offline:** if the phone never acknowledged the reminder, the family is told the phone seems offline, not that the dose was missed.
- **Critical medicines** and repeat misses take a faster escalation ladder.
- **Races converge:** every status change is a DynamoDB conditional write, and a workflow step that finds the dose already resolved completes itself.

Why each service, and what it costs, is in [`docs/`](docs/) as it is written.

## Repository

| Path | What |
|---|---|
| `shared/` | Pure domain logic shared by backend and web (no AWS) |
| `shared/i18n/` | UI and notification strings. English is the source; other languages ship only after native-speaker review. |
| `backend/` | Lambda handlers, authorizer, scripts |
| `infra/` | AWS CDK app and the state machine definition |
| `web/` | React PWA (coming next) |
| `docs/` | Learning log, architecture and cost notes |

## Develop

Requires Node.js ≥ 20.18.1 and pnpm.

```bash
pnpm install
pnpm test        # all unit tests
pnpm typecheck
pnpm synth       # synthesise the CloudFormation template (bundles every Lambda)
```

## Deploy (Mumbai, ap-south-1)

```bash
aws configure sso                                    # profile "dosecircle", region ap-south-1
pnpm --filter @dosecircle/infra exec cdk bootstrap aws://<ACCOUNT_ID>/ap-south-1 --profile dosecircle
AWS_PROFILE=dosecircle pnpm secrets:init -- you@example.com
pnpm cdk:deploy --profile dosecircle --context sesFromEmail=<sender> --context appOrigin=<web origin>
```

## AI tools used

Claude Code (Anthropic) assisted with planning and code. Listed here as the hackathon rules require.

## Licence

MIT. See [LICENSE](LICENSE).
