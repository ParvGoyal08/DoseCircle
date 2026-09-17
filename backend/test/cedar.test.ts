import { isAuthorized, validate } from "@cedar-policy/cedar-wasm/nodejs";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toAttributeValue, toEntityItems } from "../src/authz/avp.js";
import {
  actionUid,
  deviceEntity,
  doseEntity,
  entityList,
  familyEntity,
  memberEntity,
  parentEntity,
  prescriptionEntity,
  type Action,
  type AuthorizationRequest,
  type CedarEntity,
} from "../src/authz/entities.js";

const cedarDir = new URL("../../cedar/", import.meta.url);
const schema = readFileSync(new URL("schema.json", cedarDir), "utf8");
const policyFiles = readdirSync(new URL("policies/", cedarDir)).filter((f) => f.endsWith(".cedar"));
/** Same policy ids the stack uses: the file name without extension. */
const staticPolicies = Object.fromEntries(
  policyFiles.map((file) => [file.replace(/\.cedar$/, ""), readFileSync(new URL(`policies/${file}`, cedarDir), "utf8")]),
);

function decide(request: AuthorizationRequest) {
  const answer = isAuthorized({
    principal: request.principal.uid,
    action: actionUid(request.action),
    resource: request.resource.uid,
    context: {},
    schema: JSON.parse(schema),
    validateRequest: true,
    policies: { staticPolicies },
    entities: entityList(request) as never,
  });
  if (answer.type === "failure") throw new Error(answer.errors.map((e) => e.message).join("; "));
  return { allowed: answer.response.decision === "allow", reasons: answer.response.diagnostics.reason, errors: answer.response.diagnostics.errors };
}

// A real family: Asha (owner) and Rohan (member) look after their mother; her phone is paired.
const family = familyEntity("fam-1");
const otherFamily = familyEntity("fam-2");
const demoFamily = familyEntity("demo-s1");
const asha = memberEntity({ mid: "m-asha", fid: "fam-1", role: "owner" });
const rohan = memberEntity({ mid: "m-rohan", fid: "fam-1", role: "member" });
const stranger = memberEntity({ mid: "m-x", fid: "fam-2", role: "owner" });
const demoMember = memberEntity({ mid: "m-demo", fid: "demo-s1", role: "owner" });
const mother = parentEntity({ pid: "p-amma", fid: "fam-1" });
const otherParent = parentEntity({ pid: "p-other", fid: "fam-1" });
const phone = deviceEntity({ deviceId: "d-1", fid: "fam-1", pid: "p-amma", revoked: false });
const revokedPhone = deviceEntity({ deviceId: "d-2", fid: "fam-1", pid: "p-amma", revoked: true });
const escalatingDose = doseEntity({ doseId: "p-amma_202609170800", fid: "fam-1", pid: "p-amma", status: "ESCALATING", alertedMemberIds: ["m-rohan"] });
const otherParentsDose = doseEntity({ doseId: "p-other_202609170800", fid: "fam-1", pid: "p-other", status: "PENDING" });
const rx = prescriptionEntity({ rxId: "rx-1", fid: "fam-1" });
const known: CedarEntity[] = [family, otherFamily, demoFamily, mother, otherParent];

const request = (principal: CedarEntity, action: Action, resource: CedarEntity): AuthorizationRequest => ({
  principal,
  action,
  resource,
  entities: known,
});

describe("Cedar schema and policies", () => {
  it("validate strictly against the schema", () => {
    const answer = validate({ schema: JSON.parse(schema), policies: { staticPolicies }, validationSettings: { mode: "strict" } });
    expect(answer.type).toBe("success");
    if (answer.type === "success") {
      expect(answer.validationErrors.map((e) => `${e.policyId}: ${e.error.message}`)).toEqual([]);
      expect(answer.validationWarnings).toEqual([]);
    }
  });

  it("keep one statement per file (Verified Permissions stores one policy per static policy)", () => {
    for (const [id, text] of Object.entries(staticPolicies)) {
      const statements = text.replace(/\/\/.*$/gm, "").match(/\b(permit|forbid)\s*\(/g) ?? [];
      expect(statements, id).toHaveLength(1);
    }
  });
});

describe("who can do what", () => {
  it("lets members see their own family and nobody else's", () => {
    expect(decide(request(rohan, "ViewFamily", family)).allowed).toBe(true);
    expect(decide(request(stranger, "ViewFamily", family)).allowed).toBe(false);
  });

  it("lets only the owner manage the family and paired phones", () => {
    expect(decide(request(asha, "ManageFamily", family)).allowed).toBe(true);
    expect(decide(request(rohan, "ManageFamily", family)).allowed).toBe(false);
    expect(decide(request(asha, "ManageDevices", mother)).allowed).toBe(true);
    expect(decide(request(rohan, "ManageDevices", mother)).allowed).toBe(false);
  });

  it("lets any member care for the family's parents", () => {
    for (const action of ["ViewParent", "ManageMedicines", "PauseReminders", "SendTestReminder", "ViewReport"] as const) {
      expect(decide(request(rohan, action, mother)).allowed, action).toBe(true);
      expect(decide(request(stranger, action, mother)).allowed, action).toBe(false);
    }
  });

  it("limits a parent's phone to that parent", () => {
    expect(decide(request(phone, "ViewParent", mother)).allowed).toBe(true);
    expect(decide(request(phone, "ViewParent", otherParent)).allowed).toBe(false);
    expect(decide(request(phone, "MarkTaken", escalatingDose)).allowed).toBe(true);
    expect(decide(request(phone, "MarkTaken", otherParentsDose)).allowed).toBe(false);
    // The schema rejects a phone even asking to claim, before any policy runs.
    expect(() => decide(request(phone, "ClaimDose", escalatingDose))).toThrow(/not valid for/);
  });

  it("refuses a revoked phone everything, even its own parent's doses", () => {
    const decision = decide(request(revokedPhone, "MarkTaken", escalatingDose));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toEqual(["revoked-phones-can-do-nothing"]);
  });

  it("lets only an alerted member claim an escalating dose", () => {
    const allowed = decide(request(rohan, "ClaimDose", escalatingDose));
    expect(allowed).toMatchObject({ allowed: true, reasons: ["only-alerted-members-can-claim"] });
    expect(decide(request(asha, "ClaimDose", escalatingDose)).allowed).toBe(false); // not alerted yet
    const pending = doseEntity({ doseId: "p-amma_202609170800", fid: "fam-1", pid: "p-amma", status: "PENDING", alertedMemberIds: ["m-rohan"] });
    expect(decide(request(rohan, "ClaimDose", pending)).allowed).toBe(false);
  });

  it("lets members view doses and timelines, and review prescriptions, in their family only", () => {
    expect(decide(request(asha, "ViewTimeline", escalatingDose)).allowed).toBe(true);
    expect(decide(request(stranger, "ViewDose", escalatingDose)).allowed).toBe(false);
    expect(decide(request(rohan, "UploadPrescription", family)).allowed).toBe(true);
    expect(decide(request(rohan, "ReviewPrescription", rx)).allowed).toBe(true);
    expect(decide(request(stranger, "ReviewPrescription", rx)).allowed).toBe(false);
  });

  it("never lets a demo session touch a real family", () => {
    const decision = decide(request(demoMember, "ViewFamily", family));
    expect(decision.allowed).toBe(false);
    const dose = decide(request(demoMember, "ViewTimeline", escalatingDose));
    expect(dose.allowed).toBe(false);
    expect(dose.reasons).toContain("demo-never-touches-real-families");
  });

  it("keeps the demo guardrail working even when the caller passes no extra entities", () => {
    const decision = decide({ principal: demoMember, action: "ViewTimeline", resource: escalatingDose, entities: [] });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("demo-never-touches-real-families");
    expect(decision.errors).toEqual([]);
  });

  it("produces no evaluation errors for any request", () => {
    expect(decide(request(stranger, "ClaimDose", escalatingDose)).errors).toEqual([]);
  });
});

describe("Verified Permissions request shape", () => {
  it("converts Cedar values to attribute values", () => {
    expect(toAttributeValue("ESCALATING")).toEqual({ string: "ESCALATING" });
    expect(toAttributeValue(true)).toEqual({ boolean: true });
    expect(toAttributeValue(3)).toEqual({ long: 3 });
    expect(toAttributeValue([{ __entity: { type: "DoseCircle::Member", id: "m1" } }])).toEqual({
      set: [{ entityIdentifier: { entityType: "DoseCircle::Member", entityId: "m1" } }],
    });
  });

  it("sends each entity once with typed attributes", () => {
    const items = toEntityItems({ principal: rohan, action: "ClaimDose", resource: escalatingDose, entities: [family, family] });
    expect(items.filter((i) => i.identifier?.entityType === "DoseCircle::Family")).toHaveLength(1);
    expect(items.find((i) => i.identifier?.entityId === "m-rohan")?.attributes).toEqual({
      family: { entityIdentifier: { entityType: "DoseCircle::Family", entityId: "fam-1" } },
      role: { string: "member" },
    });
  });
});
