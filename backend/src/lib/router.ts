import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { metrics } from "./aws.js";
import { json, withErrors } from "./http.js";

export type RouteHandler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>;

/**
 * One Lambda per API area, dispatching on API Gateway's route key (e.g. "GET /families/{fid}").
 * Keeps the stack small while each route stays a plain function.
 *
 * Metrics are flushed once per invocation here rather than in each handler. Every authorization
 * records one (`authz/avp.ts`), so a route that never flushed left them buffered for the life of
 * the warm container: the counts never reached the dashboard, and the buffer only ever grew.
 */
export function router(routes: Record<string, RouteHandler>) {
  return withErrors(async (event) => {
    const handler = routes[event.routeKey];
    try {
      if (!handler) return json(404, { message: `No route for ${event.routeKey}` });
      return await handler(event);
    } finally {
      metrics.publishStoredMetrics();
    }
  });
}

export function queryParam(event: APIGatewayProxyEventV2, name: string): string | undefined {
  return event.queryStringParameters?.[name] ?? undefined;
}
