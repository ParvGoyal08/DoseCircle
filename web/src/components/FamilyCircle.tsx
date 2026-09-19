import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export type CircleStage = "idle" | "reminding" | "checking" | "alerting" | "everyone" | "claimed" | "taken" | "late" | "unresolved";

export interface CirclePerson {
  id: string;
  name: string;
  role: string;
}

export interface FamilyCircleProps {
  parent: CirclePerson;
  members: CirclePerson[];
  stage: CircleStage;
  /** Members alerted so far, in order. */
  alertedIds: string[];
  claimedById: string | null;
  parentOffline: boolean;
  missClass: "MISSED" | "OFFLINE" | null;
  /** "dark" for the ink hero and the demo; "light" for a white page. */
  tone?: "dark" | "light";
}

const W = 640;
const H = 380;
const PARENT = { x: 140, y: 180 };
/**
 * Two palettes, because the pastel tints that read on ink vanish on white. On white the status
 * colours are the deep versions of the same hues, each at least 4.5:1 against the page.
 */
const PALETTES = {
  dark: { active: "#F4B400", green: "#4ADE9A", blue: "#AFB4FF", red: "#FF8A80", grey: "#B3BCCD", node: "#1F1E55", initial: "#FFFFFF", name: "#FFFFFF", sub: "#C7C8E6", tagFill: "rgb(255 255 255 / 0.08)", tagText: "#FFFFFF", track: "rgb(255 255 255 / 0.12)", quietRing: "rgb(255 255 255 / 0.3)", quietPath: "rgb(255 255 255 / 0.18)", idleParent: "rgb(255 255 255 / 0.35)" },
  light: { active: "#B45309", green: "#047857", blue: "#1D4ED8", red: "#B91C1C", grey: "#64748B", node: "#FFFFFF", initial: "#14133A", name: "#14133A", sub: "#4A4B68", tagFill: "#FFFFFF", tagText: "#14133A", track: "rgb(20 19 58 / 0.14)", quietRing: "rgb(20 19 58 / 0.2)", quietPath: "rgb(20 19 58 / 0.16)", idleParent: "rgb(20 19 58 / 0.25)" },
} as const;
type Palette = (typeof PALETTES)[keyof typeof PALETTES];

function memberPoint(index: number, count: number) {
  if (count === 1) return { x: 500, y: H / 2 };
  const top = 92;
  const bottom = H - 104;
  return { x: 500, y: top + (index * (bottom - top)) / (count - 1) };
}

function pathTo(point: { x: number; y: number }) {
  const midX = (PARENT.x + point.x) / 2;
  return `M${PARENT.x + 52} ${PARENT.y} C${midX} ${PARENT.y} ${midX} ${point.y} ${point.x - 42} ${point.y}`;
}

function Tag({ x, y, color, children, anchor = "middle", palette }: { x: number; y: number; color: string; children: string; anchor?: "middle" | "start"; palette: Palette }) {
  const width = children.length * 7.1 + 22;
  const left = anchor === "middle" ? x - width / 2 : x;
  return (
    <motion.g initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
      <rect x={left} y={y - 13} width={width} height="26" rx="13" fill={palette.tagFill} stroke={color} strokeOpacity="0.55" />
      <circle cx={left + 12} cy={y} r="3.5" fill={color} />
      <text x={left + 21} y={y + 4.5} fontSize="13" fontWeight="600" fill={palette.tagText} fontFamily="Inter Variable, sans-serif">
        {children}
      </text>
    </motion.g>
  );
}

function Node({ x, y, r, name, sub, ring, glow, pulse, palette }: { x: number; y: number; r: number; name: string; sub: string; ring: string; glow: boolean; pulse: boolean; palette: Palette }) {
  const reduceMotion = useReducedMotion();
  return (
    <g>
      {glow && <circle cx={x} cy={y} r={r + 16} fill={ring} opacity="0.14" />}
      {pulse && !reduceMotion && <circle cx={x} cy={y} r={r + 4} fill="none" stroke={ring} strokeWidth="2" className="animate-pulse-ring" style={{ transformBox: "fill-box", transformOrigin: "center" }} />}
      <circle cx={x} cy={y} r={r} fill={palette.node} stroke={ring} strokeWidth="2.5" />
      <text x={x} y={y + r * 0.32} textAnchor="middle" fontSize={r * 0.82} fontWeight="600" fill={palette.initial} fontFamily="Inter Variable, sans-serif">
        {[...name][0]?.toUpperCase()}
      </text>
      <text x={x} y={y + r + 24} textAnchor="middle" fontSize="15" fontWeight="600" fill={palette.name} fontFamily="Inter Variable, sans-serif">
        {name}
      </text>
      <text x={x} y={y + r + 42} textAnchor="middle" fontSize="12.5" fill={palette.sub} fontFamily="Inter Variable, sans-serif">
        {sub}
      </text>
    </g>
  );
}

/**
 * The escalation as a live diagram on the ink hero: the reminder pulses at the parent, and if nobody
 * taps, the alert travels to each person in the family's order until someone takes responsibility.
 */
export function FamilyCircle({ parent, members, stage, alertedIds, claimedById, parentOffline, missClass, tone = "dark" }: FamilyCircleProps) {
  const reduceMotion = useReducedMotion();
  const palette = PALETTES[tone];
  const { active: HALDI, green: GREEN, blue: BLUE, red: RED, grey: GREY } = palette;
  const resolved = stage === "claimed" || stage === "taken" || stage === "late";
  const currentId = stage === "alerting" ? alertedIds[alertedIds.length - 1] : null;
  const parentRing = stage === "taken" || stage === "late" ? GREEN : stage === "alerting" || stage === "everyone" || stage === "unresolved" ? (missClass === "OFFLINE" ? GREY : RED) : stage === "reminding" || stage === "checking" ? HALDI : palette.idleParent;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Family escalation diagram">
      {members.map((member, index) => {
        const point = memberPoint(index, members.length);
        const d = pathTo(point);
        const alerted = alertedIds.includes(member.id) || stage === "everyone";
        const isClaimer = claimedById === member.id;
        const color = isClaimer ? BLUE : alerted && !resolved ? HALDI : resolved && alerted ? GREEN : palette.quietPath;
        const flowing = (currentId === member.id || stage === "everyone") && !reduceMotion;
        return (
          <g key={member.id}>
            <path d={d} fill="none" stroke={palette.track} strokeWidth="2" strokeDasharray="3 6" />
            <motion.path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" initial={false} animate={{ pathLength: alerted || isClaimer ? 1 : 0, opacity: alerted || isClaimer ? 1 : 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
            {flowing &&
              [0, 0.7].map((begin) => (
                <circle key={begin} r="5" fill={HALDI}>
                  <animateMotion dur="1.4s" begin={`${begin}s`} repeatCount="indefinite" path={d} />
                </circle>
              ))}
          </g>
        );
      })}

      <Node x={PARENT.x} y={PARENT.y} r={46} name={parent.name} sub={parent.role} ring={parentRing} glow={stage !== "idle"} pulse={stage === "reminding" || stage === "checking"} palette={palette} />
      <AnimatePresence>
        {stage === "reminding" && (
          <Tag palette={palette} key="remind" x={PARENT.x} y={PARENT.y - 76} color={parentOffline ? GREY : HALDI}>
            {parentOffline ? "Reminder waiting" : "Reminder ringing"}
          </Tag>
        )}
        {stage === "checking" && (
          <Tag palette={palette} key="check" x={PARENT.x} y={PARENT.y - 76} color={HALDI}>
            Checking delivery
          </Tag>
        )}
        {(stage === "alerting" || stage === "everyone") && (
          <Tag palette={palette} key="miss" x={PARENT.x} y={PARENT.y - 76} color={missClass === "OFFLINE" ? GREY : RED}>
            {missClass === "OFFLINE" ? "Phone offline" : "Dose missed"}
          </Tag>
        )}
        {(stage === "taken" || stage === "late") && (
          <Tag palette={palette} key="taken" x={PARENT.x} y={PARENT.y - 76} color={GREEN}>
            {stage === "late" ? "Taken late" : "Taken"}
          </Tag>
        )}
        {stage === "unresolved" && (
          <Tag palette={palette} key="unresolved" x={PARENT.x} y={PARENT.y - 76} color={RED}>
            Nobody responded
          </Tag>
        )}
      </AnimatePresence>

      {members.map((member, index) => {
        const point = memberPoint(index, members.length);
        const isClaimer = claimedById === member.id;
        const alerted = alertedIds.includes(member.id) || stage === "everyone";
        const ring = isClaimer ? BLUE : currentId === member.id ? HALDI : alerted ? (resolved ? GREEN : HALDI) : palette.quietRing;
        const status = isClaimer ? "Handling it" : stage === "claimed" && alerted ? "Stood down" : currentId === member.id ? "Being asked" : stage === "everyone" ? "Alerted" : null;
        return (
          <g key={member.id}>
            <Node x={point.x} y={point.y} r={34} name={member.name} sub={`${index + 1}${["st", "nd", "rd"][index] ?? "th"} in line`} ring={ring} glow={isClaimer || currentId === member.id} pulse={currentId === member.id} palette={palette} />
            <AnimatePresence>
              {status && (
                <Tag palette={palette} key={status} x={point.x} y={point.y - 58} color={isClaimer ? BLUE : status === "Stood down" ? GREY : HALDI}>
                  {status}
                </Tag>
              )}
            </AnimatePresence>
          </g>
        );
      })}
    </svg>
  );
}
