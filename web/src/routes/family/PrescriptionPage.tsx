import { Camera, CircleCheck, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { FamilyShell } from "../../components/FamilyShell";
import { PrescriptionReview, type Decision } from "../../components/PrescriptionReview";
import { Button, Card, cx } from "../../components/ui";
import { useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { RequireFamily } from "../../lib/family";
import { toJpeg, upload, VARIANTS } from "../../lib/prescription-upload";
import type { Dashboard, Prescription, PresignedPost } from "../../lib/types";
import { useApi } from "../../lib/useApi";

export function PrescriptionPage() {
  const { pid = "" } = useParams();
  return <RequireFamily>{(me) => <PrescriptionFlow fid={me.fid} pid={pid} lang={me.lang} />}</RequireFamily>;
}

type Step = "opening" | "consent" | "choose" | "upload" | "reading" | "review" | "failed" | "saved" | "alreadySaved" | "gone";

/** Reading normally takes ten to twenty seconds. Past this, stop spinning and offer a way on. */
const READING_TIMEOUT_MS = 90_000;

function PrescriptionFlow({ fid, pid, lang: myLang }: { fid: string; pid: string; lang: string }) {
  const { t, lang } = useT(myLang);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Opened from "a prescription is waiting" (a notification, or the Medicines page): show that one.
  // Without this the page always started a new upload, so a prescription the parent photographed
  // could never be reviewed.
  const openRx = params.get("rx");
  const [step, setStep] = useState<Step>(openRx ? "opening" : "consent");
  const [rx, setRx] = useState<(Prescription & { rxId: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  // The parent's clock times, so each medicine's "when" shows when the phone will actually ring.
  const dashboard = useApi(() => api<Dashboard>(`/families/${fid}`, { auth: "family" }), [fid]);
  const slotTimes = dashboard.data?.parents.find((p) => p.pid === pid)?.slotTimes;

  useEffect(() => {
    if (!openRx) return;
    let live = true;
    api<Prescription & { rxId: string }>(`/families/${fid}/prescriptions/${openRx}`, { auth: "family" }).then(
      (found) => {
        if (!live) return;
        setRx(found);
        setStep(found.status === "READY" ? "review" : found.status === "FAILED" ? "failed" : found.status === "CONFIRMED" ? "alreadySaved" : "reading");
      },
      () => live && setStep("gone"),
    );
    return () => {
      live = false;
    };
  }, [openRx, fid]);

  useEffect(() => {
    if (step !== "reading" || !rx) return;
    const started = Date.now();
    const timer = setInterval(async () => {
      const waited = Date.now() - started;
      setElapsed(waited);
      if (waited > READING_TIMEOUT_MS) {
        clearInterval(timer);
        setTimedOut(true);
        setStep("failed");
        return;
      }
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
    setTimedOut(false);
    // A second photo must not inherit the first one's progress: the steps are driven by elapsed
    // time, and a stale value showed "Safety check" ticking the moment the new upload began.
    setElapsed(0);
    setRx(null);
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
            {t(timedOut ? "rx.failed.timeout" : rx?.failure === "unreadable" ? "rx.failed.unreadable" : rx?.failure === "no_medicines" ? "rx.failed.no_medicines" : "rx.failed.other")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              tone="ink"
              onClick={() => {
                setError(null);
                setStep("choose");
              }}
            >
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
          {/* Keyed by prescription, so nothing ticked or edited on one can carry over to another. */}
          <PrescriptionReview key={rx.rxId} prescription={rx} lang={myLang} onSave={save} saving={saving} slotTimes={slotTimes} />
        </>
      )}

      {step === "opening" && <Loader2 aria-label={t("common.loading")} className="size-8 animate-spin text-muted" />}

      {(step === "alreadySaved" || step === "gone") && (
        <Card className="max-w-xl p-5">
          <p lang={lang} className={cx("text-lg font-medium", step === "alreadySaved" ? "text-taken" : "text-muted")}>
            {t(step === "alreadySaved" ? "rx.alreadySaved" : "rx.gone")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button tone="ink" onClick={() => navigate(`/parents/${pid}/medicines`)}>
              <span lang={lang}>{t("meds.title")}</span>
            </Button>
            {step === "gone" && (
              <Button tone="quiet" onClick={() => navigate(`/parents/${pid}/prescription`, { replace: true })}>
                <span lang={lang}>{t("meds.scan")}</span>
              </Button>
            )}
          </div>
        </Card>
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
