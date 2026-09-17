import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { json, withErrors } from "./http.js";

export type RouteHandler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>;

/**
 * One Lambda per API area, dispatching on API Gateway's route key (e.g. "GET /families/{fid}").
 * Keeps the stack small while each route stays a plain function.
 */
export function router(routes: Record<string, RouteHandler>) {
  return withErrors(async (event) => {
    const handler = routes[event.routeKey];
    if (!handler) return json(404, { message: `No route for ${event.routeKey}` });
    return handler(event);
  });
}

export function queryParam(event: APIGatewayProxyEventV2, name: string): string | undefined {
  return event.queryStringParameters?.[name] ?? undefined;
}
