import { useId } from "react";

export type CharacterId = "amma" | "arjun" | "meera";
export type Mood = "calm" | "happy" | "worried";

const BACKDROPS: Record<CharacterId, string> = { amma: "#FFE3C7", arjun: "#DCEFFF", meera: "#FFE0E8" };

function Face({ mood, skin, x = 60, y = 54 }: { mood: Mood; skin: string; x?: number; y?: number }) {
  const eyeY = y - 1;
  return (
    <g>
      {/* cheeks */}
      <ellipse cx={x - 13} cy={y + 8} rx="4.5" ry="3" fill="#FF6F91" opacity="0.28" />
      <ellipse cx={x + 13} cy={y + 8} rx="4.5" ry="3" fill="#FF6F91" opacity="0.28" />
      {/* eyes */}
      {mood === "happy" ? (
        <g stroke="#1C1917" strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path d={`M${x - 12} ${eyeY + 1} q4 -5 8 0`} />
          <path d={`M${x + 4} ${eyeY + 1} q4 -5 8 0`} />
        </g>
      ) : (
        <g fill="#1C1917">
          <circle cx={x - 8} cy={eyeY} r="2.8" />
          <circle cx={x + 8} cy={eyeY} r="2.8" />
          <circle cx={x - 7} cy={eyeY - 1} r="0.9" fill="#fff" />
          <circle cx={x + 9} cy={eyeY - 1} r="0.9" fill="#fff" />
        </g>
      )}
      {/* brows */}
      <g stroke="#1C1917" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.85">
        {mood === "worried" ? (
          <>
            <path d={`M${x - 13} ${eyeY - 8} l8 -3`} />
            <path d={`M${x + 13} ${eyeY - 8} l-8 -3`} />
          </>
        ) : (
          <>
            <path d={`M${x - 13} ${eyeY - 8} q4 -3 8 -1`} />
            <path d={`M${x + 5} ${eyeY - 9} q4 -2 8 1`} />
          </>
        )}
      </g>
      {/* nose */}
      <path d={`M${x} ${y + 1} q-2 5 1 6`} stroke={shade(skin)} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* mouth */}
      {mood === "happy" && <path d={`M${x - 8} ${y + 11} q8 9 16 0 z`} fill="#7A1E3A" stroke="#1C1917" strokeWidth="1.5" strokeLinejoin="round" />}
      {mood === "calm" && <path d={`M${x - 6} ${y + 12} q6 5 12 0`} stroke="#1C1917" strokeWidth="2.4" fill="none" strokeLinecap="round" />}
      {mood === "worried" && <path d={`M${x - 6} ${y + 15} q6 -5 12 0`} stroke="#1C1917" strokeWidth="2.4" fill="none" strokeLinecap="round" />}
    </g>
  );
}

function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.8);
  const g = Math.round(((n >> 8) & 255) * 0.8);
  const b = Math.round((n & 255) * 0.8);
  return `rgb(${r} ${g} ${b})`;
}

function Amma({ mood }: { mood: Mood }) {
  const skin = "#B9774C";
  return (
    <g>
      {/* saree: marigold with a haldi border draped over the shoulder */}
      <path d="M14 124 C16 96 36 84 60 84 C84 84 104 96 106 124 Z" fill="#FF8A1F" stroke="#1C1917" strokeWidth="2.5" />
      <path d="M36 88 C52 100 70 112 84 124" stroke="#F4B400" strokeWidth="7" fill="none" />
      <path d="M36 88 C52 100 70 112 84 124" stroke="#7A1E3A" strokeWidth="2" strokeDasharray="2 5" fill="none" />
      <rect x="51" y="70" width="18" height="18" rx="7" fill={shade(skin)} />
      {/* hair: grey, centre parting, bun */}
      <circle cx="60" cy="24" r="11" fill="#8E8A86" stroke="#1C1917" strokeWidth="2.5" />
      <ellipse cx="60" cy="52" rx="24" ry="27" fill={skin} stroke="#1C1917" strokeWidth="2.5" />
      <path d="M36 50 C36 30 48 24 60 24 C72 24 84 30 84 50 C78 38 70 34 60 34 C50 34 42 38 36 50 Z" fill="#A5A19C" stroke="#1C1917" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M60 25 V34" stroke="#D7263D" strokeWidth="2" />
      {/* bindi and earrings */}
      <circle cx="60" cy="42" r="2.6" fill="#D7263D" />
      <circle cx="36" cy="62" r="3" fill="#F4B400" stroke="#1C1917" strokeWidth="1.5" />
      <circle cx="84" cy="62" r="3" fill="#F4B400" stroke="#1C1917" strokeWidth="1.5" />
      <Face mood={mood} skin={skin} y={56} />
      {/* round glasses */}
      <g fill="none" stroke="#1C1917" strokeWidth="2">
        <circle cx="52" cy="55" r="7.5" />
        <circle cx="68" cy="55" r="7.5" />
        <path d="M59.5 55 h1" />
      </g>
    </g>
  );
}

function Arjun({ mood }: { mood: Mood }) {
  const skin = "#A86B43";
  return (
    <g>
      <path d="M14 124 C16 96 36 86 60 86 C84 86 104 96 106 124 Z" fill="#3B39A3" stroke="#1C1917" strokeWidth="2.5" />
      <path d="M50 88 L60 102 L70 88" fill="#DCEFFF" stroke="#1C1917" strokeWidth="2.2" strokeLinejoin="round" />
      <rect x="51" y="70" width="18" height="20" rx="7" fill={shade(skin)} />
      <ellipse cx="60" cy="52" rx="23" ry="26" fill={skin} stroke="#1C1917" strokeWidth="2.5" />
      {/* short hair with a quiff */}
      <path d="M36 50 C33 30 44 20 60 20 C76 20 88 28 84 48 C80 38 74 34 66 34 C62 28 50 30 44 36 C40 40 38 44 36 50 Z" fill="#1C1917" />
      {/* stubble */}
      <path d="M42 64 C46 78 74 78 78 64 C74 72 46 72 42 64 Z" fill="#1C1917" opacity="0.18" />
      <Face mood={mood} skin={skin} y={55} />
    </g>
  );
}

function Meera({ mood }: { mood: Mood }) {
  const skin = "#C98A5E";
  return (
    <g>
      {/* long hair behind */}
      <path d="M34 50 C30 76 32 98 40 110 L80 110 C88 98 90 76 86 50 Z" fill="#1C1917" />
      <path d="M14 124 C16 96 36 86 60 86 C84 86 104 96 106 124 Z" fill="#2F9E6B" stroke="#1C1917" strokeWidth="2.5" />
      <path d="M44 90 C52 98 68 98 76 90" stroke="#FFF0C2" strokeWidth="3" fill="none" strokeDasharray="1 5" strokeLinecap="round" />
      <rect x="51" y="70" width="18" height="20" rx="7" fill={shade(skin)} />
      <ellipse cx="60" cy="52" rx="22" ry="25" fill={skin} stroke="#1C1917" strokeWidth="2.5" />
      {/* fringe swept to one side */}
      <path d="M37 52 C34 30 46 22 60 22 C76 22 86 32 84 52 C80 40 70 34 56 36 C48 38 42 44 37 52 Z" fill="#1C1917" />
      {/* small bindi, nose stud, jhumka */}
      <circle cx="60" cy="40" r="1.8" fill="#D7263D" />
      <circle cx="66" cy="63" r="1.4" fill="#F4B400" />
      <path d="M38 64 v5" stroke="#F4B400" strokeWidth="2" />
      <path d="M34 70 h8 l-4 5 z" fill="#F4B400" stroke="#1C1917" strokeWidth="1.2" />
      <Face mood={mood} skin={skin} y={54} />
    </g>
  );
}

/**
 * The demo family, drawn. Real families see initial avatars; these characters exist only for the fictional
 * people in the demo and the landing page.
 */
export function Character({ who, mood = "calm", size = 96, ring, className, x, y }: { who: CharacterId; mood?: Mood; size?: number; ring?: string; className?: string; x?: number; y?: number }) {
  const clip = useId();
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} x={x} y={y} className={className} aria-hidden>
      <defs>
        <clipPath id={clip}>
          <circle cx="60" cy="60" r="57" />
        </clipPath>
      </defs>
      <circle cx="60" cy="60" r="57" fill={BACKDROPS[who]} />
      <g clipPath={`url(#${clip})`}>
        {who === "amma" && <Amma mood={mood} />}
        {who === "arjun" && <Arjun mood={mood} />}
        {who === "meera" && <Meera mood={mood} />}
      </g>
      <circle cx="60" cy="60" r="57" fill="none" stroke={ring ?? "#1C1917"} strokeWidth="3.5" />
    </svg>
  );
}

/** Real people get a warm initial badge inside a small kolam ring, never a grey silhouette. */
export function InitialBadge({ name, size = 40 }: { name: string; size?: number }) {
  const fills = ["#FFE3C7", "#DCEFFF", "#FFE0E8", "#D8F3E6", "#E7E6FF", "#FFF0C2"];
  const fill = fills[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % fills.length];
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden className="shrink-0">
      <circle cx="20" cy="20" r="18.5" fill={fill} stroke="#1C1917" strokeWidth="2" />
      <circle cx="20" cy="20" r="14.5" fill="none" stroke="#1C1917" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="1.5 3" />
      <text x="20" y="21" textAnchor="middle" dominantBaseline="middle" fontSize="16" fontWeight="700" fill="#1C1917" fontFamily="Anek Latin Variable, sans-serif">
        {[...name][0]?.toUpperCase()}
      </text>
    </svg>
  );
}
