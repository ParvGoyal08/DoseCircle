import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

/** A marigold and mango-leaf toran strung along the top of a section. */
export function Garland({ className, count = 24 }: { className?: string; count?: number }) {
  const step = 40;
  const width = count * step;
  return (
    <svg viewBox={`0 0 ${width} 64`} preserveAspectRatio="xMidYMin slice" className={className} aria-hidden>
      <path d={`M0 6 ${Array.from({ length: count }, (_, i) => `Q${i * step + step / 2} 22 ${(i + 1) * step} 6`).join(" ")}`} stroke="#2f9e6b" strokeWidth="2.5" fill="none" />
      {Array.from({ length: count }, (_, i) => {
        const x = i * step + step / 2;
        const orange = i % 2 === 0;
        return (
          <g key={i}>
            <path d={`M${x - 7} 14 q7 26 7 30 q0 -4 7 -30 z`} fill="#2f9e6b" stroke="#1c1917" strokeWidth="1.4" opacity={i % 3 === 0 ? 1 : 0} />
            <circle cx={x} cy="16" r="9" fill={orange ? "#ff8a1f" : "#f4b400"} stroke="#1c1917" strokeWidth="1.6" />
            <circle cx={x} cy="16" r="4" fill={orange ? "#f4b400" : "#ff8a1f"} />
            <circle cx={x} cy="32" r="6" fill={orange ? "#f4b400" : "#ff8a1f"} stroke="#1c1917" strokeWidth="1.4" opacity={i % 3 === 0 ? 0 : 1} />
          </g>
        );
      })}
    </svg>
  );
}

/** A small rangoli flower used as a bullet or corner ornament. */
export function Rangoli({ size = 48, className, colors = ["#ff8a1f", "#f4b400", "#3b39a3"] }: { size?: number; className?: string; colors?: string[] }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <ellipse key={i} cx="24" cy="11" rx="5" ry="10" fill={colors[i % 2 === 0 ? 0 : 1]} stroke="#1c1917" strokeWidth="1.3" transform={`rotate(${i * 45} 24 24)`} />
      ))}
      <circle cx="24" cy="24" r="7" fill={colors[2]} stroke="#1c1917" strokeWidth="1.3" />
      <circle cx="24" cy="24" r="2.5" fill="#fff8ec" />
    </svg>
  );
}

/** Marigold petals falling once: the celebration when a dose is taken or someone takes responsibility. */
export function PetalBurst({ burstKey, count = 22 }: { burstKey: string | number | null; count?: number }) {
  const reduceMotion = useReducedMotion();
  const petals = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: 5 + ((i * 37) % 90),
        delay: (i % 7) * 0.05,
        drift: ((i * 53) % 60) - 30,
        rotate: ((i * 97) % 360) - 180,
        color: ["#ff8a1f", "#f4b400", "#ff6f91", "#2f9e6b"][i % 4],
        size: 8 + (i % 4) * 3,
      })),
    // New petals for each burst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [burstKey, count],
  );
  if (burstKey === null || reduceMotion) return null;
  return (
    <div key={burstKey} className="pointer-events-none absolute inset-0 z-50 overflow-hidden" aria-hidden>
      {petals.map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-0 block rounded-[60%_0_60%_0]"
          style={{ left: `${p.left}%`, width: p.size, height: p.size * 1.4, background: p.color, border: "1.5px solid #1c1917" }}
          initial={{ y: -30, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: 520, x: p.drift, rotate: p.rotate, opacity: [1, 1, 0] }}
          transition={{ duration: 1.8, delay: p.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}

/** Time-of-day scene for the parent's reminder header: sun rising over a kolam, or a moon at night. */
export function SlotScene({ slot, className }: { slot: "morning" | "afternoon" | "evening" | "night"; className?: string }) {
  const sky = { morning: "#FFE3C7", afternoon: "#DCEFFF", evening: "#FFD0B0", night: "#25236E" }[slot];
  const night = slot === "night";
  const sunY = { morning: 44, afternoon: 26, evening: 50, night: 30 }[slot];
  return (
    <svg viewBox="0 0 160 80" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <rect width="160" height="80" fill={sky} />
      {night ? (
        <g>
          {[
            [20, 16],
            [48, 30],
            [130, 14],
            [112, 36],
            [70, 12],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.6" fill="#fff0c2" />
          ))}
          <circle cx="118" cy={sunY} r="14" fill="#fff0c2" stroke="#1c1917" strokeWidth="2" />
          <circle cx="124" cy={sunY - 4} r="12" fill={sky} />
        </g>
      ) : (
        <g>
          {Array.from({ length: 10 }, (_, i) => (
            <path key={i} d={`M118 ${sunY} l0 -24`} stroke="#ff8a1f" strokeWidth="3" strokeLinecap="round" transform={`rotate(${i * 36} 118 ${sunY})`} />
          ))}
          <circle cx="118" cy={sunY} r="14" fill="#f4b400" stroke="#1c1917" strokeWidth="2" />
        </g>
      )}
      {/* kolam ground */}
      <path d="M0 62 Q40 54 80 62 T160 62 V80 H0 Z" fill={night ? "#3b39a3" : "#fff8ec"} stroke="#1c1917" strokeWidth="2" />
      {Array.from({ length: 9 }, (_, i) => (
        <circle key={i} cx={10 + i * 18} cy="72" r="1.8" fill={night ? "#f4b400" : "#1c1917"} opacity="0.5" />
      ))}
    </svg>
  );
}
