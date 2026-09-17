import { config } from "./config";

export type AuthKind = "none" | "family" | "device" | "demo";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(typeof body.message === "string" ? body.message : `Request failed (${status})`);
  }
}

type TokenProvider = () => Promise<string | null>;
const tokenProviders: Partial<Record<AuthKind, TokenProvider>> = {};

export function setTokenProvider(kind: Exclude<AuthKind, "none">, provider: TokenProvider) {
  tokenProviders[kind] = provider;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth: AuthKind;
  query?: Record<string, string | undefined>;
  keepalive?: boolean;
  signal?: AbortSignal;
}

/** Development without an API: canned responses so screens can be built and checked. Never in production builds. */
export const mockApiEnabled = import.meta.env.DEV && !config.apiUrl;

export async function api<T>(path: string, options: RequestOptions): Promise<T> {
  if (mockApiEnabled) {
    const { mockApi } = await import("./mock-api");
    return (await mockApi(path, options.method ?? "GET")) as T;
  }
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.auth !== "none") {
    const token = await tokenProviders[options.auth]?.();
    if (!token) throw new ApiError(401, { message: "Not signed in" });
    headers.authorization = `Bearer ${token}`;
  }
  const query = Object.entries(options.query ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined);
  const url = `${config.apiUrl}${path}${query.length ? `?${new URLSearchParams(query)}` : ""}`;

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    keepalive: options.keepalive,
    signal: options.signal,
  });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}
