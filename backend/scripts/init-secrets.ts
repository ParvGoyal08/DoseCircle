/**
 * Creates the SSM parameters the backend reads. Run once per AWS account, after `aws configure sso`:
 *
 *   AWS_PROFILE=saathi pnpm secrets:init -- you@example.com
 *
 * Existing parameters are never overwritten: rotating VAPID keys would silently break every
 * push subscription already saved on family members' and parents' phones.
 */
import { randomBytes } from "node:crypto";
import { GetParameterCommand, ParameterType, PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import webpush from "web-push";

const REGION = "ap-south-1";
const PREFIX = process.env.SSM_PREFIX ?? "/saathi";
const subjectEmail = process.argv.slice(2).find((arg) => arg.includes("@"));

if (!subjectEmail) {
  console.error("Usage: pnpm secrets:init -- <contact email for the VAPID subject>");
  process.exit(1);
}

const ssm = new SSMClient({ region: REGION });

async function exists(name: string): Promise<boolean> {
  try {
    await ssm.send(new GetParameterCommand({ Name: `${PREFIX}/${name}` }));
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === "ParameterNotFound") return false;
    throw error;
  }
}

async function create(name: string, value: string, type: ParameterType): Promise<void> {
  if (await exists(name)) {
    console.log(`= ${PREFIX}/${name} already exists, left unchanged`);
    return;
  }
  await ssm.send(new PutParameterCommand({ Name: `${PREFIX}/${name}`, Value: value, Type: type, Tier: "Standard" }));
  console.log(`+ ${PREFIX}/${name} created (${type})`);
}

const vapid = webpush.generateVAPIDKeys();
// Apple rejects VAPID subjects such as mailto:someone@localhost, so a real address is required.
await create("vapid/subject", `mailto:${subjectEmail}`, ParameterType.STRING);
if (!(await exists("vapid/public")) && !(await exists("vapid/private"))) {
  await create("vapid/public", vapid.publicKey, ParameterType.STRING);
  await create("vapid/private", vapid.privateKey, ParameterType.SECURE_STRING);
} else {
  console.log("= VAPID key pair already exists, left unchanged");
}
await create("receipt-hmac", randomBytes(32).toString("base64url"), ParameterType.SECURE_STRING);
await create("demo-jwt-secret", randomBytes(32).toString("base64url"), ParameterType.SECURE_STRING);

const publicKey = await ssm.send(new GetParameterCommand({ Name: `${PREFIX}/vapid/public` }));
console.log(`\nSet this in the web app's environment:\nVITE_VAPID_PUBLIC_KEY=${publicKey.Parameter?.Value}`);
