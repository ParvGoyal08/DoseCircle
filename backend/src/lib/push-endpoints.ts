import { z } from "zod";

/**
 * Browser push services we will send to. Our Lambda makes an HTTPS request to whatever endpoint a
 * subscription names, so arbitrary URLs are refused rather than letting callers aim our requests.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^web\.push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

export const PushSubscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint, "Unsupported push service"),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});
