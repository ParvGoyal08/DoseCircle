import { isSimulated } from "./config";
import { createAwsDemoClient, type DemoClient } from "./demo-client";
import { createSimulatedDemoClient } from "./demo-sim";

let client: DemoClient | null = null;

export function demoClient(): DemoClient {
  client ??= isSimulated ? createSimulatedDemoClient() : createAwsDemoClient();
  return client;
}
