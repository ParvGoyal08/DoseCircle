import { isDemoFamily } from "@dosecircle/shared";

/**
 * Cedar entities in Cedar's JSON format. The same builders feed Amazon Verified Permissions at
 * runtime and the offline Cedar engine in tests, so the tests exercise exactly what production sends.
 */

export const NAMESPACE = "DoseCircle";

export type CedarValue = string | number | boolean | { __entity: EntityUid } | CedarValue[] | { [key: string]: CedarValue };

export interface EntityUid {
  type: string;
  id: string;
}

export interface CedarEntity {
  uid: EntityUid;
  attrs: Record<string, CedarValue>;
  parents: EntityUid[];
}

export type Action =
  | "ViewFamily"
  | "ManageFamily"
  | "UploadPrescription"
  | "ReviewPrescription"
  | "ViewParent"
  | "ManageMedicines"
  | "ManageChecks"
  | "RecordReading"
  | "ViewReadings"
  | "PauseReminders"
  | "SendTestReminder"
  | "ViewReport"
  | "ManageDevices"
  | "ManageMembers"
  | "LeaveFamily"
  | "DeleteFamily"
  | "ViewDose"
  | "ViewTimeline"
  | "MarkTaken"
  | "ClaimDose";

const uid = (type: string, id: string): EntityUid => ({ type: `${NAMESPACE}::${type}`, id });
const ref = (type: string, id: string) => ({ __entity: uid(type, id) });

export const actionUid = (action: Action): EntityUid => ({ type: `${NAMESPACE}::Action`, id: action });

export function familyEntity(fid: string): CedarEntity {
  return { uid: uid("Family", fid), attrs: { demo: isDemoFamily(fid) }, parents: [] };
}

export function memberEntity(member: { mid: string; fid: string; role: "owner" | "member" }): CedarEntity {
  return { uid: uid("Member", member.mid), attrs: { family: ref("Family", member.fid), role: member.role }, parents: [] };
}

export function parentEntity(parent: { pid: string; fid: string }): CedarEntity {
  return { uid: uid("Parent", parent.pid), attrs: { family: ref("Family", parent.fid) }, parents: [] };
}

export function deviceEntity(device: { deviceId: string; fid: string; pid: string; revoked: boolean }): CedarEntity {
  return {
    uid: uid("ParentDevice", device.deviceId),
    attrs: { family: ref("Family", device.fid), parent: ref("Parent", device.pid), revoked: device.revoked },
    parents: [],
  };
}

export function doseEntity(dose: {
  doseId: string;
  fid: string;
  pid: string;
  status: string;
  alertedMemberIds?: Iterable<string>;
}): CedarEntity {
  return {
    uid: uid("Dose", dose.doseId),
    attrs: {
      family: ref("Family", dose.fid),
      parent: ref("Parent", dose.pid),
      status: dose.status,
      alertedMembers: [...(dose.alertedMemberIds ?? [])].map((mid) => ref("Member", mid)),
    },
    parents: [],
  };
}

export function prescriptionEntity(rx: { rxId: string; fid: string }): CedarEntity {
  return { uid: uid("Prescription", rx.rxId), attrs: { family: ref("Family", rx.fid) }, parents: [] };
}

export interface AuthorizationRequest {
  principal: CedarEntity;
  action: Action;
  resource: CedarEntity;
  /** Every entity whose attributes a policy may read (principal and resource are added automatically). */
  entities: CedarEntity[];
}

/**
 * De-duplicates entities by uid, and adds every Family that any entity references. Guardrail
 * policies read `principal.family.demo`; Cedar skips a policy that errors on a missing entity, so a
 * forgotten family would silently disable the guardrail. Adding them here makes that impossible.
 */
export function entityList(request: AuthorizationRequest): CedarEntity[] {
  const byKey = new Map<string, CedarEntity>();
  const add = (entity: CedarEntity) => byKey.set(`${entity.uid.type}::${entity.uid.id}`, entity);
  for (const entity of [request.principal, request.resource, ...request.entities]) add(entity);
  const familyType = `${NAMESPACE}::Family`;
  for (const entity of [...byKey.values()]) {
    for (const value of Object.values(entity.attrs)) {
      const target = typeof value === "object" && value !== null && !Array.isArray(value) && "__entity" in value ? (value.__entity as EntityUid) : undefined;
      if (target?.type === familyType && !byKey.has(`${familyType}::${target.id}`)) add(familyEntity(target.id));
    }
  }
  return [...byKey.values()];
}
