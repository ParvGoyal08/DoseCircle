import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { ddb, metrics } from "../../lib/aws.js";
import { env } from "../../lib/env.js";
import { recordDoseEvent } from "../../lib/events.js";
import { HttpError, json, pathParam, principalFrom, withErrors } from "../../lib/http.js";
import type { DoseItem } from "../../lib/model.js";
import { assertFamilyAccess } from "../../lib/principal.js";
import { doseKey, getDose, listMembers } from "../../lib/repository.js";
import { completeTask } from "../../lib/task-token.js";
import { notifyResolution } from "../../workflow/notify-resolution.js";

/** "I'll handle it". Exactly one alerted family member can win; everyone else is told who did. */
export const handler = withErrors(async (event) => {
  const principal = await principalFrom(event);
  if (principal.kind !== "member" && principal.kind !== "demo") throw new HttpError(403, "Only family members can claim");
  const doseId = pathParam(event, "doseId");
  const dose = await getDose(doseId);
  if (!dose) throw new HttpError(404, "Dose not found");
  assertFamilyAccess(principal, dose.fid);

  const mid = principal.kind === "member" ? principal.mid : demoActor(event);
  const now = new Date().toISOString();

  let claimed: DoseItem;
  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: env.tableName,
        Key: doseKey(doseId),
        UpdateExpression: "SET #status = :claimed, claimedBy = :mid, claimedAt = :now",
        ConditionExpression: "#status = :escalating AND attribute_not_exists(claimedBy) AND contains(alertedMemberIds, :mid)",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":claimed": "CLAIMED", ":escalating": "ESCALATING", ":mid": mid, ":now": now },
        ReturnValues: "ALL_NEW",
      }),
    );
    claimed = result.Attributes as DoseItem;
  } catch (error) {
    if ((error as { name?: string }).name !== "ConditionalCheckFailedException") throw error;
    const current = await getDose(doseId);
    if (current?.claimedBy) {
      const members = await listMembers(dose.fid);
      const name = members.find((m) => m.mid === current.claimedBy)?.displayName;
      return json(409, { message: "Already being handled", claimedBy: current.claimedBy, claimedByName: name, claimedAt: current.claimedAt });
    }
    return json(409, { message: "This dose is not waiting for anyone", status: current?.status });
  }

  await recordDoseEvent({ doseId, type: "CLAIMED", at: now, detail: { memberId: mid }, ttl: dose.ttl });
  metrics.addMetric("Claims", "Count", 1);

  const completed = await completeTask(claimed.currentToken, { outcome: "CLAIMED", by: mid });
  if (!completed) {
    // The waiting step had just timed out; make sure the rest of the family still hears.
    await notifyResolution({ doseId, outcome: "CLAIMED" });
  }
  metrics.publishStoredMetrics();
  return json(200, { status: "CLAIMED", claimedBy: mid, claimedAt: now });
});

/** In demo mode one browser plays every sibling; the pane says which one is acting. */
function demoActor(event: APIGatewayProxyEventV2): string {
  const actor = event.queryStringParameters?.asMemberId;
  if (!actor) throw new HttpError(400, "asMemberId is required in demo mode");
  return actor;
}
