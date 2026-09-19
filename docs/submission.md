# Submission

## Project title

DoseCircle — when a parent misses their medicine, the right person in the family knows

## Description

**Team Git Happens** · Parv Goyal and Sahitya Sharma · IIIT Delhi

**Demo video:** [VIDEO LINK]

**DoseCircle doesn't just remind. It makes sure.** When an elderly parent living on their own misses a dose, DoseCircle checks whether the reminder even reached their phone, then asks the family one person at a time until someone takes it on. Everyone else is told they can stand down.

### The problem

Millions of parents in India take daily medicines alone while their children live in other cities. A reminder app can ring, but when a dose is missed, nobody knows — or the whole family finds out at once and calls five times. DoseCircle gives the parent one calm screen and never an account, and disturbs the family only when they're actually needed.

### What it does

- **Family sets it up.** Add the person you look after, choose the language they read, and add their medicines.
- **One scan to join.** The parent scans a QR code. No account, no password, nothing to type.
- **Prescription photo → medicines.** Textract reads the page, Claude on Bedrock turns it into medicines and times, and a Bedrock Guardrail blocks medical advice. Nothing is saved until a person checks every line.
- **Reminders at her times, in her language.** Medicine names stay exactly as printed on the strip.
- **Missed, or just offline?** The phone confirms delivery, so the family is told the truth.
- **One person at a time.** The family is asked in the order they chose, faster for critical medicines. One tap on "I'll handle it" claims it, and the others stand down.
- **"Why am I seeing this?"** Every alert explains itself.
- **A view for the family.** Adherence, which time of day slips, tablets running low, and a printable doctor report.

### Where AWS fits

Fully serverless in Mumbai (ap-south-1), deployed with the AWS CDK.

- **EventBridge Scheduler** — one schedule per person per time of day, starting Step Functions directly.
- **Step Functions** — one execution per dose. `waitForTaskToken` waits for a human tap, and waiting is free.
- **Lambda** — the APIs, the workflow steps, and web push.
- **API Gateway** — Cognito sign-in for the family, a device authorizer for the parent's phone.
- **DynamoDB** — conditional writes, so two people can never both claim a dose.
- **Verified Permissions** — Cedar policies decide who may see, change or claim what.
- **Textract, Bedrock and Guardrails, S3** — the prescription pipeline. Photos are deleted after 7 days.
- **Polly, CloudWatch, X-Ray, Parameter Store, Budgets** — voice clips, monitoring, secrets and cost control.

**About ₹2.5 per person per month.**

### Built to be trusted

- DoseCircle never gives medical advice.
- AI output is never saved without a person checking it.
- Claude can process requests outside India, and the app asks for consent before a photo is uploaded.
- The family and history shown in the demo are sample data.
- English is complete. Kannada and Hindi are labelled draft translations until a native speaker reviews them.

### What we learned

- Step Functions task tokens make "remind, wait, escalate" a readable workflow instead of timers and polling.
- "Missed" and "offline" are different facts, and keeping them apart changed every number the family sees.
- Some bugs only exist on real AWS. We found a Lambda memory leak from `Intl` formatters, API routes created out of order, and a DynamoDB reserved word that no mock caught.
- Test data must never become real data. Unanswered test reminders were counting as missed doses until we excluded them.
- Prescription shorthand like `1-0-1` is safer decoded by fixed code than by a model.

### AI tools used

Claude Code for design, code, tests and documentation, directed and reviewed by the team. ChatGPT for generating the landing-page photos and the sample prescription.

### Licence

MIT. The open-source libraries and fonts used are credited in the repository.
