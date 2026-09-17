/** Escalation timings in real seconds. */
export interface LadderTimings {
  /** How long the parent has to tap Taken after the first reminder. */
  parentWaitSeconds: number;
  /** Extra wait after a nudge; 0 means no nudge. */
  nudgeWaitSeconds: number;
  /** How long each family member has to claim before the next one is alerted. */
  claimWaitSeconds: number;
  /** How long the whole family has once everyone has been alerted. */
  finalWaitSeconds: number;
}

export const STANDARD_LADDER: Readonly<LadderTimings> = {
  parentWaitSeconds: 20 * 60,
  nudgeWaitSeconds: 10 * 60,
  claimWaitSeconds: 15 * 60,
  finalWaitSeconds: 60 * 60,
};

export const FAST_LADDER: Readonly<LadderTimings> = {
  parentWaitSeconds: 10 * 60,
  nudgeWaitSeconds: 0,
  claimWaitSeconds: 5 * 60,
  finalWaitSeconds: 30 * 60,
};

export type LadderKind = "standard" | "fast";

/** Critical medicines, or a parent who missed the previous dose, escalate faster. */
export function chooseLadder(input: { critical: boolean; consecutiveMisses: number }): LadderKind {
  return input.critical || input.consecutiveMisses >= 1 ? "fast" : "standard";
}

/** Shortest wait we ever allow, so demo mode stays readable and Step Functions never gets 0. */
export const MIN_WAIT_SECONDS = 5;

/**
 * Divide timings by a speed factor (demo mode uses 60, tests use 600).
 * A zero wait stays zero (it means "skip this step"); anything else is at least MIN_WAIT_SECONDS.
 */
export function scaleTimings(timings: LadderTimings, speed: number): LadderTimings {
  if (!Number.isFinite(speed) || speed < 1) {
    throw new Error(`Speed must be a number ≥ 1, got ${speed}`);
  }
  const scale = (seconds: number) =>
    seconds === 0 ? 0 : Math.max(MIN_WAIT_SECONDS, Math.round(seconds / speed));
  return {
    parentWaitSeconds: scale(timings.parentWaitSeconds),
    nudgeWaitSeconds: scale(timings.nudgeWaitSeconds),
    claimWaitSeconds: scale(timings.claimWaitSeconds),
    finalWaitSeconds: scale(timings.finalWaitSeconds),
  };
}

export function timingsFor(kind: LadderKind, speed = 1): LadderTimings {
  return scaleTimings(kind === "fast" ? FAST_LADDER : STANDARD_LADDER, speed);
}
