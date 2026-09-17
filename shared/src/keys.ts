/** DynamoDB single-table key builders. Every key in the app is built here. */

export const DEMO_FAMILY_PREFIX = "demo-";

export function isDemoFamily(fid: string): boolean {
  return fid.startsWith(DEMO_FAMILY_PREFIX);
}

export const keys = {
  family: (fid: string) => ({ PK: `FAM#${fid}`, SK: "META" }),
  member: (fid: string, mid: string) => ({ PK: `FAM#${fid}`, SK: `MEMBER#${mid}` }),
  parent: (fid: string, pid: string) => ({ PK: `FAM#${fid}`, SK: `PARENT#${pid}` }),
  invite: (codeHash: string) => ({ PK: `INVITE#${codeHash}`, SK: "META" }),
  device: (tokenHash: string) => ({ PK: `DEVICE#${tokenHash}`, SK: "META" }),
  pushSubscription: (subjectId: string, endpointHash: string) => ({
    PK: `SUBJ#${subjectId}`,
    SK: `SUB#${endpointHash}`,
  }),
  medicine: (pid: string, medId: string) => ({ PK: `PARENT#${pid}`, SK: `MED#${medId}` }),
  slot: (pid: string, compactTime: string) => ({ PK: `PARENT#${pid}`, SK: `SLOT#${compactTime}` }),
  dose: (pid: string, doseStamp: string) => ({ PK: `PARENT#${pid}`, SK: `DOSE#${doseStamp}` }),
  event: (doseId: string, isoTime: string, type: string) => ({ PK: `DOSE#${doseId}`, SK: `EVT#${isoTime}#${type}` }),
  prescription: (fid: string, rxId: string) => ({ PK: `FAM#${fid}`, SK: `RX#${rxId}` }),
  /** A daily check (blood sugar, blood pressure, weight…) the family asks a parent to do. */
  check: (pid: string, checkId: string) => ({ PK: `PARENT#${pid}`, SK: `CHECK#${checkId}` }),
  /** One recorded measurement. Sorted by time, so a range query reads a period. */
  reading: (pid: string, at: string, checkId: string) => ({ PK: `PARENT#${pid}`, SK: `READING#${at}#${checkId}` }),
  demoSession: (sid: string) => ({ PK: `DEMO#${sid}`, SK: "META" }),
} as const;

export const gsi = {
  userMemberships: (sub: string) => ({ GSI1PK: `USER#${sub}` }),
  openDoses: (fid: string) => ({ GSI2PK: `FAM#${fid}#OPEN` }),
} as const;

const IST = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** A date as "yyyyMMddHHmm" in Indian Standard Time — the dose sort key. */
export function istDoseStamp(date: Date): string {
  const parts = Object.fromEntries(IST.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}`;
}

/** doseId encodes parent and time so the table key can be derived without a lookup. */
export function makeDoseId(pid: string, doseStamp: string, demoRun?: number): string {
  if (!/^\d{12}$/.test(doseStamp)) throw new Error(`Invalid dose stamp "${doseStamp}"`);
  if (pid.includes("_")) throw new Error(`Parent id must not contain "_": "${pid}"`);
  return demoRun === undefined ? `${pid}_${doseStamp}` : `${pid}_${doseStamp}_${demoRun}`;
}

export function parseDoseId(doseId: string): { pid: string; doseStamp: string; demoRun?: number } {
  const [pid, doseStamp, demoRun, ...rest] = doseId.split("_");
  if (!pid || !doseStamp || !/^\d{12}$/.test(doseStamp) || rest.length > 0) {
    throw new Error(`Invalid dose id "${doseId}"`);
  }
  if (demoRun === undefined) return { pid, doseStamp };
  if (!/^\d+$/.test(demoRun)) throw new Error(`Invalid dose id "${doseId}"`);
  return { pid, doseStamp, demoRun: Number(demoRun) };
}

export function doseSortKey(doseId: string): string {
  const { doseStamp, demoRun } = parseDoseId(doseId);
  return demoRun === undefined ? `DOSE#${doseStamp}` : `DOSE#${doseStamp}#${demoRun}`;
}
