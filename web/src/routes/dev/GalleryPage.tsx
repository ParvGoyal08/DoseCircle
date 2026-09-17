import { Character, InitialBadge, type Mood } from "../../components/illustrations/Characters";
import { Garland, Rangoli, SlotScene } from "../../components/illustrations/Festive";

/** Development only: every illustration side by side, for visual checks. */
export function GalleryPage() {
  const moods: Mood[] = ["calm", "happy", "worried"];
  return (
    <div className="min-h-dvh bg-paper p-8">
      <Garland className="h-12 w-full" />
      <div className="mt-6 flex flex-wrap gap-6">
        {(["amma", "arjun", "meera"] as const).map((who) => moods.map((mood) => <Character key={who + mood} who={who} mood={mood} size={140} />))}
      </div>
      <div className="mt-6 flex items-center gap-4">
        <InitialBadge name="Ravi" size={56} />
        <InitialBadge name="Lakshmi" size={56} />
        <Rangoli size={64} />
        {(["morning", "afternoon", "evening", "night"] as const).map((s) => (
          <SlotScene key={s} slot={s} className="h-24 w-48 rounded-2xl border-2 border-ink" />
        ))}
      </div>
      <div className="kolam mt-6 h-40 rounded-2xl border-2 border-ink" />
      <div className="kolam-light mt-6 h-40 rounded-2xl border-2 border-ink bg-indigo" />
      <p className="font-display mt-6 text-7xl">When Amma misses her medicine</p>
    </div>
  );
}
