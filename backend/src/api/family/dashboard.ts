import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { authorize } from "../../authz/avp.js";
import { familyEntity } from "../../authz/entities.js";
import { memberPrincipal } from "../../authz/principal-entity.js";
import { json, pathParam, principalFrom } from "../../lib/http.js";
import type { FamilyItem } from "../../lib/model.js";
import { get, listRealDoses, listMembers, listOpenDoses, listParents } from "../../lib/repository.js";
import { istDate } from "../../scheduling/plan.js";
import { listMedicines, listSlots } from "../../scheduling/sync-slots.js";
import { ladderPosition, openAlerts, refillChips, weekStrip } from "../../views/dashboard.js";
import { keys } from "@dosecircle/shared";

const DAY_MS = 24 * 3600 * 1000;

/** The last 7 Indian dates, oldest first. */
function lastSevenDays(now = Date.now()): string[] {
  return Array.from({ length: 7 }, (_, i) => istDate(new Date(now - (6 - i) * DAY_MS)));
}

const stampOf = (date: string, time: string) => `${date.replaceAll("-", "")}${time}`;

/** GET /families/{fid} — everything the family home screen needs in one call. */
export async function getDashboard(event: APIGatewayProxyEventV2) {
  const fid = pathParam(event, "fid");
  const principal = await principalFrom(event);
  const { entity, member } = await memberPrincipal(principal);
  await authorize({ principal: entity, action: "ViewFamily", resource: familyEntity(fid), entities: [] });

  const days = lastSevenDays();
  const [family, members, parents, open] = await Promise.all([
    get<FamilyItem>(keys.family(fid)),
    listMembers(fid),
    listParents(fid),
    listOpenDoses(fid),
  ]);
  const memberNames = new Map(members.map((m) => [m.mid, m.displayName]));
  const parentNames = new Map(parents.map((p) => [p.pid, p.displayName]));
  const today = days[days.length - 1]!;

  const parentViews = await Promise.all(
    parents.map(async (parent) => {
      const [doses, medicines, slots] = await Promise.all([
        listRealDoses(parent.pid, stampOf(days[0]!, "0000"), stampOf(today, "2359")),
        listMedicines(parent.pid),
        listSlots(parent.pid),
      ]);
      const istDateOf = (iso: string) => istDate(new Date(iso));
      return {
        pid: parent.pid,
        displayName: parent.displayName,
        lang: parent.lang,
        paused: parent.paused,
        slotTimes: parent.slotTimes,
        lastReceiptAt: parent.lastReceiptAt ?? null,
        ladder: parent.ladder.map((mid) => ({ mid, displayName: memberNames.get(mid) ?? "" })),
        myLadderPosition: ladderPosition(parent.ladder, member.mid),
        slots: slots
          .sort((a, b) => a.compactTime.localeCompare(b.compactTime))
          .map((s) => ({ slotName: s.slotName, compactTime: s.compactTime, critical: s.critical, medicineCount: s.medIds.length })),
        today: doses
          .filter((d) => istDateOf(d.scheduledAt) === today)
          .map((d) => ({
            doseId: d.doseId,
            slotName: d.slotName,
            scheduledAt: d.scheduledAt,
            status: d.status,
            missClass: d.missClass ?? null,
            critical: d.critical,
            claimedByName: d.claimedBy ? (memberNames.get(d.claimedBy) ?? null) : null,
          })),
        week: weekStrip(doses, days, istDateOf),
        refills: refillChips(medicines),
      };
    }),
  );

  return json(200, {
    family: { fid, name: family?.name ?? "" },
    me: { mid: member.mid, role: principal.kind === "member" ? principal.role : "member" },
    members: members.map((m) => ({ mid: m.mid, displayName: m.displayName, relation: m.relation ?? null, role: m.role, lang: m.lang })),
    parents: parentViews,
    openAlerts: openAlerts(open, member.mid, parentNames, memberNames),
  });
}
