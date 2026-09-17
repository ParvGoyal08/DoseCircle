import { ArrowRight, BellRing, Hand, Languages, ShieldCheck, Smartphone, Users, WifiOff } from "lucide-react";
import { Link } from "react-router";
import { Logo } from "../components/Logo";
import { pairedDevice } from "../lib/device";

const STEPS = [
  { icon: BellRing, title: "A reminder reaches Amma's phone", body: "At the time the family set, in her own language, with the medicine names exactly as printed on the strip." },
  { icon: WifiOff, title: "No tap? DoseCircle checks why", body: "If the reminder reached the phone, it is a missed dose. If it never arrived, the phone is probably offline, and the family is told which." },
  { icon: Users, title: "The right person is asked first", body: "The family decides the order. If the first person does not respond in time, the next is asked, then everyone." },
  { icon: Hand, title: "One person says “I'll handle it”", body: "Everyone else is told to stand down, so nobody calls Amma five times, and nobody assumes someone else did." },
];

export function LandingPage() {
  const device = pairedDevice();
  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 md:px-8">
        <Logo className="size-9" />
        <span className="text-xl font-semibold tracking-tight">DoseCircle</span>
        <nav className="ml-auto flex items-center gap-2">
          {device && (
            <Link to="/parent" className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold">
              <Smartphone aria-hidden className="mr-1.5 size-4.5" /> My medicines
            </Link>
          )}
          <Link to="/signin" className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface px-4 font-semibold">
            Family sign in
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 md:grid-cols-[1.1fr_1fr] md:px-8 md:pt-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-haldi-tint px-3 py-1 text-[14px] font-semibold text-haldi-deep">
              <Languages aria-hidden className="size-4" />
              <span>
                <span lang="kn">ಕನ್ನಡ</span> · <span lang="hi">हिन्दी</span> · English
              </span>
            </p>
            <h1 className="mt-5 text-[44px] font-semibold leading-[1.05] tracking-tight md:text-6xl">When a parent misses their medicine, the right person in the family knows.</h1>
            <p className="mt-5 max-w-xl text-lg text-muted md:text-xl">
              Families spread across cities worry about whether Amma took her tablets. DoseCircle reminds her, notices a missed dose, and alerts the family one person at a time until someone takes responsibility.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/demo" className="inline-flex min-h-14 items-center gap-2 rounded-[var(--radius-button)] bg-ink px-6 text-lg font-semibold text-paper">
                Try the live demo <ArrowRight aria-hidden className="size-5" />
              </Link>
              <Link to="/signin" className="inline-flex min-h-14 items-center rounded-[var(--radius-button)] border border-line-strong bg-surface px-6 text-lg font-semibold">
                Set up your family
              </Link>
            </div>
            <p className="mt-4 text-[14px] text-muted">The demo uses a fictional family and runs on the real AWS workflow at 60× speed.</p>
          </div>

          <figure aria-hidden className="relative mx-auto w-full max-w-sm">
            <div className="rounded-[36px] bg-ink p-2 shadow-[0_30px_60px_-30px_rgb(28_25_23/0.5)]">
              <div className="rounded-[30px] bg-paper p-5">
                <p className="text-[15px] text-muted">8:00</p>
                <p lang="kn" className="text-[34px] font-semibold">
                  ಬೆಳಿಗ್ಗೆ
                </p>
                <p lang="kn" className="mt-1 text-lg">
                  ಬೆಳಿಗ್ಗೆಯ ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯವಾಗಿದೆ.
                </p>
                <div className="mt-4 space-y-2">
                  {["Glycomet GP 1", "Telma 40"].map((name) => (
                    <div key={name} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
                      <span className="grid size-11 place-items-center rounded-xl bg-haldi-tint text-2xl font-semibold">1</span>
                      <span className="medicine-name text-xl font-semibold">{name}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid min-h-24 place-items-center rounded-2xl bg-taken text-white">
                  <span lang="kn" className="text-2xl font-semibold">
                    ನಾನು ತೆಗೆದುಕೊಂಡೆ
                  </span>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-6 -left-4 w-64 rounded-2xl border border-line bg-surface p-3 shadow-lg md:-left-12">
              <p className="text-[13px] font-semibold text-claimed">Meera · handling it</p>
              <p className="text-[14px] text-muted">Arjun was told to stand down.</p>
            </div>
          </figure>
        </section>

        <section className="border-t border-line bg-surface/60">
          <ol className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:grid-cols-2 md:px-8 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <li key={title}>
                <span className="flex items-center gap-3">
                  <span className="tabular grid size-9 place-items-center rounded-full bg-ink font-semibold text-paper">{index + 1}</span>
                  <Icon aria-hidden className="size-6 text-haldi-deep" strokeWidth={2.25} />
                </span>
                <h2 className="mt-3 text-xl font-semibold leading-snug">{title}</h2>
                <p className="mt-2 text-[16px] text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-3 md:px-8">
          <div>
            <h2 className="text-2xl font-semibold">Built on AWS in Mumbai</h2>
            <p className="mt-2 text-muted">EventBridge Scheduler starts a Step Functions workflow for each dose. It waits for a tap for free, and costs about ₹2.5 per parent per month.</p>
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-semibold">
              <ShieldCheck aria-hidden className="size-6 text-taken" /> Every action authorised
            </h2>
            <p className="mt-2 text-muted">Who may claim a dose or see a parent is written as Cedar policies and checked by Amazon Verified Permissions on every request.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold">Languages, done carefully</h2>
            <p className="mt-2 text-muted">Each person picks their own language. Sentences are reviewed by native speakers, and medicine names are never translated.</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-[14px] text-muted md:px-8">Reminders and family alerts only. DoseCircle does not give medical advice.</p>
      </footer>
    </div>
  );
}
