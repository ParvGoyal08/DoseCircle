import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint, PushSubscriptionSchema } from "../src/lib/push-endpoints.js";
import { MedicineInputSchema } from "../src/lib/schemas.js";

describe("push endpoints", () => {
  it("accepts the real browser push services", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QGx")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isAllowedPushEndpoint("https://db5p.notify.windows.com/w/?token=x")).toBe(true);
  });

  it("refuses anything that would aim our requests elsewhere", () => {
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isAllowedPushEndpoint("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
    expect(PushSubscriptionSchema.safeParse({ endpoint: "https://evil.example/", keys: { p256dh: "a", auth: "b" } }).success).toBe(false);
  });
});

describe("medicine input", () => {
  it("applies defaults and keeps the printed name as typed", () => {
    const parsed = MedicineInputSchema.parse({ nameAsPrinted: "  Glycomet GP 1 ", slots: { morning: 1, night: 1 } });
    expect(parsed).toMatchObject({ nameAsPrinted: "Glycomet GP 1", critical: false, asNeeded: false, pillsLeft: null, refillThresholdDays: 5 });
  });

  it("requires a time of day unless the medicine is as needed", () => {
    expect(MedicineInputSchema.safeParse({ nameAsPrinted: "Telma 40" }).success).toBe(false);
    expect(MedicineInputSchema.safeParse({ nameAsPrinted: "Crocin", asNeeded: true }).success).toBe(true);
    expect(MedicineInputSchema.safeParse({ nameAsPrinted: "Half tab", slots: { night: 0.5 } }).success).toBe(true);
    expect(MedicineInputSchema.safeParse({ nameAsPrinted: "Zero", slots: { night: 0 } }).success).toBe(false);
  });
});
