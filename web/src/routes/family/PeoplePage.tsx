import { Crown, Loader2, LogOut, ShieldCheck, TriangleAlert, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { FamilyShell, Field, inputClass } from "../../components/FamilyShell";
import { Avatar, Button, Card, cx } from "../../components/ui";
import { useT } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { RequireFamily, useFamily } from "../../lib/family";
import type { Dashboard, FamilyMember } from "../../lib/types";
import { useApi } from "../../lib/useApi";

export function PeoplePage() {
  return <RequireFamily>{(me) => <People fid={me.fid} mid={me.mid} lang={me.lang} isOwner={me.role === "owner"} />}</RequireFamily>;
}

function People({ fid, mid, lang: myLang, isOwner }: { fid: string; mid: string; lang: string; isOwner: boolean }) {
  const { t, lang } = useT(myLang);
  const { reload: reloadFamily } = useFamily();
  const navigate = useNavigate();
  const list = useApi(() => api<{ members: FamilyMember[] }>(`/families/${fid}/members`, { auth: "family" }), [fid]);
  const family = useApi(() => api<Dashboard>(`/families/${fid}`, { auth: "family" }), [fid]);
  const [invite, setInvite] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const members = list.data?.members ?? [];
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
      actions={
        isOwner && (
          <Button
            tone="ink"
            onClick={async () => {
              const result = await api<{ link: string }>(`/families/${fid}/invites`, { method: "POST", auth: "family", body: { kind: "member" } });
              setInvite(result.link);
            }}
          >
            <UserPlus aria-hidden className="size-5" />
            <span lang={lang}>{t("action.inviteFamily")}</span>
          </Button>
        )
      }
    >
      <p lang={lang} className="mb-6 text-lg text-muted">
        {t("people.intro")}
      </p>

      {invite && (
        <Card className="mb-6 p-4">
          <p lang={lang} className="text-[15px] font-semibold">
            {t("onboard.copyLink")}
          </p>
          <p className="mt-2 break-all rounded-xl bg-paper p-3 font-mono text-[14px]">{invite}</p>
        </Card>
      )}

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-missed-tint px-3 py-2 font-medium text-missed">
          {error}
        </p>
      )}

      <ul className="space-y-3">
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
                        <span lang={lang} className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-muted">
                          {t("people.inAlertOrder")}
                          <span className="tabular font-semibold text-ink">{member.ladderPositions.map((p) => p.position).join(", ")}</span>
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

      <Button tone="quiet" className="mt-6" onClick={leave}>
        <LogOut aria-hidden className="size-5" />
        <span lang={lang}>{t("people.leave")}</span>
      </Button>

      {isOwner && family.data && <DangerZone fid={fid} familyName={family.data.family.name} lang={myLang} />}
    </FamilyShell>
  );
}

/** Deleting a family removes the parent's whole record, so it asks for the name to be typed out. */
function DangerZone({ fid, familyName, lang: myLang }: { fid: string; familyName: string; lang: string }) {
  const { t, lang } = useT(myLang);
  const { reload } = useFamily();
  const navigate = useNavigate();
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="mt-8 border-2 border-missed/40 p-4">
      <h2 lang={lang} className="flex items-center gap-2 text-xl font-semibold text-missed">
        <TriangleAlert aria-hidden className="size-5" /> {t("people.dangerTitle")}
      </h2>
      <p lang={lang} className="mt-1 text-[15px] text-ink">
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
    </Card>
  );
}
