import { Camera, CircleCheck, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { FamilyShell } from "../../components/FamilyShell";
import { PrescriptionReview, type Decision } from "../../components/PrescriptionReview";
import { Button, Card, cx } from "../../components/ui";
import { useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { RequireFamily } from "../../lib/family";
import type { Prescription, PresignedPost } from "../../lib/types";

export function PrescriptionPage() {
  const { pid = "" } = useParams();
  return <RequireFamily>{(me) => <PrescriptionFlow fid={me.fid} pid={pid} lang={me.lang} />}</RequireFamily>;
}

/** Textract wants detail (≤2400px); Claude's image limit is 3.75 MB and 1568px is its sweet spot. */
const VARIANTS = { original: { edge: 2400, maxBytes: 5 * 1024 * 1024 }, model: { edge: 1568, maxBytes: 3.75 * 1024 * 1024 } } as const;

async function toJpeg(file: File, edge: number, maxBytes: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.9, 0.8, 0.7, 0.6]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= maxBytes) return blob;
  }
  throw new Error("The photo is too large even after resizing.");
}

async function upload(post: PresignedPost, blob: Blob) {
  const form = new FormData();
  for (const [key, value] of Object.entries(post.fields)) form.append(key, value);
  form.append("file", blob, "photo.jpg");
  const response = await fetch(post.url, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Upload failed (${response.status})`);
}

type Step = "consent" | "choose" | "upload" | "reading" | "review" | "failed" | "saved";

function PrescriptionFlow({ fid, pid, lang: myLang }: { fid: string; pid: string; lang: string }) {
  const { t, lang } = useT(myLang);
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("consent");
  const [rx, setRx] = useState<(Prescription & { rxId: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step !== "reading" || !rx) return;
    const started = Date.now();
    const timer = setInterval(async () => {
      setElapsed(Date.now() - started);
      try {
        const next = await api<Prescription & { rxId: string }>(`/families/${fid}/prescriptions/${rx.rxId}`, { auth: "family" });
        if (next.status === "READY") {
          setRx(next);
          setStep("review");
        } else if (next.status === "FAILED") {
          setRx(next);
          setStep("failed");
        }
      } catch {
        // Keep polling; a transient error is not a failure.
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [step, rx, fid]);

  const choose = async (file: File) => {
    setError(null);
    setStep("upload");
    try {
      const [model, original] = await Promise.all([toJpeg(file, VARIANTS.model.edge, VARIANTS.model.maxBytes), toJpeg(file, VARIANTS.original.edge, VARIANTS.original.maxBytes)]);
      const created = await api<{ rxId: string; uploads: { model: PresignedPost; original: PresignedPost } }>(`/families/${fid}/prescriptions`, { method: "POST", auth: "family", body: { pid, consent: true } });
      // model.jpg first: the upload of original.jpg is what starts the reading.
      await upload(created.uploads.model, model);
      await upload(created.uploads.original, original);
      setRx({ rxId: created.rxId, status: "EXTRACTING", lines: [], rows: [], guardrailInterventions: 0 });
      setStep("reading");
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? e.message : (e as Error).message);
      setStep("choose");
    }
  };

  const save = async (decisions: Decision[]) => {
    if (!rx) return;
    setSaving(true);
    try {
      await api(`/families/${fid}/prescriptions/${rx.rxId}/confirm`, { method: "POST", auth: "family", body: { decisions } });
      setStep("saved");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const readingSteps = ["rx.step.upload", "rx.step.read", "rx.step.understand", "rx.step.safety"];
  const readingIndex = step === "upload" ? 0 : elapsed < 3000 ? 1 : elapsed < 12000 ? 2 : 3;

  return (
    <FamilyShell lang={myLang} back={`/parents/${pid}/medicines`} title={t("rx.title")} wide={step === "review"}>
      {step === "consent" && (
        <Card className="max-w-xl p-5">
          <p lang={lang} className="flex gap-3 text-[17px] leading-relaxed">
            <ShieldCheck aria-hidden className="mt-1 size-6 shrink-0 text-claimed" />
            {t("rx.consent")}
          </p>
          <p lang={lang} className="mt-3 text-[15px] text-muted">
            {t("rx.printedOnly")}
          </p>
          <Button tone="ink" size="lg" className="mt-5 w-full" onClick={() => setStep("choose")}>
            <span lang={lang}>{t("rx.consentCheck")}</span>
          </Button>
        </Card>
      )}

      {step === "choose" && (
        <Card className="max-w-xl p-5">
          <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && void choose(e.target.files[0])} />
          <Button tone="ink" size="lg" className="min-h-20 w-full text-xl" onClick={() => input.current?.click()}>
            <Camera aria-hidden className="size-7" strokeWidth={2.25} />
            <span lang={lang}>{t("rx.take")}</span>
          </Button>
          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-missed-tint px-3 py-2 font-medium text-missed">
              {error}
            </p>
          )}
        </Card>
      )}

      {(step === "upload" || step === "reading") && (
        <Card className="max-w-xl p-5">
          <ol className="space-y-3" aria-live="polite">
            {readingSteps.map((key, index) => (
              <li key={key} className={cx("flex items-center gap-3 text-lg", index > readingIndex && "text-muted")}>
                {index < readingIndex ? <CircleCheck aria-hidden className="size-6 text-taken" /> : index === readingIndex ? <Loader2 aria-hidden className="size-6 animate-spin text-ink" /> : <span aria-hidden className="size-6 rounded-full border-2 border-line" />}
                <span lang={lang}>{t(key)}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {step === "failed" && (
        <Card className="max-w-xl p-5">
          <p lang={lang} className="text-lg font-medium text-missed">
            {t(rx?.failure === "unreadable" ? "rx.failed.unreadable" : rx?.failure === "no_medicines" ? "rx.failed.no_medicines" : "rx.failed.other")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button tone="ink" onClick={() => setStep("choose")}>
              <span lang={lang}>{t("common.retry")}</span>
            </Button>
            <Link to={`/parents/${pid}/medicines`} className="inline-flex min-h-12 items-center rounded-[var(--radius-button)] border border-line-strong bg-surface px-5 font-semibold">
              <span lang={lang}>{t("meds.add")}</span>
            </Link>
          </div>
        </Card>
      )}

      {step === "review" && rx && (
        <>
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-missed-tint px-3 py-2 font-medium text-missed">
              {error}
            </p>
          )}
          <PrescriptionReview prescription={rx} lang={myLang} onSave={save} saving={saving} />
        </>
      )}

      {step === "saved" && (
        <Card className="max-w-xl p-5">
          <p lang={lang} className="flex items-center gap-3 text-xl font-semibold text-taken">
            <CircleCheck aria-hidden className="size-7" /> {t("rx.saved")}
          </p>
          <Button tone="ink" className="mt-4" onClick={() => navigate(`/parents/${pid}/medicines`)}>
            <span lang={lang}>{t("meds.title")}</span>
          </Button>
        </Card>
      )}
    </FamilyShell>
  );
}
