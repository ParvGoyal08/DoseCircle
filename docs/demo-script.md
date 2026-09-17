# Demo video script (target 2:50)

Record at 1440×900 in a private window, browser zoom 125%, with captions. Show AWS on screen: the rules say
if the video doesn't show it, it doesn't count.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:15 | Landing page, then the hero's live escalation loop | "Amma is 68, in Mysuru. Her son is in Bengaluru, her daughter in Pune. Every day they wonder: did she take her tablets?" |
| 0:15–0:40 | Real phone: the Kannada reminder arrives, the voice clip plays, tap the green button, the tick | "The reminder reaches her in Kannada, with the tablet names exactly as printed on the strip. One button. Ten seconds to undo." |
| 0:40–1:25 | `/demo`, send a dose, let it go unanswered. The family circle: reminder → missed → Arjun → Meera. Meera claims; Arjun's phone shows stand down | "If she doesn't tap, DoseCircle first checks whether the reminder even reached her phone. Missed, not offline. Then it asks one person at a time. Meera takes it, and Arjun is told to stand down, so nobody calls Amma five times." |
| 1:25–1:40 | Tap "Why am I seeing this?" on Meera's phone | "Every alert can explain itself: the workflow step that ran it, and the Cedar policy that allowed each action." |
| 1:40–1:55 | Back on Amma's phone: the same reminder also asks for blood sugar and blood pressure. Type 128 / 82, tap once | "The same reminder can ask for a reading. She types the numbers from the machine and confirms once. DoseCircle writes them down — it never says what they mean." |
| 1:55–2:15 | The Family dashboard tab: adherence, dose calendar, timing, who responds, refill, then the blood-sugar and blood-pressure trends | "The family sees how she is really doing: doses against the clinical 80% line, which slot is slipping, who responds fastest, when the tablets run out — and a month of readings, with no target band, because that is the doctor's call, not an app's." |
| 2:15–2:30 | Prescription photo → review screen, amber rows, tick each one, save | "A prescription photo is read by Amazon Textract and Claude on Bedrock. The codes are decoded by fixed rules, a guardrail strips anything like advice, and nothing is saved until a person checks every line." |
| 2:30–2:48 | **AWS console:** the Step Functions graph mid-execution (point at `ShouldAlertFamily`), EventBridge Scheduler with Asia/Kolkata, the CloudWatch dashboard | "One Step Functions execution per reminder. Medicines always alert the family; a forgotten weigh-in takes this branch and stays quiet. It waits for a tap for free, so this costs about two and a half rupees per parent per month." |
| 2:48–2:55 | Back to the three phones, then the repo | "Three languages, each reviewed by a native speaker. Reminders and family alerts only: never medical advice." |

## Shots to capture beforehand
- A real Android phone, installed from the browser, with notifications allowed: the push arriving on the lock
  screen, then the reminder screen.
- The Step Functions execution graph with a `waitForTaskToken` state highlighted mid-wait.
- The EventBridge Scheduler console showing the cron and `Asia/Kolkata`.
- The CloudWatch dashboard with the dose funnel filled in (run a few demo doses first).

## Things to avoid
- No real prescription, and no real family's data: the demo family is fictional and labelled as such.
- Don't claim languages we have not had reviewed.
- Don't say "diagnosis", "dose advice" or anything a clinician would have to stand behind.
