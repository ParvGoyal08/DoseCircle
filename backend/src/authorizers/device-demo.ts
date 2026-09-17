import type { APIGatewayRequestAuthorizerEventV2, APIGatewaySimpleAuthorizerWithContextResult } from "aws-lambda";
import { secret } from "../lib/aws.js";
import { isDeviceTokenShape, sha256Hex } from "../lib/crypto.js";
import { verifyDemoToken } from "../lib/demo-jwt.js";
import { getDevice } from "../lib/repository.js";

type Context = Record<string, string | number>;

const deny: APIGatewaySimpleAuthorizerWithContextResult<Context> = { isAuthorized: false, context: {} };

/**
 * HTTP API Lambda authorizer (payload 2.0, simple responses) for parent devices and demo sessions.
 * Device tokens are looked up by hash, so a table leak never exposes a usable token.
 */
export async function handler(event: APIGatewayRequestAuthorizerEventV2): Promise<APIGatewaySimpleAuthorizerWithContextResult<Context>> {
  const header = event.headers?.authorization ?? event.headers?.Authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return deny;

  if (isDeviceTokenShape(token)) {
    const device = await getDevice(sha256Hex(token));
    if (!device || device.revoked) return deny;
    return { isAuthorized: true, context: { kind: "device", deviceId: device.deviceId, fid: device.fid, pid: device.pid } };
  }

  const claims = verifyDemoToken(await secret("demo-jwt-secret"), token);
  if (!claims) return deny;
  // Demo principals may only call /demo routes.
  if (!event.routeKey.includes(" /demo/")) return deny;
  return { isAuthorized: true, context: { kind: "demo", sid: claims.sid, fid: claims.fid, generation: claims.gen } };
}
