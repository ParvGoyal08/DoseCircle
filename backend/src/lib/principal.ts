/**
 * Who is calling, resolved from the API Gateway authorizer. What they may do is decided by Cedar
 * policies in Amazon Verified Permissions (see src/authz).
 */
export type Principal =
  | { kind: "member"; sub: string; mid: string; fid: string; role: "owner" | "member" }
  | { kind: "device"; deviceId: string; fid: string; pid: string }
  | { kind: "demo"; sid: string; fid: string; generation: number };

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message = "Not allowed") {
    super(message);
  }
}
