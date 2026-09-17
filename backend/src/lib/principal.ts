import { isDemoFamily } from "@dosecircle/shared";

/** Who is calling, resolved by an authorizer. Every data access checks it against the item. */
export type Principal =
  | { kind: "member"; sub: string; mid: string; fid: string }
  | { kind: "device"; deviceId: string; fid: string; pid: string }
  | { kind: "demo"; sid: string; fid: string; generation: number };

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message = "Not allowed") {
    super(message);
  }
}

/** Demo sessions can only touch demo families; real callers can never touch demo families. */
export function assertFamilyAccess(principal: Principal, fid: string): void {
  if (principal.fid !== fid) throw new ForbiddenError();
  if (principal.kind === "demo" && !isDemoFamily(fid)) throw new ForbiddenError();
  if (principal.kind !== "demo" && isDemoFamily(fid)) throw new ForbiddenError();
}

export function assertParentAccess(principal: Principal, fid: string, pid: string): void {
  assertFamilyAccess(principal, fid);
  if (principal.kind === "device" && principal.pid !== pid) throw new ForbiddenError();
}
