import { SLOT_NAMES, type LanguageCode, type SlotName } from "@dosecircle/shared";
import { CirclePause, CirclePlay, LogOut, MoveDown, MoveUp, Smartphone, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { FamilyShell, inputClass } from "../../components/FamilyShell";
import { LanguagePicker } from "../../components/LanguagePicker";
import { Avatar, Button, Card, SLOT_ICONS } from "../../components/ui";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { signOut } from "../../lib/auth";
import { RequireFamily, useFamily } from "../../lib/family";
import { formatAgo } from "../../lib/format";
import type { Dashboard } from "../../lib/types";
import { useApi } from "../../lib/useApi";
import { EnableMyAlerts, PhoneInvite } from "./AuthPages";

export function ParentSettingsPage() {
  const { pid = "" } = useParams();
  return <RequireFamily>{(me) => <ParentSettings fid={me.fid} pid={pid} myLang={me.lang} isOwner={me.role === "owner"} />}</RequireFamily>;
}

interface DeviceList {
  devices: { deviceId: string; pairedAt: string | null; lang: LanguageCode }[];
  lastReceiptAt: string | null;
}

function ParentSettings({ fid, pid, myLang, isOwner }: { fid: string; pid: string; myLang: string; isOwner: boolean }) {
  const { t, lang } = useT(myLang);
  const dashboard = useApi(() => api<Dashboard>(`/families/${fid}`, { auth: "family" }), [fid]);
  const devices = useApi(() => api<DeviceList>(`/families/${fid}/parents/${pid}/devices`, { auth: "family" }), [fid, pid]);
  const parent = dashboard.data?.parents.find((p) => p.pid === pid);
  const [order, setOrder] = useState<string[]>([]);
  const [times, setTimes] = useState<Record<SlotName, string> | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (parent) {
      setOrder(parent.ladder.map((p) => p.mid));
      setTimes(parent.slotTimes);
    }
  }, [parent]);

  const members = dashboard.data?.members ?? [];
  const nameOf = (mid: string) => members.find((m) => m.mid === mid)?.displayName ?? "";
  const move = (index: number, by: number) => {
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    setOrder(next);
  };
  const flash = (key: string) => {
    setSaved(key);
    setTimeout(() => setSaved(null), 2500);
  };

  if (!parent) return <FamilyShell lang={myLang} back="/home">{null}</FamilyShell>;
  const endpoint = `/families/${fid}/parents/${pid}`;

  return (
    <FamilyShell lang={myLang} back="/home" title={parent.displayName}>
      <div className="space-y-6">
        <Card className="p-4">
          <h2 lang={lang} className="text-xl font-semibold">
            {t("settings.order")}
          </h2>
          <p lang={lang} className="mt-1 text-[15px] text-muted">
            {t("settings.orderHelp")}
          </p>
          <ol className="mt-4 space-y-2">
            {order.map((mid, index) => (
              <li key={mid} className="flex items-center gap-3 rounded-xl border border-line bg-paper/60 p-2">
                <span className="tabular grid size-8 place-items-center rounded-full bg-ink font-semibold text-paper">{index + 1}</span>
                <Avatar name={nameOf(mid)} size={32} />
                <span className="flex-1 font-semibold">{nameOf(mid)}</span>
                {isOwner && (
                  <>
                    <button type="button" aria-label={t("settings.moveUp")} disabled={index === 0} onClick={() => move(index, -1)} className="grid size-11 place-items-center rounded-lg hover:bg-surface disabled:opacity-30">
                      <MoveUp aria-hidden className="size-5" />
                    </button>
                    <button type="button" aria-label={t("settings.moveDown")} disabled={index === order.length - 1} onClick={() => move(index, 1)} className="grid size-11 place-items-center rounded-lg hover:bg-surface disabled:opacity-30">
                      <MoveDown aria-hidden className="size-5" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ol>
          {isOwner && (
            <Button
              tone="ink"
              className="mt-4"
              onClick={async () => {
                await api(`${endpoint}/ladder`, { method: "PUT", auth: "family", body: { memberIds: order } });
                flash("order");
              }}
            >
              <span lang={lang}>{saved === "order" ? t("settings.saved") : t("settings.saveOrder")}</span>
            </Button>
          )}
        </Card>

        <Card className="p-4">
          <h2 lang={lang} className="text-xl font-semibold">
            {t("settings.times")}
          </h2>
          {times && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {SLOT_NAMES.map((slot) => {
                const Icon = SLOT_ICONS[slot];
                return (
                  <label key={slot} className="block">
                    <span className="flex items-center gap-2 text-[15px] font-semibold">
                      <Icon aria-hidden className="size-4.5" /> <span lang={lang}>{t(`slot.${slot}`)}</span>
                    </span>
                    <input type="time" className={`${inputClass} tabular mt-1`} value={times[slot]} onChange={(e) => setTimes({ ...times, [slot]: e.target.value })} />
                  </label>
                );
              })}
            </div>
          )}
          <Button
            tone="quiet"
            className="mt-4"
            onClick={async () => {
              await api(endpoint, { method: "PATCH", auth: "family", body: { slotTimes: times } });
              flash("times");
            }}
          >
            <span lang={lang}>{saved === "times" ? t("settings.saved") : t("meds.save")}</span>
          </Button>
        </Card>

        <Card className="p-4">
          <h2 lang={lang} className="text-xl font-semibold">
            {parent.paused ? t("home.paused") : t("settings.pause")}
          </h2>
          <p lang={lang} className="mt-1 text-[15px] text-muted">
            {t("settings.pauseHelp")}
          </p>
          <Button
            tone={parent.paused ? "taken" : "quiet"}
            className="mt-3"
            onClick={async () => {
              await api(endpoint, { method: "PATCH", auth: "family", body: { paused: !parent.paused } });
              await dashboard.reload();
            }}
          >
            {parent.paused ? <CirclePlay aria-hidden className="size-5" /> : <CirclePause aria-hidden className="size-5" />}
            <span lang={lang}>{parent.paused ? t("settings.resume") : t("settings.pause")}</span>
          </Button>
        </Card>

        <Card className="p-4">
          <h2 lang={lang} className="flex items-center gap-2 text-xl font-semibold">
            <Smartphone aria-hidden className="size-5" /> {t("settings.phones")}
          </h2>
          {devices.data && devices.data.devices.length === 0 && (
            <p lang={lang} className="mt-2 text-muted">
              {t("settings.noPhones")}
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {devices.data?.devices.map((device) => (
                <li key={device.deviceId} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                  <Smartphone aria-hidden className="size-5 text-muted" />
                  <span className="tabular flex-1 text-[15px]">
                    <span lang={lang}>{t("home.lastReachable")}</span>: {devices.data?.lastReceiptAt ? formatAgo(devices.data.lastReceiptAt, lang) : "–"}
                  </span>
                  <Button
                    tone="quiet"
                    size="sm"
                    onClick={async () => {
                      await api(`${endpoint}/devices/${device.deviceId}`, { method: "DELETE", auth: "family" });
                      await devices.reload();
                    }}
                  >
                    <span lang={lang}>{t("settings.revoke")}</span>
                  </Button>
                </li>
              ))}
          </ul>
          <div className="mt-4">
            <PhoneInvite fid={fid} pid={pid} parentName={parent.displayName} lang={myLang} />
          </div>
        </Card>
      </div>
    </FamilyShell>
  );
}

export function MySettingsPage() {
  return <RequireFamily>{(me) => <MySettings fid={me.fid} myLang={me.lang as LanguageCode} isOwner={me.role === "owner"} />}</RequireFamily>;
}

function MySettings({ fid, myLang, isOwner }: { fid: string; myLang: LanguageCode; isOwner: boolean }) {
  const { reload } = useFamily();
  const navigate = useNavigate();
  const { t, lang } = useT(myLang);
  const [invite, setInvite] = useState<string | null>(null);

  return (
    <FamilyShell lang={myLang} title={t("settings.title")}>
      <div className="space-y-6">
        <Card className="p-4">
          <h2 lang={lang} className="mb-3 text-xl font-semibold">
            {t("settings.myLanguage")}
          </h2>
          <LanguagePicker
            value={myLang}
            onChange={async (code) => {
              await api("/me/lang", { method: "PUT", auth: "family", body: { lang: code } });
              await reload();
            }}
          />
        </Card>

        <EnableMyAlerts lang={myLang} />

        {isOwner && (
          <Card className="p-4">
            <h2 lang={lang} className="text-xl font-semibold">
              {t("action.inviteFamily")}
            </h2>
            {invite ? (
              <p className="mt-3 break-all rounded-xl bg-paper p-3 font-mono text-[14px]">{invite}</p>
            ) : (
              <Button
                tone="quiet"
                className="mt-3"
                onClick={async () => {
                  const result = await api<{ link: string }>(`/families/${fid}/invites`, { method: "POST", auth: "family", body: { kind: "member" } });
                  setInvite(result.link);
                }}
              >
                <UserPlus aria-hidden className="size-5" />
                <span lang={lang}>{t("action.inviteFamily")}</span>
              </Button>
            )}
          </Card>
        )}

        <Button
          tone="quiet"
          onClick={async () => {
            await signOut();
            // Leave the signed-in area first, so it doesn't redirect to the sign-in page on the way out.
            navigate("/", { replace: true });
            await reload();
          }}
        >
          <LogOut aria-hidden className="size-5" />
          <span lang={lang}>{t("auth.signOut")}</span>
        </Button>
      </div>
    </FamilyShell>
  );
}
