import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { authorize } from "../../authz/avp.js";
import { doseEntity, familyEntity } from "../../authz/entities.js";
import { memberPrincipal } from "../../authz/principal-entity.js";
import { ddb, metrics } from "../../lib/aws.js";
import { env } from "../../lib/env.js";
import { recordDoseEvent } from "../../lib/events.js";
import { HttpError, json, pathParam, principalFrom, withErrors } from "../../lib/http.js";
import type { DoseItem } from "../../lib/model.js";
import { doseKey, getDose, listMembers } from "../../lib/repository.js";
import { completeTask } from "../../lib/task-token.js";
import { notifyResolution } from "../../workflow/notify-resolution.js";

/** "I'll handle it". Exactly one alerted family member can win; everyone else is told who did. */
export const handler = withErrors(async (event) => {
  const principal = await principalFrom(event);
  const doseId = pathParam(event, "doseId");
  const dose = await getDose(doseId);
  if (!dose) throw new HttpError(404, "Dose not found");

  const { entity, member } = await memberPrincipal(principal, event.queryStringParameters?.asMemberId);
  const resource = doseEntity(dose);
  const entities = [familyEntity(dose.fid)];

  // Anyone in the family may learn who is already handling it, even if they can no longer claim.
  await authorize({ principal: entity, action: "ViewDose", resource, entities });
  if (dose.claimedBy) return alreadyClaimed(dose);

  // Cedar: only a member who was actually alerted, while the dose is escalating.
  const decision = await authorize({ principal: entity, action: "ClaimDose", resource, entities });

  const now = new Date().toISOString();
  let claimed: DoseItem;
  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: env.tableName,
        Key: doseKey(doseId),
        UpdateExpression: "SET #status = :claimed, claimedBy = :mid, claimedAt = :now",
        // The same rule again, atomically: Cedar decided on a read, this closes the race between two claimers.
        ConditionExpression: "#status = :escalating AND attribute_not_exists(claimedBy) AND contains(alertedMemberIds, :mid)",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":claimed": "CLAIMED", ":escalating": "ESCALATING", ":mid": member.mid, ":now": now },
        ReturnValues: "ALL_NEW",
      }),
    );
    claimed = result.Attributes as DoseItem;
  } catch (error) {
    if ((error as { name?: string }).name !== "ConditionalCheckFailedException") throw error;
    const current = await getDose(doseId);
    if (current?.claimedBy) return alreadyClaimed(current);
    return json(409, { message: "This dose is not waiting for anyone", status: current?.status });
  }

  await recordDoseEvent({ doseId, type: "CLAIMED", at: now, detail: { memberId: member.mid, authorizedBy: decision.determiningPolicies }, ttl: dose.ttl });
  metrics.addMetric("Claims", "Count", 1);

  const completed = await completeTask(claimed.currentToken, { outcome: "CLAIMED", by: member.mid });
  if (!completed) {
    // The waiting step had just timed out; make sure the rest of the family still hears.
    await notifyResolution({ doseId, outcome: "CLAIMED" });
  }
  metrics.publishStoredMetrics();
  return json(200, { status: "CLAIMED", claimedBy: member.mid, claimedAt: now });
});

async function alreadyClaimed(dose: DoseItem) {
  const members = await listMembers(dose.fid);
  const name = members.find((m) => m.mid === dose.claimedBy)?.displayName;
  return json(409, { message: "Already being handled", claimedBy: dose.claimedBy, claimedByName: name, claimedAt: dose.claimedAt });
}
