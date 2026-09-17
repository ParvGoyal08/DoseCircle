import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { ZodType } from "zod";
import { logger } from "./aws.js";
import { ForbiddenError, type Principal } from "./principal.js";
import { membershipsForUser } from "./repository.js";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly body?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function json(statusCode: number, body?: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: body === undefined ? "" : JSON.stringify(body),
  };
}

export function parseBody<T>(event: APIGatewayProxyEventV2, schema: ZodType<T>): T {
  let raw: unknown;
  try {
    const text = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString("utf8") : (event.body ?? "");
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "Body must be valid JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new HttpError(400, "Invalid request", { issues: result.error.issues.map((i) => i.message) });
  return result.data;
}

export function pathParam(event: APIGatewayProxyEventV2, name: string): string {
  const value = event.pathParameters?.[name];
  if (!value) throw new HttpError(400, `Missing path parameter ${name}`);
  return value;
}

interface AuthorizerShape {
  jwt?: { claims?: Record<string, string> };
  lambda?: Record<string, string | number>;
}

/** Resolves the caller from the API Gateway authorizer result. */
export async function principalFrom(event: APIGatewayProxyEventV2): Promise<Principal> {
  const authorizer = (event.requestContext as unknown as { authorizer?: AuthorizerShape }).authorizer;
  const lambda = authorizer?.lambda;
  if (lambda?.kind === "device") {
    return { kind: "device", deviceId: String(lambda.deviceId), fid: String(lambda.fid), pid: String(lambda.pid) };
  }
  if (lambda?.kind === "demo") {
    return { kind: "demo", sid: String(lambda.sid), fid: String(lambda.fid), generation: Number(lambda.generation) };
  }
  const sub = authorizer?.jwt?.claims?.sub;
  if (sub) {
    const [membership] = await membershipsForUser(sub);
    if (!membership) throw new ForbiddenError("Not a member of any family");
    return { kind: "member", sub, mid: membership.mid, fid: membership.fid };
  }
  throw new HttpError(401, "Unauthorised");
}

export function withErrors(
  handler: (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>,
): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2> {
  return async (event) => {
    try {
      return await handler(event);
    } catch (error) {
      if (error instanceof HttpError) return json(error.statusCode, { message: error.message, ...error.body });
      if (error instanceof ForbiddenError) return json(403, { message: error.message });
      logger.error("Unhandled error", error as Error);
      return json(500, { message: "Something went wrong" });
    }
  };
}
