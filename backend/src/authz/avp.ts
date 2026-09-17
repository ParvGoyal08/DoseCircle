import {
  IsAuthorizedCommand,
  VerifiedPermissionsClient,
  type AttributeValue,
  type EntityItem,
} from "@aws-sdk/client-verifiedpermissions";
import { logger, metrics } from "../lib/aws.js";
import { requireEnv } from "../lib/env.js";
import { ForbiddenError } from "../lib/principal.js";
import { actionUid, entityList, NAMESPACE, type AuthorizationRequest, type CedarValue } from "./entities.js";

const client = new VerifiedPermissionsClient({});

/** Converts a Cedar JSON value to the Verified Permissions attribute shape. */
export function toAttributeValue(value: CedarValue): AttributeValue {
  if (typeof value === "string") return { string: value };
  if (typeof value === "boolean") return { boolean: value };
  if (typeof value === "number") return { long: value };
  if (Array.isArray(value)) return { set: value.map(toAttributeValue) };
  if ("__entity" in value && typeof value.__entity === "object" && value.__entity !== null && !Array.isArray(value.__entity)) {
    const entity = value.__entity as { type: string; id: string };
    return { entityIdentifier: { entityType: entity.type, entityId: entity.id } };
  }
  const record: Record<string, AttributeValue> = {};
  for (const [key, inner] of Object.entries(value as Record<string, CedarValue>)) record[key] = toAttributeValue(inner);
  return { record };
}

export function toEntityItems(request: AuthorizationRequest): EntityItem[] {
  return entityList(request).map((entity) => ({
    identifier: { entityType: entity.uid.type, entityId: entity.uid.id },
    attributes: Object.fromEntries(Object.entries(entity.attrs).map(([key, value]) => [key, toAttributeValue(value)])),
    parents: entity.parents.map((p) => ({ entityType: p.type, entityId: p.id })),
  }));
}

/** Friendly policy names (file names) keyed by Verified Permissions policy id, injected by CDK. */
function policyNames(): Record<string, string> {
  try {
    return JSON.parse(process.env.POLICY_NAMES ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export interface Decision {
  allowed: boolean;
  /** Names of the Cedar policies that decided the outcome, e.g. "only-alerted-members-can-claim". */
  determiningPolicies: string[];
}

/** Asks Amazon Verified Permissions. Every API decision in DoseCircle goes through here. */
export async function isAuthorized(request: AuthorizationRequest): Promise<Decision> {
  const action = actionUid(request.action);
  const response = await client.send(
    new IsAuthorizedCommand({
      policyStoreId: requireEnv("POLICY_STORE_ID"),
      principal: { entityType: request.principal.uid.type, entityId: request.principal.uid.id },
      action: { actionType: action.type, actionId: action.id },
      resource: { entityType: request.resource.uid.type, entityId: request.resource.uid.id },
      entities: { entityList: toEntityItems(request) },
    }),
  );
  const names = policyNames();
  const determiningPolicies = (response.determiningPolicies ?? []).map((p) => names[p.policyId ?? ""] ?? p.policyId ?? "unknown");
  if (response.errors?.length) {
    logger.warn("Cedar evaluation errors", { errors: response.errors.map((e) => e.errorDescription) });
  }
  const allowed = response.decision === "ALLOW";
  metrics.addMetric(allowed ? "AuthzAllowed" : "AuthzDenied", "Count", 1);
  logger.info("Authorization decision", {
    action: request.action,
    principal: request.principal.uid,
    resource: request.resource.uid,
    allowed,
    determiningPolicies,
  });
  return { allowed, determiningPolicies };
}

/** Throws 403 unless Cedar allows the request. */
export async function authorize(request: AuthorizationRequest): Promise<Decision> {
  const decision = await isAuthorized(request);
  if (!decision.allowed) throw new ForbiddenError(`Not allowed to ${request.action}`);
  return decision;
}

export { NAMESPACE };
