# Submission

## Project title (≤120 characters)

DoseCircle — when a parent misses their medicine, the right person in the family knows

## Description

**DoseCircle doesn't just remind. It makes sure.** When an elderly parent living on their own misses a dose, DoseCircle works out whether the reminder even reached their phone, then asks the family one person at a time until someone takes it on. Everyone else is told they can stand down.

**Live app:** https://main.d38ff1sjrywo9e.amplifyapp.com
**Judge demo (no sign-up, fictional family):** https://main.d38ff1sjrywo9e.amplifyapp.com/demo
**Repository:** https://github.com/ParvGoyal08/DoseCircle
**Demo video:** [VIDEO LINK]
**Builder Center blog:** [BLOG LINK]

### The problem, and who it is for

Millions of parents in India take daily medicines on their own while their children live in other cities. A reminder app can ring, but when a dose is missed nobody knows — or the whole family finds out at once and calls five times. DoseCircle is for both sides: the parent gets one calm screen with one big button and never makes an account; the family is disturbed only when they are actually needed, and never twice for the same dose.

### What it does (everything here is in the video)

- **Set up by the family.** A family member adds the person they look after, chooses the language that person reads, and adds medicines by hand or from a photo of the prescription.
- **Joining is one scan.** The person taking the medicines scans a QR code. No account, no password, nothing to type. Only a hash of the one-time code is stored.
- **Prescription photo → medicines.** Amazon Textract reads the page, Claude on Amazon Bedrock turns it into medicines and times, and a Bedrock Guardrail blocks anything resembling medical advice. Dose codes such as 1-0-1, BD and HS are decoded by a fixed, tested table in code, not by the model. Nothing is saved until a person has ticked every line.
- **Reminders at her times, in her language.** Medicine names always appear exactly as printed on the strip, never translated.
- **Missed, or just offline?** The phone confirms that each reminder was delivered, so the family is told the truth: a missed dose, or a phone that is switched off.
- **The family is asked one at a time**, in the order they chose, and faster for critical medicines. One tap on "I'll handle it" claims the dose, and everyone else stands down.
- **"Why am I seeing this?"** Every alert explains itself, step by step, from the workflow's own history.
- **For the family:** adherence against the 80% benchmark, a dose calendar, which time of day slips, who responds, tablets running low, and a printable one-page doctor report — a record of what happened, never a diagnosis.

### Where AWS fits (Mumbai, ap-south-1, fully serverless, deployed with the CDK)

- **EventBridge Scheduler** — one schedule per person per time of day in Asia/Kolkata, starting Step Functions directly.
- **Step Functions (Standard)** — one execution per dose. `waitForTaskToken` waits for a human tap, and waiting is free because Standard is billed per step.
- **Lambda (Node.js 24, arm64)** — the APIs, the workflow steps, web push, and the prescription reader.
- **API Gateway HTTP API** — Cognito tokens for the family, a Lambda authorizer for paired phones, and per-route throttles.
- **DynamoDB** — one table. Conditional writes make claims race-safe: two people can never both claim a dose.
- **Amazon Verified Permissions** — 18 Cedar policies decide who may see, change or claim what. The deciding policy is recorded on each action.
- **Cognito** — family sign-in. Parents never get an account.
- **Textract, Bedrock (Claude Sonnet 4.6), Bedrock Guardrails, S3** — the prescription pipeline. Photos are private and deleted after 7 days.
- **Amazon Polly** — reminder voice clips for Hindi and English, generated once at build time.
- **CloudWatch, X-Ray, SSM Parameter Store, Budgets** — a dose-funnel dashboard, alarms, tracing, secrets kept out of code, and a spend guardrail.

Architecture diagram: https://github.com/ParvGoyal08/DoseCircle/blob/main/docs/images/architecture.png

**Cost: about $0.03 (≈ ₹2.5) per person per month**, plus about ₹2 per prescription photo, and only when one is uploaded. Breakdown: `docs/cost.md`.

### Built to be trusted

- Reminders and family alerts only. **DoseCircle never gives medical advice.** Daily readings such as blood pressure are recorded and never labelled "high" or "low".
- AI output is never saved without a person checking every line.
- Claude is reached from Mumbai through Bedrock's Global cross-Region profile, which can process requests outside India. The app says so and asks for consent at upload.
- The demo family and the history shown in the video are sample data. No real person's prescription is used anywhere.

### Languages, exactly as shipped

- **English** is complete.
- **Kannada and Hindi** are machine-drafted and labelled "draft translation" in the app until a native speaker reviews them.
- Every translated string is a whole sentence with nothing spliced in, because Kannada attaches case endings to names and numbers.

### What we learned

- **A workflow can wait for a person, for free.** Step Functions task tokens turned "remind, wait, escalate" into a readable state machine instead of timers and polling.
- **"Missed" and "offline" are different facts.** Keeping them apart end to end changed the alert text, the doctor report and the adherence number.
- **Some bugs only exist on AWS.** Our first real deploy surfaced four bugs that had passed 173 local tests:
  - a stage that didn't wait for its own routes;
  - `Intl` formatters leaking memory on Lambda, climbing to 1 GB until requests timed out;
  - metrics that were recorded but never flushed;
  - a DynamoDB reserved word (`sub`) in a cleanup query, which no mock enforced.
- **Authorization can be a feature.** Verified Permissions tells us which policy allowed an action, so the app can show a family member why they were asked.
- **Test data must not become real data.** Unanswered test reminders were counting as missed doses and speeding up real alerts. Tests are now excluded from every number, and the workflow skips the miss streak for them.
- **Prescription notation is its own language:** 1-0-1, 5/7, HS, SOS. A fixed lookup table is safer than asking a model to interpret it.
- **Older users judge an app on its first launch.** Our installed app opened on the landing page and looked logged out, so it now opens straight into the right screen.

### What's next

A native-speaker review of Kannada and Hindi, recorded Kannada voice clips, more Indian languages, and SMS fallback once India's DLT registration is in place.

### AI tools used

- **Claude Code (Anthropic Claude)** — for design, code, tests and documentation, reviewed and directed by the team.
- **ChatGPT image generation** — for the lifestyle photos on the landing page, the mood boards, and the fictional sample prescription.

### Credits and licences

- **DoseCircle** is released under the MIT licence.
- **Libraries:**
  - React, Vite, Tailwind CSS, Workbox and vite-plugin-pwa, i18next, motion, qrcode (MIT);
  - lucide icons (ISC);
  - jsQR (Apache-2.0);
  - web-push (MPL-2.0);
  - the AWS SDK and AWS CDK (Apache-2.0).
- **Fonts:** Playfair Display, DM Sans and Anek (SIL Open Font License).
- **Photos:** AI-generated. They show no real people.
