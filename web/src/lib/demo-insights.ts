import { buildDemoSeed } from "../../../backend/src/demo/fixtures";
import type { DoseItem, MedicineItem } from "../../../backend/src/lib/model";
import { buildInsights, istDateOf } from "../../../backend/src/views/insights";
import type { Insights } from "./types";

/**
 * Insights for the demo family computed in the browser from the same fixture and builder the API uses,
 * so the offline simulation and development fixtures show exactly what AWS would return.
 */
export function demoInsights(days: 7 | 30, now = Date.now()): Insights {
  const seed = buildDemoSeed({ sid: "s-simulated00", now, ttl: Math.floor(now / 1000) + 7200 });
  const doses = seed.items.filter((i) => String(i.SK).startsWith("DOSE#")) as unknown as DoseItem[];
  const medicines = seed.items.filter((i) => String(i.SK).startsWith("MED#")) as unknown as MedicineItem[];
  const to = istDateOf(now - 86_400_000);
  const from = istDateOf(Date.parse(`${to}T12:00:00+05:30`) - (days - 1) * 86_400_000);
  return buildInsights({
    doses: doses.filter((d) => istDateOf(d.scheduledAt) >= from),
    previousDoses: doses.filter((d) => istDateOf(d.scheduledAt) < from),
    medicines,
    ladder: [
      { mid: seed.sonId, displayName: "Arjun" },
      { mid: seed.daughterId, displayName: "Meera" },
    ],
    to,
    days,
    now,
  });
}
