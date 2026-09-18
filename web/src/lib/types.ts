import type { CheckField, CheckType, DoseStatus, LanguageCode, MissClass, NotationResult, ReadingValues, ReportOutcome, SlotName } from "@dosecircle/shared";

/** Response shapes of the DoseCircle API (backend/src/api). Kept in one place so screens and the demo simulator agree. */

export interface MedicineLine {
  medId: string;
  nameAsPrinted: string;
  strength: string | null;
  count: number | null;
  food: "before" | "after" | null;
  critical: boolean;
}

/** One measurement the parent is asked for, and the boxes to type it into. */
export interface CheckLine {
  checkId: string;
  type: CheckType;
  fields: readonly CheckField[];
}

export interface RecordedReading {
  at: string;
  values: ReadingValues;
  text: string;
}

export interface DoseView {
  doseId: string;
  status: DoseStatus;
  slotName: SlotName;
  scheduledAt: string;
  critical: boolean;
  parent: { displayName: string; lang: LanguageCode };
  medicines: MedicineLine[];
  checks: CheckLine[];
  voice: { src: string; thanks: string };
}

export interface ParentToday {
  parent: { displayName: string; lang: LanguageCode; paused: boolean };
  /** Whether the family has set up any medicine or daily check at all. */
  hasSchedule: boolean;
  slots: {
    slotName: SlotName;
    time: string;
    medicines: MedicineLine[];
    checks: (CheckLine & { recorded: RecordedReading | null })[];
    dose: { doseId: string; status: DoseStatus } | null;
  }[];
}

export interface CheckView {
  checkId: string;
  type: CheckType;
  slots: SlotName[];
  weekdays: number[];
  escalates: boolean;
  endDate: string | null;
  active: boolean;
  fields: readonly CheckField[];
  chart: { primary: string; secondary?: string };
}

export interface CheckInput {
  type: CheckType;
  slots: SlotName[];
  weekdays: number[];
  escalates?: boolean;
  endDate: string | null;
}

export interface CheckCatalogue {
  checks: CheckView[];
  types: { type: CheckType; fields: readonly CheckField[]; escalatesByDefault: boolean; chart: { primary: string; secondary?: string } }[];
}

export interface OpenAlert {
  doseId: string;
  pid: string;
  parentName: string;
  slotName: SlotName;
  scheduledAt: string;
  status: DoseStatus;
  missClass: MissClass | null;
  critical: boolean;
  alertedMe: boolean;
  alertedCount: number;
  claimedByName: string | null;
}

export interface RefillChip {
  medId: string;
  nameAsPrinted: string;
  daysLeft: number | null;
  level: "ok" | "low" | "critical" | "recount";
}

export interface ParentCard {
  pid: string;
  displayName: string;
  lang: LanguageCode;
  paused: boolean;
  slotTimes: Record<SlotName, string>;
  lastReceiptAt: string | null;
  ladder: { mid: string; displayName: string }[];
  myLadderPosition: number | null;
  slots: { slotName: SlotName; compactTime: string; critical: boolean; medicineCount: number }[];
  today: { doseId: string; slotName: SlotName; scheduledAt: string; status: DoseStatus; missClass: MissClass | null; critical: boolean; claimedByName: string | null }[];
  week: { date: string; outcomes: ReportOutcome[] }[];
  refills: RefillChip[];
}

export interface Member {
  mid: string;
  displayName: string;
  relation: string | null;
  role: "owner" | "member";
  lang: LanguageCode;
}

/** GET /families/{fid}/members — with where each person sits in every parent's alert order. */
export interface FamilyMember extends Member {
  joined: boolean;
  ladderPositions: { pid: string; position: number }[];
}

export interface Dashboard {
  family: { fid: string; name: string };
  me: { mid: string; role: "owner" | "member" };
  members: Member[];
  parents: ParentCard[];
  openAlerts: OpenAlert[];
}

export interface Me {
  member: null | { fid: string; mid: string; displayName: string; relation: string | null; role: "owner" | "member"; lang: LanguageCode };
}

export type TimelineKind =
  | "reminder_sent"
  | "nudge_sent"
  | "reached_phone"
  | "no_confirmation"
  | "reminder_reached_phone"
  | "phone_seemed_offline"
  | "member_alerted"
  | "family_alerted"
  | "claimed"
  | "taken"
  | "others_stood_down"
  | "family_told_taken"
  | "nobody_responded";

export interface TimelineItem {
  at: string;
  kind: TimelineKind;
  stateName?: string;
  people?: string[];
  sincePreviousSeconds: number | null;
  authorizedBy?: string[];
}

export interface Timeline {
  doseId: string;
  parentName: string;
  slotName: SlotName;
  scheduledAt: string;
  status: DoseStatus;
  missClass: MissClass | null;
  critical: boolean;
  items: TimelineItem[];
}

export interface MedicineView {
  medId: string;
  nameAsPrinted: string;
  strength: string | null;
  slots: Partial<Record<SlotName, number | null>>;
  food: "before" | "after" | null;
  critical: boolean;
  asNeeded: boolean;
  pillsLeft: number | null;
  refillThresholdDays: number;
  needsRecount: boolean;
  endDate: string | null;
  active: boolean;
}

export interface MedicineInput {
  nameAsPrinted: string;
  strength: string | null;
  slots: Partial<Record<SlotName, number>>;
  food: "before" | "after" | null;
  critical: boolean;
  asNeeded: boolean;
  pillsLeft: number | null;
  refillThresholdDays: number;
  endDate: string | null;
}

export interface Report {
  parent: { displayName: string };
  from: string;
  to: string;
  generatedAt: string;
  medicines: { medId: string; nameAsPrinted: string; strength: string | null; slots: Partial<Record<SlotName, number | null>>; food: "before" | "after" | null; active: boolean }[];
  report: {
    rows: { medId: string; nameAsPrinted: string; strength: string | null; onTime: number; late: number; missed: number; unknown: number; adherence: number | null }[];
    misses: { doseStamp: string; outcome: "missed" | "unknown"; medicineNames: string[]; handledBy: string | null }[];
    grid: Record<string, Record<string, ReportOutcome>>;
  };
  readings: ReadingSeries[];
}

export interface OcrLine {
  id: string;
  text: string;
  confidence: number;
  handwriting: boolean;
  box: { left: number; top: number; width: number; height: number } | null;
}

export interface ExtractedMedicine {
  lineRefs: string[];
  drugAsWritten: string | null;
  strength: string | null;
  dosePatternAsWritten: string | null;
  frequencyCodeAsWritten: string | null;
  foodCodeAsWritten: string | null;
  durationAsWritten: string | null;
  legible: boolean;
  uncertainFields: string[];
  notesEnglish: string | null;
}

export interface PrescriptionRow {
  rowId: string;
  level: "red" | "amber" | "green";
  reasons: string[];
  medicine: ExtractedMedicine;
  schedule: NotationResult;
}

export interface Prescription {
  rxId?: string;
  pid?: string;
  status: "AWAITING_UPLOAD" | "EXTRACTING" | "READY" | "FAILED" | "CONFIRMED";
  failure?: "unreadable" | "upload_incomplete" | "no_medicines" | "error" | null;
  imageUrl?: string | null;
  imagePath?: string;
  sample?: boolean;
  lines: OcrLine[];
  rows: PrescriptionRow[];
  guardrailInterventions: number;
  medIds?: string[];
}

export interface PresignedPost {
  url: string;
  fields: Record<string, string>;
}

export interface InboxItem {
  title: string;
  body: string;
  lang: string;
  doseId?: string;
  step: "REMIND" | "NUDGE" | "ALERT" | "BROADCAST" | "STAND_DOWN" | "TOOK_LATE" | "REFILL";
  url: string;
  sig: string;
  at: string;
}

export interface DemoSession {
  token: string;
  expiresAt: string;
  fid: string;
  parent: { pid: string; displayName: string; lang: LanguageCode; city: string };
  members: { mid: string; role: "owner" | "member"; displayName: string; relation: string; lang: LanguageCode; city: string }[];
}

export interface DemoState {
  executionStatus: "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "ABORTED" | null;
  runsLeft: number;
  parent: { pid: string; displayName: string; lang: LanguageCode; lastReceiptAt: string | null } | null;
  members: { mid: string; displayName: string; relation: string | null; lang: LanguageCode; role: "owner" | "member"; position: number }[];
  currentDose: (DoseView & { missClass: MissClass | null; claimedBy: string | null; claimedByName: string | null }) | null;
  inbox: Record<string, InboxItem[]>;
  openAlertsByMember: Record<string, OpenAlert[]>;
}

// The analytics shapes are defined once, next to the code that builds them.
export type { Highlight, Insights as DoseInsights } from "../../../backend/src/views/insights";
export type { ReadingSeries, ReadingSeriesPoint } from "../../../backend/src/views/readings";

import type { Insights as DoseInsightsShape } from "../../../backend/src/views/insights";
import type { ReadingSeries } from "../../../backend/src/views/readings";

/** What GET …/insights returns: the dose analytics plus one series per daily check. */
export type Insights = DoseInsightsShape & { readings: ReadingSeries[] };
