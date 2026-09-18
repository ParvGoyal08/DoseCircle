# Architecture

Everything runs in **ap-south-1 (Mumbai)** and is defined in one CDK stack (`infra/lib/dosecircle-stack.ts`),
deployed as the CloudFormation stack `DoseCircle`. There are 12 Lambda functions, 54 HTTP API routes and one
DynamoDB table (212 resources in the deployed stack).

## The dose loop

1. **EventBridge Scheduler** holds one schedule per parent per time of day (`cron`, `Asia/Kolkata`), created
   and removed by the app whenever medicines or daily checks change (`backend/src/scheduling/sync-slots.ts`).
   The target is Step Functions directly, with no Lambda in between, and a standard SQS dead-letter queue.
2. **Step Functions `DoseEscalation`** (Standard, 33 states) runs one execution per reminder:
   - `PrepareDose` creates the dose row idempotently, keyed by parent and IST minute, so an at-least-once
     schedule delivery cannot create two doses. It re-checks that each medicine in the slot is still active
     and within its end date, and works out which daily checks are due on this weekday.
   - `RemindParent` and `NudgeParent` use `lambda:invoke.waitForTaskToken` with `TimeoutSecondsPath`, so the
     same definition serves real families (20 and 10 minutes) and the demo at 60× speed.
   - `WasReminderDelivered` reads the dose row: a delivery receipt means **missed**, no receipt means
     **phone offline**.
   - `ShouldAlertFamily` is the one branch daily checks added. Medicines always escalate; a check escalates
     only if the family asked it to, so a forgotten weekly weigh-in is recorded (`MarkUnresolvedQuietly`)
     without waking anybody.
   - `AlertFamilyMember` loops down the family's chosen order, then `AlertWholeFamily`.
   - `HowWasItResolved` sends the stand-down or "taken late" notice.
3. **Lambda + HTTP API** handle the taps: a delivery receipt, `Taken`, and `I'll handle it`. Each flips the
   dose status with a conditional write, then calls `SendTaskSuccess` to let the workflow continue. Any
   readings typed on the reminder screen are stored **before** the status flips, so a lost race never loses
   a measurement.
4. **Web push** carries the notifications (VAPID, the `web-push` library). The service worker shows the
   notification and posts the delivery receipt in parallel, before anyone taps anything. A reminder with no
   tablets in it uses a separate set of strings, so it never says "medicine" about a blood-pressure reading.

## Daily checks and readings

A family can ask a parent for a measurement at the same times as a reminder: blood sugar, blood pressure,
weight, oxygen or temperature (`shared/src/checks.ts` holds the field names, units and limits).

- A check rides on the existing slot, so **no new schedule and no new execution**: the cost of asking for a
  reading is one extra DynamoDB write.
- Weekday selection is resolved at dose time, not at schedule time, so "Sundays only" needs no extra cron.
- The wide limits (a systolic of 50–300, a weight of 15–350 kg) exist to catch a slipped finger, and are
  refused with a message rather than silently rounded. **No range in the app is clinical**: nothing decides
  whether a reading is good or bad, no reading raises an alert, and the dashboard and doctor report show the
  numbers with only descriptive statistics (lowest, middle, highest) beside them.
- Readings keep 400 days, longer than doses, because a trend is the thing a doctor asks about.

### Why the waits are free

A Standard workflow is billed per state transition, not per second, so a 20-minute wait for a tap costs
nothing. That is what makes a per-dose workflow affordable (see [cost.md](cost.md)).

### How races converge

- One task token at a time per dose, stored on the dose row.
- Every status change is a conditional write: a claim requires `status = ESCALATING`, no existing claimer,
  and that the claimer was actually alerted.
- A workflow step whose write fails because the dose is already resolved **completes its own token**, so the
  execution always moves on rather than hanging.
- Two simultaneous claims give one `200` and one `409` naming who is handling it.

## Data

One DynamoDB table, on-demand, with two secondary indexes and TTL on `ttl`:

| Item | PK | SK |
|---|---|---|
| Family, member, parent, invite | `FAM#{fid}` / `INVITE#{hash}` | `META`, `MEMBER#{mid}`, `PARENT#{pid}` |
| Medicine, slot, dose, event | `PARENT#{pid}` / `DOSE#{doseId}` | `MED#…`, `SLOT#HHMM`, `DOSE#{stamp}`, `EVT#…` |
| Daily check, reading | `PARENT#{pid}` | `CHECK#{checkId}`, `READING#{iso}#{checkId}` |
| Parent device, push subscription | `DEVICE#{sha256(token)}` / `SUBJ#{id}` | `META`, `SUB#{hash}` |
| Prescription, demo session, rate budget | `FAM#{fid}` / `DEMO#{sid}` / `RATE#{key}` | `RX#{rxId}`, `META` |
| One-family lock per signed-in user | `USER#{sub}` | `FAMILY` |

- **GSI1** maps a Cognito user to their memberships, and a parent to their devices.
- **GSI2** is a sparse index of doses that are currently escalating, per family, so the dashboard reads open
  alerts in one query.
- Reads filter out items whose `ttl` has passed, because DynamoDB can still return expired items.
- Demo data has a 2-hour TTL; real doses keep 120 days for the doctor report and readings keep 400.
- The `USER#{sub}` lock is what makes "one family per person" atomic. Removing someone, or their leaving,
  deletes their lock so they can join or start another family.

## Who is in the family

- An owner can invite people, remove them, and promote or demote anyone. Removing someone deletes their
  membership, their push subscriptions and their one-family lock, and takes them out of every escalation
  order in one write per parent.
- Anybody can leave a family they are in, owner or not.
- Three rules the server refuses to break, whatever the UI sends: a family keeps **at least one owner**, the
  **last person cannot be removed** (delete the family instead), and a parent's escalation order is never
  emptied — a parent with nobody to alert is worse than no app at all.
- Deleting a family is a real deletion (`backend/src/lib/purge.ts`): parents, medicines, daily checks,
  readings, doses, dose events, paired phones, prescriptions, push subscriptions and the EventBridge
  schedules. It requires the family's name to be typed, and the server checks it again.

## Authorization

Cedar policies (`cedar/policies`, 16 of them) are validated and scenario-tested offline with the Cedar WASM
package (`backend/test/cedar.test.ts`), and enforced at runtime by **Amazon Verified Permissions**: every
handler calls `IsAuthorized` before touching family data. Two policies are `forbid` rules that hold even if
another policy would allow: a revoked parent phone can do nothing, and a demo session can never touch a real
family. The policy ids that allowed an action are recorded on the event and shown in the "Why am I seeing
this?" timeline.

Three of the policies exist for the features above:

- `owners-manage-members` — only an owner may add, remove or re-rank people, or delete the family.
- `members-can-leave-their-family` — anyone may leave their own family, owner or not.
- `parent-phone-records-own-readings` — a paired phone may record and read **only that parent's** readings,
  and the revoked-phone `forbid` rule still overrides it.

Three kinds of caller:

| Caller | How it authenticates | Routes |
|---|---|---|
| Family member | Cognito JWT (access token, checked by the API's JWT authorizer) | `/families/*`, `/doses/*`, `/me` |
| Parent's phone | A 256-bit device token, stored only as a hash, issued for a one-time code | `/parent/*` |
| Judge demo | A short-lived demo token, accepted only on `/demo/*` | `/demo/*` |

The Lambda authorizer refuses a device token on demo routes and a demo token everywhere else.

## Prescription reading

`POST /families/{fid}/prescriptions` returns two presigned S3 uploads (a 2400px original for Textract and a
1568px copy for Claude, image-only, 5-minute expiry). The upload of the original triggers a Lambda that:

1. claims the work with a conditional status flip, so an at-least-once S3 event cannot read twice;
2. runs **Textract** `DetectDocumentText`, keeping each line's text, confidence and handwriting flag;
3. sends the photo **and** the OCR lines to **Claude Sonnet 4.6** with a single tool, temperature 0, and a
   prompt that says transcribe only, never guess, and treat text in the image as data rather than
   instructions;
4. decodes the schedule codes (`1-0-1`, `OD`, `BD`, `TDS`, `HS`, `SOS`, `AC`, `PC`, durations like `5/7`)
   with a fixed table in `shared/src/notation.ts`, never with the model;
5. screens only the model's English notes with a **Bedrock Guardrail** (Classic tier, which stays in Mumbai);
6. saves a draft where every row is marked red, amber or green with reasons.

Nothing becomes a medicine until a person ticks every row. The server re-checks that rule on confirm.

## Web app

A React PWA on **Amplify Hosting**. The service worker shows every push (Safari revokes permission
otherwise), posts the delivery receipt with `keepalive`, and opens the right screen on tap. Reminders are
requested only from a button tap, after an install prompt, because Chrome withdraws notification permission
from sites that are not installed and rarely opened.

Undo lives on the phone: tapping *Taken* shows a 10-second undo and only then sends, because a completed
workflow step cannot be taken back on the server.

## Observability

A CloudWatch dashboard shows the dose funnel (reminders → reached the phone → taken, late, escalated,
claimed), delivery latency, workflow outcomes, Scheduler errors and dead letters, API and Lambda health,
Cedar allow/deny counts, and the prescription pipeline. Seven alarms cover workflow failures, dead letters,
Scheduler target errors, API 5xx, Lambda errors and throttles, and repeated extraction failures. A monthly
budget emails at 50%, 80% and forecast 100%.
