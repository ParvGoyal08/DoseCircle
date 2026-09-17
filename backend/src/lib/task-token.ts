import { SendTaskSuccessCommand } from "@aws-sdk/client-sfn";
import { logger, sfn } from "./aws.js";

export type Resolution = { outcome: "TAKEN" } | { outcome: "CLAIMED"; by: string };

/**
 * Completes a waiting Step Functions task. Returns false when the token is no longer valid
 * (the step already timed out or the execution ended) — callers handle that case themselves.
 */
export async function completeTask(token: string | undefined, resolution: Resolution): Promise<boolean> {
  if (!token) return false;
  try {
    await sfn.send(new SendTaskSuccessCommand({ taskToken: token, output: JSON.stringify(resolution) }));
    return true;
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "TaskTimedOut" || name === "InvalidToken" || name === "TaskDoesNotExist") {
      logger.info("Task token no longer valid", { name });
      return false;
    }
    throw error;
  }
}
