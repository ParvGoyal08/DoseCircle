import type { DoseStatus, LanguageCode, MissClass, NotationResult, SlotCounts } from "@dosecircle/shared";
import type { ExtractedMedicine } from "../ai/schema.js";
import type { OcrLineWithBox } from "../ai/textract.js";

/** DynamoDB item shapes. Keys are built only through @dosecircle/shared `keys`. */

export interface ParentItem {
  PK: string;
  SK: string;
  fid: string;
  pid: string;
  displayName: string;
  lang: LanguageCode;
  /** Ordered member ids for the escalation ladder. */
  ladder: string[];
  consecutiveMisses: number;
  paused: boolean;
  slotTimes: Record<string, string>;
  /** Last time any paired phone acknowledged a reminder: the family's "phone reachable" signal. */
  lastReceiptAt?: string;
  ttl?: number;
}

export interface FamilyItem {
  PK: string;
  SK: string;
  fid: string;
  name: string;
  ownerSub?: string;
  createdAt: string;
  ttl?: number;
}

export interface InviteItem {
  PK: string;
  SK: string;
  kind: "member" | "parent";
  fid: string;
  pid?: string;
  createdBy: string;
  consumedAt?: string;
  ttl: number;
}

export interface MemberItem {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  fid: string;
  mid: string;
  sub?: string;
  displayName: string;
  relation?: string;
  /** The owner created the family; only they can invite people and manage paired phones. */
  role: "owner" | "member";
  lang: LanguageCode;
  ttl?: number;
}

export interface MedicineItem {
  PK: string;
  SK: string;
  pid: string;
  medId: string;
  nameAsPrinted: string;
  strength: string | null;
  slots: SlotCounts;
  food: "before" | "after" | null;
  critical: boolean;
  asNeeded: boolean;
  pillsLeft: number | null;
  refillThresholdDays: number;
  refillAlertedAt?: string;
  needsRecount?: boolean;
  endDate?: string;
  active: boolean;
  ttl?: number;
}

export interface SlotItem {
  PK: string;
  SK: string;
  pid: string;
  compactTime: string;
  slotName: "morning" | "afternoon" | "evening" | "night";
  medIds: string[];
  critical: boolean;
  scheduleName?: string;
  ttl?: number;
}

export type DeliveryChannel = "webpush" | "inbox";

export interface DoseItem {
  PK: string;
  SK: string;
  doseId: string;
  fid: string;
  pid: string;
  slotName: SlotItem["slotName"];
  medIds: string[];
  status: DoseStatus;
  critical: boolean;
  missClass?: MissClass;
  scheduledAt: string;
  executionArn: string;
  channel: DeliveryChannel;
  currentToken?: string;
  currentStep?: string;
  deliveredAt?: string;
  takenAt?: string;
  claimedBy?: string;
  claimedAt?: string;
  alertedMemberIds?: Set<string>;
  GSI2PK?: string;
  GSI2SK?: string;
  ttl?: number;
}

export interface DeviceItem {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  deviceId: string;
  pairedAt?: string;
  fid: string;
  pid: string;
  lang: LanguageCode;
  revoked: boolean;
  lastReceiptAt?: string;
}

export interface PushSubscriptionItem {
  PK: string;
  SK: string;
  subjectId: string;
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  lang: LanguageCode;
}

export type PrescriptionStatus = "AWAITING_UPLOAD" | "EXTRACTING" | "READY" | "FAILED" | "CONFIRMED";

export interface PrescriptionRow {
  rowId: string;
  level: "red" | "amber" | "green";
  reasons: string[];
  medicine: ExtractedMedicine;
  schedule: NotationResult;
}

export interface PrescriptionItem {
  PK: string;
  SK: string;
  rxId: string;
  fid: string;
  pid: string;
  status: PrescriptionStatus;
  createdBy: string;
  createdAt: string;
  /** The family member agreed the photo may be read by AI, possibly outside India. */
  consentAt: string;
  failure?: "unreadable" | "upload_incomplete" | "no_medicines" | "error";
  lines?: OcrLineWithBox[];
  rows?: PrescriptionRow[];
  modelId?: string;
  guardrailInterventions?: number;
  extractionMs?: number;
  confirmedAt?: string;
  confirmedBy?: string;
  medIds?: string[];
  ttl?: number;
}
