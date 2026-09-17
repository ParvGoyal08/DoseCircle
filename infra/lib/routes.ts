/**
 * HTTP API route keys served by each router Lambda. They must match the keys of FAMILY_ROUTES,
 * PARENT_ROUTES and DEMO_ROUTES in the backend (stack.test.ts fails if they drift apart).
 */
export const FAMILY_ROUTE_KEYS = [
  "GET /me",
  "PUT /me/lang",
  "POST /families",
  "POST /invites/accept",
  "GET /families/{fid}",
  "POST /families/{fid}/invites",
  "PUT /families/{fid}/parents/{pid}/ladder",
  "PATCH /families/{fid}/parents/{pid}",
  "POST /families/{fid}/parents/{pid}/test-dose",
  "GET /families/{fid}/parents/{pid}/devices",
  "DELETE /families/{fid}/parents/{pid}/devices/{deviceId}",
  "GET /families/{fid}/parents/{pid}/medicines",
  "POST /families/{fid}/parents/{pid}/medicines",
  "PATCH /families/{fid}/parents/{pid}/medicines/{medId}",
  "DELETE /families/{fid}/parents/{pid}/medicines/{medId}",
  "POST /families/{fid}/parents/{pid}/medicines/{medId}/refill",
  "GET /families/{fid}/parents/{pid}/report",
  "POST /families/{fid}/prescriptions",
  "GET /families/{fid}/prescriptions/{rxId}",
  "POST /families/{fid}/prescriptions/{rxId}/confirm",
  "GET /doses/{doseId}/timeline",
  "POST /push/subscriptions",
] as const;

export const PARENT_ROUTE_KEYS = [
  "POST /parent/pair",
  "GET /parent/today",
  "GET /parent/doses/{doseId}",
  "POST /parent/push/subscription",
  "PUT /parent/lang",
] as const;

export const DEMO_ROUTE_KEYS = [
  "POST /demo/sessions",
  "GET /demo/state",
  "POST /demo/doses",
  "POST /demo/reset",
  "GET /demo/doses/{doseId}/timeline",
  "GET /demo/families/{fid}/parents/{pid}/report",
] as const;
