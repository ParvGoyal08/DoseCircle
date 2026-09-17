# Security and privacy

DoseCircle holds something sensitive: which medicines an elderly person takes, and whether they took them.
This is what we do about it, and what we deliberately do not do.

## Who can do what

Authorization is written as **Cedar policies** (`cedar/policies`) and enforced by **Amazon Verified
Permissions** on every request, not by scattered `if` statements. The policies are also validated and
scenario-tested offline (`backend/test/cedar.test.ts`), including cases that must be refused.

- A family member may only see and act on their **own** family.
- **Only a member who was actually alerted** can claim a dose, and only while it is escalating:
  `status == "ESCALATING" && alertedMembers.contains(principal)`.
- Only a parent's **own** paired phone can confirm that parent's dose.
- Two `forbid` rules override everything else: a **revoked phone can do nothing**, and a **demo session can
  never touch a real family** (or a real session a demo family).
- Owners, not every member, can change the family or its escalation order.

The policy ids that allowed an action are stored with the event and shown in the app's timeline, so a family
can see *why* they were alerted and what permitted each step.

## Credentials

| Who | What they hold | Notes |
|---|---|---|
| Family member | Cognito account (email and password), access token in memory | The API's JWT authorizer checks the token's client id |
| Parent's phone | One 256-bit device token | Stored **only as a SHA-256 hash**; a table leak yields nothing usable |
| Judge demo | A 2-hour signed token | Accepted only on `/demo/*` routes |
| Delivery receipts | No credential at all | The push payload carries an HMAC that proves the receipt is genuine |

- **Parents never have a password.** A family member creates an 8-character invite code; only its hash is
  stored, it works once, and it expires in 48 hours. Wrong codes are limited to 8 per caller per hour on top
  of a 1 request/second route throttle.
- **A lost phone** is disconnected from the family app; the authorizer refuses it within its 5-minute cache.
- **Secrets** (push keys, the receipt HMAC, the demo token secret) live in SSM Parameter Store as
  SecureStrings and are never written to logs or the repo. The deploy script never overwrites them, because
  rotating push keys would silently break every phone already subscribed.

## Limits and abuse

- Per-route throttles: 1 request/second on phone pairing, 2/second on starting a demo, 1/second on test
  reminders and prescription uploads, 20/second elsewhere.
- Application caps: 3 test reminders per parent per day, 10 prescriptions per family per day, 20 doses per
  demo session, 300 demo sessions a day, and a kill switch for the demo.
- Push endpoints are checked against an allow-list of the real browser push services, so a saved
  subscription cannot aim our requests at an arbitrary URL.
- Uploads are image-only presigned POSTs with a size limit, valid for 5 minutes.

## Data we hold, and for how long

| Data | Kept |
|---|---|
| Doses and events | 120 days, for the doctor report |
| Prescription photos | 7 days in a private, encrypted S3 bucket, then deleted by lifecycle rule |
| Prescription drafts | 7 days unless confirmed |
| Demo families | 2 hours, then removed by TTL |
| Invite codes | 48 hours, single use |
| Logs | 14 days |

Notification payloads carry only what the phone needs to show: a title, one reviewed sentence, the dose id,
and the signature. No diagnosis, no dose amounts.

## The AI parts

- A prescription photo is read by **Textract in Mumbai**, then by **Claude on Bedrock**. From Mumbai, Claude
  is only reachable through the global cross-Region profile, so **the photo may be processed outside India**.
  The app states this before the upload, and the demo uses only a fictional prescription.
- The model is told to transcribe only and never guess; the meaning of `1-0-1`, `OD`, `HS` and so on is
  decoded by a fixed table in code.
- **Nothing is saved until a person confirms every line**, and the server re-checks that.
- A **Bedrock Guardrail** screens the model's own English notes for anything resembling medical advice. It is
  never applied to the transcribed names and doses, because blocking those would hide exactly what the family
  needs to check.

## What we do not do

- No medical advice, dosage suggestions or interaction warnings, anywhere, in any language.
- No SMS or voice calls (India's TRAI DLT registration), and no native app.
- No public sharing links for reports, and no email of medical data.
- No per-family dimensions on metrics, so operational dashboards cannot become a list of patients.

## Known gaps

Honest list, for anyone reading the code:

- Removing a family member, leaving a family, and deleting a family's data are not implemented yet.
- Production use in India would need a legal review under the DPDP Act and its rules, and a proper privacy
  notice and consent record. This is a hackathon build, not a product.
- Push delivery on Android can be delayed by battery savers; the app tells the family "the phone seems
  offline" rather than pretending a dose was missed, and the onboarding asks for battery optimisation to be
  turned off.
