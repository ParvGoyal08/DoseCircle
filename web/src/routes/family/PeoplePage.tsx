import type { LanguageCode } from "@dosecircle/shared";
import { ChevronRight, Crown, Loader2, LogOut, ShieldCheck, TriangleAlert, UserMinus, UserPlus, UserRoundPlus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { FamilyShell, Field, inputClass } from "../../components/FamilyShell";
import { LanguagePicker } from "../../components/LanguagePicker";
import { ShareInvite } from "../../components/ShareInvite";
import { Avatar, Button, Card, cx } from "../../components/ui";
import { useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { RequireFamily, useFamily } from "../../lib/family";
import type { Dashboard, FamilyMember } from "../../lib/types";
import { useApi } from "../../lib/useApi";
import { PhoneInvite } from "./AuthPages";

export function PeoplePage() {
  return <RequireFamily>{(me) => <People fid={me.fid} mid={me.mid} lang={me.lang} isOwner={me.role === "owner"} />}</RequireFamily>;
}

function People({ fid, mid, lang: myLang, isOwner }: { fid: string; mid: string; lang: string; isOwner: boolean }) {
  const { t, lang } = useT(myLang);
  const { reload: reloadFamily } = useFamily();
  const navigate = useNavigate();
  const list = useApi(() => api<{ members: FamilyMember[] }>(`/families/${fid}/members`, { auth: "family" }), [fid]);
  const family = useApi(() => api<Dashboard>(`/families/${fid}`, { auth: "family" }), [fid]);
  const [invite, setInvite] = useState<{ link: string; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const members = list.data?.members ?? [];
  const parents = family.data?.parents ?? [];
  const nameOfParent = (pid: string) => parents.find((p) => p.pid === pid)?.displayName ?? "";
  const owners = members.filter((m) => m.role === "owner").length;

  const act = async (run: () => Promise<unknown>) => {
    setError(null);
    try {
      await run();
      await list.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  const leave = async () => {
    if (!window.confirm(t("people.leaveConfirm"))) return;
    await act(async () => {
      await api(`/families/${fid}/leave`, { method: "POST", auth: "family" });
      navigate("/", { replace: true });
      await reloadFamily();
    });
  };

  return (
    <FamilyShell
      lang={myLang}
      back="/home"
      title={t("people.title")}
    >
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-missed-tint px-3 py-2 font-medium text-missed">
          {error}
        </p>
      )}

      {/* Two different kinds of person, and the app used to offer "Invite family" and "Add someone"
          side by side as if they were the same thing. They are not: one gets reminders, the other
          gets alerted when a reminder is ignored. */}
      <section aria-labelledby="dependents" className="mb-10">
        <h2 id="dependents" lang={lang} className="text-xl font-semibold">
          {t("people.dependentsTitle")}
        </h2>
        <p lang={lang} className="mt-1 text-[15px] text-muted">
          {t("people.dependentsHelp")}
        </p>
        <ul className="mt-4 space-y-3">
          {parents.map((p) => (
            <li key={p.pid}>
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <Avatar name={p.displayName} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-semibold">{p.displayName}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[14px]">
                    <span
                      lang={lang}
                      className={cx("rounded-full px-2.5 py-1 font-medium", p.lastReceiptAt ? "bg-taken-tint text-taken" : "bg-due-tint text-due")}
                    >
                      {p.lastReceiptAt ? t("people.phoneConnected") : t("people.phoneMissing")}
                    </span>
                    {p.paused && (
                      <span lang={lang} className="rounded-full bg-offline-tint px-2.5 py-1 font-medium text-offline">
                        {t("home.paused")}
                      </span>
                    )}
                  </p>
                </div>
                {/* Reminder times and pausing are this person's own settings, so they live on this
                    person's row rather than on the home screen's action list. */}
                {[
                  { to: `/parents/${p.pid}/medicines`, label: t("action.medicines") },
                  { to: `/parents/${p.pid}/settings`, label: t("action.settings") },
                ].map(({ to, label }) => (
                  <Link key={to} to={to} className="pressable inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-button)] px-4 text-[14.5px] font-semibold ring-1 ring-line-strong hover:ring-indigo-soft">
                    <span lang={lang}>{label}</span>
                  </Link>
                ))}
              </Card>
            </li>
          ))}
        </ul>
        {isOwner && <AddParent fid={fid} lang={myLang} onAdded={() => void family.reload()} />}
      </section>

      <section aria-labelledby="caregivers">
        <h2 id="caregivers" lang={lang} className="text-xl font-semibold">
          {t("people.caregiversTitle")}
        </h2>
        <p lang={lang} className="mt-1 text-[15px] text-muted">
          {t("people.intro")}
        </p>

        {isOwner && !invite && (
          <Button
            tone="quiet"
            className="mt-4"
            onClick={async () => {
              const result = await api<{ link: string; code: string }>(`/families/${fid}/invites`, { method: "POST", auth: "family", body: { kind: "member" } });
              setInvite(result);
            }}
          >
            <UserPlus aria-hidden className="size-5" />
            <span lang={lang}>{t("action.inviteFamily")}</span>
          </Button>
        )}

        {invite && (
          <Card className="mt-4 p-4">
            <ShareInvite link={invite.link} code={invite.code} message={t("people.shareMessage")} help={t("people.inviteHelp")} lang={myLang} />
          </Card>
        )}

      <ul className="mt-4 space-y-3">
        {members.map((member) => {
          const isMe = member.mid === mid;
          const lastOwner = member.role === "owner" && owners === 1;
          return (
            <li key={member.mid}>
              <Card className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={member.displayName} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-semibold">
                      {member.displayName}
                      {isMe && (
                        <span lang={lang} className="ml-2 rounded-full bg-paper px-2 py-0.5 text-[13px] font-semibold text-muted">
                          {t("people.you")}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[14px]">
                      <span
                        lang={lang}
                        className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold", member.role === "owner" ? "bg-haldi-tint text-ink" : "bg-paper text-muted")}
                      >
                        {member.role === "owner" ? <Crown aria-hidden className="size-3.5" /> : <ShieldCheck aria-hidden className="size-3.5" />}
                        {t(`people.${member.role}`)}
                      </span>
                      {member.relation && <span className="rounded-full bg-paper px-2.5 py-1 text-muted">{member.relation}</span>}
                      {member.ladderPositions.length > 0 ? (
                        <span lang={lang} className="inline-flex flex-wrap items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-muted">
                          {t("people.inAlertOrder")}
                          {member.ladderPositions.map((position) => (
                            <span key={position.pid} className="inline-flex items-center gap-1">
                              {parents.length > 1 && <span className="text-ink">{nameOfParent(position.pid)}</span>}
                              <span className="tabular font-semibold text-ink">{position.position}</span>
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span lang={lang} className="rounded-full bg-offline-tint px-2.5 py-1 font-medium text-offline">
                          {t("people.notInOrder")}
                        </span>
                      )}
                      {!member.joined && (
                        <span lang={lang} className="rounded-full bg-paper px-2.5 py-1 text-muted">
                          {t("people.notJoined")}
                        </span>
                      )}
                    </p>
                  </div>

                  {isOwner && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        tone="quiet"
                        size="sm"
                        disabled={lastOwner}
                        title={lastOwner ? t("people.lastOwner") : undefined}
                        onClick={() => void act(() => api(`/families/${fid}/members/${member.mid}`, { method: "PATCH", auth: "family", body: { role: member.role === "owner" ? "member" : "owner" } }))}
                      >
                        <span lang={lang}>{member.role === "owner" ? t("people.makeMember") : t("people.makeOwner")}</span>
                      </Button>
                      {!isMe && (
                        <Button
                          tone="quiet"
                          size="sm"
                          onClick={() => {
                            if (!window.confirm(t("people.removeConfirm"))) return;
                            void act(() => api(`/families/${fid}/members/${member.mid}`, { method: "DELETE", auth: "family" }));
                          }}
                        >
                          <UserMinus aria-hidden className="size-4" />
                          <span lang={lang}>{t("people.remove")}</span>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      </section>

      <Button tone="quiet" className="mt-8" onClick={leave}>
        <LogOut aria-hidden className="size-5" />
        <span lang={lang}>{t("people.leave")}</span>
      </Button>

      {isOwner && family.data && <DangerZone fid={fid} familyName={family.data.family.name} lang={myLang} />}
    </FamilyShell>
  );
}

/**
 * Adding another person who needs reminders. A family can look after two parents, or a parent and an
 * aunt: each gets their own reminders, language, medicines and dashboard, and the new dependent
 * inherits the existing alert order so there is never one with nobody to tell.
 *
 * On success it goes straight into phone pairing, because an added dependent with no phone is half a
 * job and the code is the only fiddly part.
 */
function AddParent({ fid, lang: myLang, onAdded }: { fid: string; lang: string; onAdded: () => void }) {
  const { t, lang } = useT(myLang);
  // Opened directly from the "Add someone" chip on the dashboard.
  const [open, setOpen] = useState(() => window.location.hash === "#add");
  const [name, setName] = useState("");
  const [parentLang, setParentLang] = useState<LanguageCode | null>(null);
  const [added, setAdded] = useState<{ pid: string; displayName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (added)
    return (
      <Card className="mb-6 p-4">
        <p lang={lang} className="text-[15px] font-semibold text-taken">
          {t("people.addParentDone")}
        </p>
        <div className="mt-3">
          <PhoneInvite fid={fid} pid={added.pid} parentName={added.displayName} lang={myLang} />
        </div>
      </Card>
    );

  if (!open)
    return (
      <Button tone="quiet" className="mb-6" onClick={() => setOpen(true)}>
        <UserRoundPlus aria-hidden className="size-5" />
        <span lang={lang}>{t("people.addParent")}</span>
      </Button>
    );

  return (
    <Card className="mb-6 p-4">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!parentLang) return;
          setBusy(true);
          setError(null);
          try {
            const result = await api<{ pid: string; displayName: string }>(`/families/${fid}/parents`, {
              method: "POST",
              auth: "family",
              body: { displayName: name.trim(), lang: parentLang },
            });
            setAdded(result);
            onAdded();
          } catch (e) {
            setError(e instanceof ApiError ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <h2 lang={lang} className="text-xl font-semibold">
            {t("people.addParentTitle")}
          </h2>
          <p lang={lang} className="mt-1 text-[15px] text-muted">
            {t("people.addParentHelp")}
          </p>
        </div>
        <Field label={t("onboard.parentName")} lang={lang}>
          <input className={inputClass} required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div>
          <p lang={lang} className="mb-2 text-[15px] font-semibold">
            {t("onboard.parentLanguage")}
          </p>
          <LanguagePicker value={parentLang} onChange={setParentLang} />
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-missed-tint px-3 py-2 font-medium text-missed">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button tone="ink" type="submit" disabled={busy || !parentLang || !name.trim()}>
            {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
            <span lang={lang}>{t("people.addParent")}</span>
          </Button>
          <Button tone="quiet" onClick={() => setOpen(false)}>
            <span lang={lang}>{t("meds.cancel")}</span>
          </Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * Deleting a family wipes the parent's whole record, so it asks for the name to be typed out — but
 * it is also something almost nobody does, and a red panel shouting on every visit to a page people
 * open to invite a relative gets the emphasis exactly backwards. It stays one click away, folded up
 * and quiet, and only unfolds into the warning when somebody actually goes looking for it.
 */
function DangerZone({ fid, familyName, lang: myLang }: { fid: string; familyName: string; lang: string }) {
  const { t, lang } = useT(myLang);
  const { reload } = useFamily();
  const navigate = useNavigate();
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <details className="group mt-12 border-t border-line pt-5">
      <summary lang={lang} className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg text-[14.5px] text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo">
        <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
        {t("people.dangerTitle")}
      </summary>

      <div className="mt-4 max-w-xl rounded-[var(--radius-card)] bg-missed-tint p-4">
        <p lang={lang} className="flex items-start gap-2 text-[15px] font-medium text-ink">
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-missed" />
          {t("people.dangerHelp")}
        </p>
      <div className="mt-4 max-w-sm">
        <Field label={t("people.dangerConfirmLabel")} lang={lang}>
          <input className={inputClass} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={familyName} autoComplete="off" />
        </Field>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-missed-tint px-3 py-2 font-medium text-missed">
          {error}
        </p>
      )}
      <Button
        tone="quiet"
        className="mt-3 !border-missed !text-missed"
        disabled={busy || confirmName.trim() !== familyName}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api(`/families/${fid}`, { method: "DELETE", auth: "family", body: { confirmName: confirmName.trim() } });
            navigate("/", { replace: true });
            await reload();
          } catch (e) {
            setError(e instanceof ApiError ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
        <span lang={lang}>{t("people.dangerButton")}</span>
      </Button>
      </div>
    </details>
  );
}
