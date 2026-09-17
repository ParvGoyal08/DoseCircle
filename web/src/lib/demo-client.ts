import { api, ApiError, setTokenProvider } from "./api";
import type { DemoSession, DemoState, InboxItem, Insights, Prescription, Timeline } from "./types";

export interface DemoClient {
  /** True when running the in-browser simulation instead of AWS. */
  readonly simulated: boolean;
  session(): DemoSession | null;
  start(): Promise<DemoSession>;
  state(): Promise<DemoState>;
  sendDose(options: { critical: boolean }): Promise<{ doseId: string }>;
  taken(doseId: string, options: { keepalive: boolean }): Promise<void>;
  claim(doseId: string, asMemberId: string): Promise<"claimed" | "lost">;
  /** What the service worker does on a real phone the moment a push arrives. */
  receipt(item: InboxItem, recipient: string): Promise<void>;
  timeline(doseId: string, asMemberId: string): Promise<Timeline>;
  prescription(): Promise<Prescription>;
  insights(days: 7 | 30): Promise<Insights>;
  reset(): Promise<void>;
}

const STORAGE_KEY = "dosecircle.demo";

function load(): DemoSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const session = raw ? (JSON.parse(raw) as DemoSession) : null;
    return session && Date.parse(session.expiresAt) > Date.now() + 60_000 ? session : null;
  } catch {
    return null;
  }
}

function save(session: DemoSession | null) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private windows may refuse storage; the demo still works for this page view.
  }
}

/** The live demo on AWS: every action goes through API Gateway, Lambda, Cedar and Step Functions. */
export function createAwsDemoClient(): DemoClient {
  let current = load();
  setTokenProvider("demo", async () => current?.token ?? null);

  return {
    simulated: false,
    session: () => current,
    async start() {
      current = await api<DemoSession>("/demo/sessions", { method: "POST", auth: "none" });
      save(current);
      return current;
    },
    state: () => api<DemoState>("/demo/state", { auth: "demo" }),
    sendDose: ({ critical }) => api<{ doseId: string }>("/demo/doses", { method: "POST", auth: "demo", body: { critical } }),
    async taken(doseId, { keepalive }) {
      await api(`/demo/doses/${encodeURIComponent(doseId)}/taken`, { method: "POST", auth: "demo", keepalive });
    },
    async claim(doseId, asMemberId) {
      try {
        await api(`/demo/doses/${encodeURIComponent(doseId)}/claim`, { method: "POST", auth: "demo", query: { asMemberId } });
        return "claimed";
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) return "lost";
        throw error;
      }
    },
    async receipt(item, recipient) {
      if (!item.doseId || !item.sig) return;
      await api("/push/receipt", { method: "POST", auth: "none", body: { doseId: item.doseId, step: item.step, recipient, sig: item.sig } });
    },
    timeline: (doseId, asMemberId) => api<Timeline>(`/demo/doses/${encodeURIComponent(doseId)}/timeline`, { auth: "demo", query: { asMemberId } }),
    prescription: () => api<Prescription>("/demo/prescription", { auth: "demo" }),
    insights: (days) =>
      api<Insights>(`/demo/families/${current!.fid}/parents/${current!.parent.pid}/insights`, { auth: "demo", query: { asMemberId: current!.members[0]!.mid, days: String(days) } }),
    async reset() {
      try {
        await api("/demo/reset", { method: "POST", auth: "demo" });
      } finally {
        current = null;
        save(null);
      }
    },
  };
}
