import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Character, type CharacterId, type Mood } from "./illustrations/Characters";

export type CircleStage = "idle" | "reminding" | "checking" | "alerting" | "everyone" | "claimed" | "taken" | "late" | "unresolved";

export interface CirclePerson {
  id: string;
  name: string;
  role: string;
  character: CharacterId;
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
}

const W = 640;
const H = 400;
const PARENT = { x: 150, y: 200 };

function memberPoint(index: number, count: number) {
  const spread = count === 1 ? 0 : 150;
  const y = H / 2 - spread / 2 - (count > 2 ? 40 : 0) + (count === 1 ? 0 : (index * (spread + (count > 2 ? 80 : 0))) / (count - 1));
  return { x: 500, y };
}

function pathTo(point: { x: number; y: number }, index: number) {
  const bend = index % 2 === 0 ? -70 : 70;
  const midX = (PARENT.x + point.x) / 2;
  const midY = (PARENT.y + point.y) / 2 + bend;
  return `M${PARENT.x + 60} ${PARENT.y} Q${midX} ${midY} ${point.x - 56} ${point.y}`;
}

function Bubble({ x, y, tone, children }: { x: number; y: number; tone: "haldi" | "rose" | "blue" | "green" | "grey" | "indigo"; children: string }) {
  const fill = { haldi: "#fff0c2", rose: "#fde8e5", blue: "#e4ecff", green: "#e2f5ea", grey: "#eceff4", indigo: "#e7e6ff" }[tone];
  const text = { haldi: "#1c1917", rose: "#b42318", blue: "#1d4ed8", green: "#146c3e", grey: "#475467", indigo: "#25236e" }[tone];
  const width = children.length * 7.4 + 26;
  return (
    <motion.g initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 22 }} style={{ transformOrigin: `${x}px ${y}px` }}>
      <rect x={x - width / 2 + 3} y={y - 15 + 3} width={width} height="30" rx="15" fill="#1c1917" />
      <rect x={x - width / 2} y={y - 15} width={width} height="30" rx="15" fill={fill} stroke="#1c1917" strokeWidth="2" />
      <text x={x} y={y + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill={text} fontFamily="Anek Latin Variable, sans-serif">
        {children}
      </text>
    </motion.g>
  );
}

/**
 * The escalation, drawn as the family itself: a reminder rings at Amma, and if nobody taps, the alert
 * travels along the thread to each person in the family's order until someone takes responsibility.
 */
export function FamilyCircle({ parent, members, stage, alertedIds, claimedById, parentOffline, missClass }: FamilyCircleProps) {
  const reduceMotion = useReducedMotion();
  const resolved = stage === "claimed" || stage === "taken" || stage === "late";
  const currentId = stage === "alerting" ? alertedIds[alertedIds.length - 1] : null;

  const parentMood: Mood = stage === "taken" || stage === "late" || stage === "claimed" ? "happy" : stage === "idle" ? "calm" : stage === "reminding" ? "calm" : "worried";
  const memberMood = (id: string): Mood => {
    if (stage === "claimed") return id === claimedById ? "happy" : "calm";
    if (stage === "taken" || stage === "late") return "happy";
    if (stage === "everyone" || stage === "unresolved") return "worried";
    return alertedIds.includes(id) ? "worried" : "calm";
  };

  return (
    <svg viewBox={`0 20 ${W} ${H - 20}`} className="h-auto w-full" role="img" aria-label="Family escalation diagram">
      {/* the kolam thread that ties the family together */}
      <circle cx={W / 2} cy={H / 2} r="178" fill="none" stroke="#1c1917" strokeOpacity="0.12" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" />
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return <circle key={i} cx={W / 2 + Math.cos(a) * 178} cy={H / 2 + Math.sin(a) * 178} r="3" fill="#f4b400" stroke="#1c1917" strokeWidth="1" opacity="0.7" />;
      })}

      {members.map((member, index) => {
        const point = memberPoint(index, members.length);
        const d = pathTo(point, index);
        const alerted = alertedIds.includes(member.id) || stage === "everyone" || (stage === "unresolved" && alertedIds.length > 0);
        const isClaimer = claimedById === member.id;
        const lit = isClaimer ? "#1d4ed8" : alerted && !resolved ? "#ff8a1f" : resolved && alerted ? "#2f9e6b" : "#d6c6a8";
        const flowing = (currentId === member.id || stage === "everyone") && !reduceMotion;
        return (
          <g key={member.id}>
            <path d={d} fill="none" stroke="#1c1917" strokeWidth="9" strokeLinecap="round" opacity={alerted ? 1 : 0.15} />
            <path d={d} fill="none" stroke={lit} strokeWidth="5" strokeLinecap="round" strokeDasharray={alerted ? "0" : "4 10"} />
            {flowing &&
              [0, 0.6, 1.2].map((begin) => (
                <circle key={begin} r="7" fill="#f4b400" stroke="#1c1917" strokeWidth="2">
                  <animateMotion dur="1.8s" begin={`${begin}s`} repeatCount="indefinite" path={d} />
                </circle>
              ))}
            {isClaimer && !reduceMotion && (
              <circle r="8" fill="#1d4ed8" stroke="#1c1917" strokeWidth="2">
                <animateMotion dur="1.2s" repeatCount="1" keyPoints="1;0" keyTimes="0;1" calcMode="linear" path={d} fill="freeze" />
              </circle>
            )}
          </g>
        );
      })}

      {/* parent */}
      <g>
        {(stage === "reminding" || stage === "checking") && !reduceMotion && (
          <circle cx={PARENT.x} cy={PARENT.y} r="62" fill="none" stroke="#ff8a1f" strokeWidth="4" className="origin-center animate-pulse-ring" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
        )}
        <circle cx={PARENT.x + 4} cy={PARENT.y + 4} r="62" fill="#1c1917" />
        <Character who={parent.character} mood={parentMood} size={124} x={PARENT.x - 62} y={PARENT.y - 62} ring={stage === "taken" || stage === "late" ? "#146c3e" : undefined} />
        <text x={PARENT.x} y={PARENT.y + 90} textAnchor="middle" fontSize="20" fontWeight="800" fill="#1c1917" fontFamily="Anek Latin Variable, sans-serif">
          {parent.name}
        </text>
        <text x={PARENT.x} y={PARENT.y + 110} textAnchor="middle" fontSize="14" fill="#57534e" fontFamily="Anek Latin Variable, sans-serif">
          {parent.role}
        </text>
        <AnimatePresence>
          {stage === "reminding" && !parentOffline && (
            <Bubble key="remind" x={PARENT.x} y={PARENT.y - 88} tone="haldi">
              Reminder ringing
            </Bubble>
          )}
          {stage === "reminding" && parentOffline && (
            <Bubble key="offline" x={PARENT.x} y={PARENT.y - 88} tone="grey">
              Phone offline
            </Bubble>
          )}
          {(stage === "alerting" || stage === "everyone") && (
            <Bubble key="miss" x={PARENT.x} y={PARENT.y - 88} tone={missClass === "OFFLINE" ? "grey" : "rose"}>
              {missClass === "OFFLINE" ? "Phone seems offline" : "Dose not confirmed"}
            </Bubble>
          )}
          {(stage === "taken" || stage === "late") && (
            <Bubble key="taken" x={PARENT.x} y={PARENT.y - 88} tone="green">
              {stage === "late" ? "Taken, a little late" : "Taken on time"}
            </Bubble>
          )}
          {stage === "unresolved" && (
            <Bubble key="unresolved" x={PARENT.x} y={PARENT.y - 88} tone="rose">
              Nobody responded
            </Bubble>
          )}
        </AnimatePresence>
      </g>

      {/* family members */}
      {members.map((member, index) => {
        const point = memberPoint(index, members.length);
        const isClaimer = claimedById === member.id;
        const alerted = alertedIds.includes(member.id);
        const standDown = stage === "claimed" && alerted && !isClaimer;
        return (
          <g key={member.id}>
            <circle cx={point.x + 3} cy={point.y + 3} r="48" fill="#1c1917" />
            <Character who={member.character} mood={memberMood(member.id)} size={96} x={point.x - 48} y={point.y - 48} ring={isClaimer ? "#1d4ed8" : undefined} />
            <text x={point.x + 62} y={point.y - 4} fontSize="19" fontWeight="800" fill="#1c1917" fontFamily="Anek Latin Variable, sans-serif">
              {member.name}
            </text>
            <text x={point.x + 62} y={point.y + 16} fontSize="14" fill="#57534e" fontFamily="Anek Latin Variable, sans-serif">
              {`${index + 1}${["st", "nd", "rd"][index] ?? "th"} in line`}
            </text>
            <AnimatePresence>
              {isClaimer && (
                <Bubble key="claim" x={point.x} y={point.y - 66} tone="blue">
                  I'll handle it
                </Bubble>
              )}
              {standDown && (
                <Bubble key="stand" x={point.x} y={point.y - 66} tone="grey">
                  Standing down
                </Bubble>
              )}
              {!resolved && currentId === member.id && (
                <Bubble key="asked" x={point.x} y={point.y - 66} tone="haldi">
                  Being asked now
                </Bubble>
              )}
              {stage === "everyone" && (
                <Bubble key="everyone" x={point.x} y={point.y - 66} tone="rose">
                  Everyone alerted
                </Bubble>
              )}
            </AnimatePresence>
          </g>
        );
      })}
    </svg>
  );
}
