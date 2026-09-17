import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSimulatedDemoClient } from "../src/lib/demo-sim";

/** The simulation must follow the same escalation as the Step Functions workflow at 60× speed. */
describe("demo simulation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const settle = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
  };

  it("escalates a missed dose down the family order and stands others down on claim", async () => {
    const client = createSimulatedDemoClient();
    const start = client.start();
    await settle(200);
    const session = await start;
    const sent = client.sendDose({ critical: false });
    await settle(200);
    const { doseId } = await sent;

    // The parent's phone receives the reminder and sends a receipt, but nobody taps.
    let state = client.state();
    await settle(200);
    const parentInbox = (await state).inbox[`parent-${session.parent.pid}`]!;
    await client.receipt(parentInbox[0]!, `parent-${session.parent.pid}`);

    await settle(20_000 + 10_000 + 100); // reminder wait + nudge wait
    state = client.state();
    await settle(200);
    expect((await state).currentDose).toMatchObject({ status: "ESCALATING", missClass: "MISSED" });

    await settle(15_000); // first person's turn passes
    const second = session.members[1]!.mid;
    const claim = client.claim(doseId, second);
    await settle(200);
    expect(await claim).toBe("claimed");
    await settle(50);

    state = client.state();
    await settle(200);
    const final = await state;
    expect(final.currentDose).toMatchObject({ status: "CLAIMED", claimedByName: session.members[1]!.displayName });
    expect(final.inbox[session.members[0]!.mid]!.map((i) => i.step)).toContain("STAND_DOWN");
  });

  it("classifies a phone that never acknowledged the reminder as offline", async () => {
    const client = createSimulatedDemoClient();
    const start = client.start();
    await settle(200);
    await start;
    const sent = client.sendDose({ critical: true });
    await settle(200);
    await sent;
    await settle(10_000 + 100); // fast ladder: no nudge
    const state = client.state();
    await settle(200);
    expect((await state).currentDose).toMatchObject({ status: "ESCALATING", missClass: "OFFLINE", critical: true });
  });

  it("refuses a claim from someone who has not been alerted yet", async () => {
    const client = createSimulatedDemoClient();
    const start = client.start();
    await settle(200);
    const session = await start;
    const sent = client.sendDose({ critical: false });
    await settle(200);
    const { doseId } = await sent;
    await settle(30_100);
    const claim = client.claim(doseId, session.members[1]!.mid);
    await settle(200);
    expect(await claim).toBe("lost");
  });
});
