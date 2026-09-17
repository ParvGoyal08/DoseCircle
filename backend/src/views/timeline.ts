/**
 * "Why am I seeing this?" — one readable timeline per dose, merged from the app's event log and the
 * Step Functions execution history. Each step carries the workflow state it came from, so the
 * family sees the real mechanism rather than a made-up story.
 */

export interface DoseEventRow {
  type: string;
  at: string;
  actorName?: string;
  detail?: { memberIds?: string[]; missClass?: string; memberId?: string; recipient?: string; step?: string; authorizedBy?: string[]; outcome?: string };
}

/** The subset of Step Functions history events the timeline reads. */
export interface HistoryEvent {
  type: string;
  timestamp: string;
  stateName?: string;
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
  /** The Step Functions state behind this step, shown as a small tag. */
  stateName?: string;
  /** Names already resolved for display. */
  people?: string[];
  /** Seconds since the previous item, for "+10 min" labels. */
  sincePreviousSeconds: number | null;
  /** Cedar policies that allowed this action, when relevant. */
  authorizedBy?: string[];
}

const EVENT_KINDS: Record<string, { kind: TimelineKind; stateName?: string }> = {
  REMINDER_SENT: { kind: "reminder_sent", stateName: "RemindParent" },
  NUDGE_SENT: { kind: "nudge_sent", stateName: "NudgeParent" },
  MEMBER_ALERTED: { kind: "member_alerted", stateName: "AlertFamilyMember" },
  FAMILY_ALERTED: { kind: "family_alerted", stateName: "AlertWholeFamily" },
  CLAIMED: { kind: "claimed" },
  TAKEN: { kind: "taken" },
  STAND_DOWN_SENT: { kind: "others_stood_down", stateName: "TellOthersToStandDown" },
};

export function buildTimeline(
  events: readonly DoseEventRow[],
  history: readonly HistoryEvent[],
  memberNames: ReadonlyMap<string, string>,
  parentName: string,
): TimelineItem[] {
  const items: Omit<TimelineItem, "sincePreviousSeconds">[] = [];
  const name = (mid: string) => memberNames.get(mid) ?? mid;

  for (const event of events) {
    if (event.type === "DELIVERED") {
      // Only the parent's reminder receipts matter for "did it reach the phone".
      if (event.detail?.step === "REMIND" || event.detail?.step === "NUDGE") {
        items.push({ at: event.at, kind: "reached_phone", people: [parentName] });
      }
      continue;
    }
    if (event.type === "STAND_DOWN_SENT" && event.detail?.outcome === "TAKEN") {
      // The parent confirmed late; everyone already alerted was told.
      items.push({ at: event.at, kind: "family_told_taken", stateName: "TellFamilyParentTookIt" });
      continue;
    }
    const mapped = EVENT_KINDS[event.type];
    if (!mapped) continue;
    const people =
      event.type === "MEMBER_ALERTED" || event.type === "FAMILY_ALERTED"
        ? (event.detail?.memberIds ?? []).map(name)
        : event.type === "CLAIMED" && event.detail?.memberId
          ? [name(event.detail.memberId)]
          : event.type === "TAKEN"
            ? [parentName]
            : undefined;
    items.push({ at: event.at, kind: mapped.kind, stateName: mapped.stateName, people, authorizedBy: event.detail?.authorizedBy });
  }

  // From the workflow itself: timeouts, how a missed dose was classified, and a silent ending.
  let currentState: string | undefined;
  for (const event of history) {
    if (event.type.endsWith("StateEntered")) currentState = event.stateName;
    if (event.type === "TaskTimedOut" && (currentState === "RemindParent" || currentState === "NudgeParent")) {
      items.push({ at: event.timestamp, kind: "no_confirmation", stateName: currentState });
    }
    if (event.type === "PassStateEntered" && event.stateName === "MarkLikelyMissed") {
      items.push({ at: event.timestamp, kind: "reminder_reached_phone", stateName: "WasReminderDelivered" });
    }
    if (event.type === "PassStateEntered" && event.stateName === "MarkPhoneOffline") {
      items.push({ at: event.timestamp, kind: "phone_seemed_offline", stateName: "WasReminderDelivered" });
    }
    if (event.type === "SucceedStateEntered" && event.stateName === "NobodyResponded") {
      items.push({ at: event.timestamp, kind: "nobody_responded", stateName: "NobodyResponded" });
    }
  }

  items.sort((a, b) => a.at.localeCompare(b.at));
  return items.map((item, index) => {
    const previous = items[index - 1];
    return {
      ...item,
      sincePreviousSeconds: previous ? Math.round((Date.parse(item.at) - Date.parse(previous.at)) / 1000) : null,
    };
  });
}
