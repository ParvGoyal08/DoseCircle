# Demo video script — 3:00

**The story in one line:** a reminder app only rings. DoseCircle makes sure that if she misses her
medicine, *one* right person in the family knows and takes it on. Everything in the video serves that line.

**Who is in it:** Kamala, who takes the medicines (Mysuru). Arjun, her son and first in line (Bengaluru).
Meera, her daughter and second in line (Pune). Use whatever names are really on screen and keep the
voiceover the same.

**Format:** 1440×900, browser zoom 125%, private window with bookmarks hidden. Phone shots are real phones,
screen-recorded, or filmed from above on a plain table. Burn the captions in. Keep the voiceover to about
400 words, a calm 140 words a minute. Leave room for the screen to speak.

---

## The script

| Time | On screen | Voiceover | Caption (burned in) |
|---|---|---|---|
| **0:00–0:10** Hook | Film the real phone on a bedside table at 8:00, lighting up with the reminder. (Don't use the mood board's phone shot: the Kannada in its notification is gibberish.) | "Kamala is seventy-two and lives on her own in Mysuru. Every morning at eight, her phone reminds her to take her medicine." | — |
| **0:10–0:24** Problem | Landing page hero: *"When they forget, you're still there."* Slow scroll to the family circle animation. | "But if she misses it, nobody knows. Or the whole family calls at once. DoseCircle makes sure the right person knows, and only them." | For parents who live apart from their families |
| **0:24–0:50** Family sets up | Arjun's laptop: **Your family → add Kamala**, set her language, then **Medicines → Photograph a prescription**. A printed *fictional* prescription. The review screen shows amber rows; tick each line and save. The medicine list shows its reminder times. | "Her son sets everything up once. He adds her, picks the language she reads, and photographs her prescription. Amazon Textract reads it, Claude on Amazon Bedrock turns it into medicines and times, and a Bedrock Guardrail blocks anything that sounds like medical advice. Nothing is saved until he has checked every line." | Textract → Claude on Bedrock → Guardrail · a person checks every line |
| **0:50–1:02** She joins | Arjun's screen shows Kamala's QR code. Kamala's phone: **Scan your family's code**, then straight to *Today's medicines* and *Allow notifications*. | "Kamala does one thing. She scans a code. No account, no password, nothing to type." | One-time code · only its hash is stored |
| **1:02–1:22** The reminder | Kamala's phone, locked, face up. The reminder lands in her language. She doesn't touch it. Cut to Arjun's home screen, where *Phone last reachable* has just updated. | "EventBridge Scheduler starts a Step Functions workflow, and the reminder arrives in her own language. Today she doesn't tap. Her phone quietly confirms it received the reminder. So we know she missed it — her phone isn't simply switched off." | Delivered but not confirmed = missed · no receipt = phone offline |
| **1:22–1:55** The family is asked | Split screen, Arjun's and Meera's phones. Arjun's phone gets **Kamala** — *"The medicine has not been confirmed yet. The reminder did reach the phone."* He doesn't answer. Next, Meera gets the same alert, opens it and taps **I'll handle it**. Arjun's phone then gets **Meera** — *"They are taking care of the missed medicine. You do not need to do anything."* | "The family is asked one person at a time, in the order they chose. Arjun is in a meeting, so after a few minutes Meera is asked. She taps *I'll handle it*. That's a single conditional write in DynamoDB, so two people can never both claim it. Arjun is told to stand down. Nobody calls Kamala five times." | Critical medicines escalate twice as fast |
| **1:55–2:07** Why? | On the alert screen, Meera taps **Why am I seeing this?**. The timeline fills in, step by step. | "And every alert explains itself: what happened, when, and why this person was asked." | Built from the workflow's own history |
| **2:07–2:40** Where AWS fits | **(a)** Architecture slide, 6s. **(b)** Step Functions console showing *this* execution's graph, with the task-token wait and the claim branch highlighted. **(c)** EventBridge Scheduler with `Asia/Kolkata`. **(d)** CloudWatch dashboard with the dose funnel. | "It's all serverless, in the Mumbai region. Each dose is one Step Functions execution that waits for a tap using a task token. Waiting is free, so one parent costs about two and a half rupees a month. Cognito signs the family in. Amazon Verified Permissions decides who may do what, using Cedar policies. Lambda and DynamoDB do the rest, and the whole stack is deployed with the CDK." | ≈ ₹2.5 per parent per month |
| **2:40–2:52** The family's view | Quick montage: the home screen status and stat cards, then **How it is going** (adherence ring, the week), then the printable **Doctor report**. | "The family can see how she's really doing, and print a one-page report for her doctor." | Reminders and alerts only — never medical advice |
| **2:52–3:00** Close | Back to the hero, or the station-hug photo from the landing page, with the URL. | "DoseCircle. When they forget, you're still there." | main.d38ff1sjrywo9e.amplifyapp.com |

About 400 words of voiceover. If you run long, cut the family-view montage (2:40–2:52) first, then the
Why? segment. **Never cut** the family being asked, the claim, or the AWS console segment.

---

## Why it's built this way (judging criteria)

| Criterion | Where the video earns it |
|---|---|
| Idea & impact | 0:00–0:24 names a real, specific person and problem in the first 25 seconds |
| Built on AWS / Ship It | Services are named while they work (0:24, 1:02, 1:22), then shown in the console (2:07). The rules say *"if the video does not show it, it does not count"*, so the console segment is not optional |
| Execution | One real run, end to end, on real phones: reminder → missed → first person → second person → claim → stand down |
| Best UI | The one-scan join, the big calm parent screen, the alert with one button, the explained timeline, the family view |
| Learning | Not in the video. It goes in the written description and the blog |

---

## Before recording

**Accounts and phones**
- [ ] **Add a second family member.** Right now the account has only one family member, and the stand-down moment needs two people. Sign up a second account ("Meera") on another phone or browser, then invite her from **Your family**.
- [ ] Make sure the son's account shows the name **Arjun** on screen, since his name appears in the alerts and the family list.
- [ ] Kamala's settings → family order: Arjun first, Meera second.
- [ ] On both family devices, tap **Turn on alerts for you** on the home screen and allow notifications.
- [ ] Kamala's phone: install the app to the home screen, scan her code, allow notifications, turn off battery optimisation for Chrome or the app, and turn off Do Not Disturb.
- [ ] Pick Kamala's language for the shot. Kannada suits the Bengaluru story, but only English and Hindi have voice clips, so don't show audio playing in Kannada.

**Making the escalation fast enough to film**
- [ ] Use **Send a test reminder** on Kamala's card. It runs the real workflow at 10× speed. Kamala has missed doses recently, so her faster timings apply: the reminder, then about 1 minute until Arjun is asked, then about 30 seconds until Meera is asked. Film it in one take and cut the waits with a "2 minutes later" card.
- [ ] A test reminder is started directly, not by EventBridge Scheduler. To keep the 1:02 line exactly true, film the reminder landing from a real scheduled time: set Kamala's slot 3 minutes ahead in **Medicines**. Use the test reminder for the fast escalation shots.
- [ ] You get **3 test reminders per person per day**. Ask me to reset the counter if rehearsals use them up.
- [ ] After one full run, open that execution in the Step Functions console, ready for the 2:07 shot.

**Assets**
- [ ] A printed **fictional** prescription. Never a real one.
- [ ] An architecture slide (one image: phone → API Gateway → Lambda → DynamoDB, with Scheduler → Step Functions → web push, S3 → Textract → Bedrock → Guardrail, and Cognito and Verified Permissions on the side).
- [ ] CloudWatch dashboard with data in it (it will have some after a few test runs).

---

## Don't say

- That translations were reviewed by native speakers. Hindi and Kannada are still marked as drafts in the app.
- That the reminder is spoken in Kannada. Only English and Hindi have voice clips.
- SMS, calls, WhatsApp, "diagnosis", "dosage advice", or anything a doctor would have to stand behind.
- Real people's names or prescriptions. Keep the family fictional and say so in the description.
