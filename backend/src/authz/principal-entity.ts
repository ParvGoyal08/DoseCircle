import { HttpError } from "../lib/http.js";
import type { MemberItem } from "../lib/model.js";
import type { Principal } from "../lib/principal.js";
import { listMembers } from "../lib/repository.js";
import { deviceEntity, memberEntity, type CedarEntity } from "./entities.js";

/**
 * The Cedar principal for a caller. A demo session plays the fictional family's people, so it
 * acts as one of that family's members or as its simulated parent phone — never as itself.
 */
export async function memberPrincipal(principal: Principal, demoMemberId?: string): Promise<{ entity: CedarEntity; member: Pick<MemberItem, "mid" | "fid"> }> {
  if (principal.kind === "member") {
    return { entity: memberEntity(principal), member: { mid: principal.mid, fid: principal.fid } };
  }
  if (principal.kind === "demo") {
    if (!demoMemberId) throw new HttpError(400, "asMemberId is required in demo mode");
    const member = (await listMembers(principal.fid)).find((m) => m.mid === demoMemberId);
    if (!member) throw new HttpError(404, "Demo member not found");
    return { entity: memberEntity({ mid: member.mid, fid: member.fid, role: member.role }), member };
  }
  throw new HttpError(403, "Only family members can do this");
}

export function devicePrincipal(principal: Principal, pid: string): CedarEntity {
  if (principal.kind === "device") {
    // The authorizer already rejected revoked devices; its cache can keep a revoked token valid for up to 5 minutes.
    return deviceEntity({ deviceId: principal.deviceId, fid: principal.fid, pid: principal.pid, revoked: false });
  }
  if (principal.kind === "demo") {
    return deviceEntity({ deviceId: `parent-${pid}`, fid: principal.fid, pid, revoked: false });
  }
  throw new HttpError(403, "Only the parent's phone can do this");
}
