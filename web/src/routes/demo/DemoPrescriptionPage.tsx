import { ArrowLeft, CircleCheck, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Logo } from "../../components/Logo";
import { PrescriptionReview } from "../../components/PrescriptionReview";
import { demoClient } from "../../lib/demo";
import { useApi } from "../../lib/useApi";

/**
 * The review step with a fictional printed prescription, already read. The live app runs the same
 * screen after Textract and Claude read a real photo; here nothing is saved.
 */
export function DemoPrescriptionPage() {
  const client = demoClient();
  const started = client.session();
  const prescription = useApi(started ? () => client.prescription() : null, []);
  const [saved, setSaved] = useState(false);

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-20 h-14 border-b border-line bg-paper/95">
        <div className="mx-auto flex h-full max-w-5xl items-center gap-3 px-4">
          <Link to="/demo" className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-muted hover:text-ink">
            <ArrowLeft aria-hidden className="size-4.5" /> Demo
          </Link>
          <Logo className="ml-2 size-7" />
          <span className="rounded-full bg-haldi-tint px-3 py-1 text-[13px] font-semibold text-haldi-deep">Sample prescription · fictional names</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-5">
        <h1 className="text-3xl font-semibold tracking-tight">Prescription photo → checked medicines</h1>
        <p className="mt-2 max-w-3xl text-[16px] text-muted">
          In the app, a family member photographs the prescription. Amazon Textract reads the lines in Mumbai, Claude Sonnet 4.6 on Amazon Bedrock transcribes each medicine exactly as written, the schedule codes (1-0-1, HS, SOS) are decoded by fixed rules rather than by the model, and a Bedrock Guardrail removes anything that sounds like medical advice. Nothing is saved until a person checks every line.
        </p>

        {!started ? (
          <p className="mt-6 rounded-[var(--radius-card)] bg-surface p-4 ring-1 ring-line">
            <Link to="/demo" className="font-semibold text-claimed underline">
              Start the demo
            </Link>{" "}
            first; the sample belongs to the demo session.
          </p>
        ) : saved ? (
          <p className="mt-6 flex items-center gap-3 rounded-[var(--radius-card)] bg-taken-tint p-4 text-lg font-semibold text-taken" role="status">
            <CircleCheck aria-hidden className="size-6" /> Checked. In the live app this saves the medicines and creates their EventBridge Scheduler reminders.
          </p>
        ) : prescription.data ? (
          <div className="mt-6">
            <PrescriptionReview prescription={prescription.data} lang="en" saving={false} onSave={() => setSaved(true)} />
          </div>
        ) : (
          <Loader2 aria-label="Loading" className="mt-10 size-8 animate-spin text-muted" />
        )}
      </main>
    </div>
  );
}
