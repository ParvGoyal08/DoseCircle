import { App } from "aws-cdk-lib";
import { SaathiStack } from "../lib/saathi-stack.js";

const app = new App();
const context = (key: string, fallback: string): string => (app.node.tryGetContext(key) as string | undefined) || fallback;

new SaathiStack(app, "Saathi", {
  // Everything runs in Mumbai. The account comes from the CLI profile at deploy time.
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "ap-south-1" },
  appOrigin: context("appOrigin", "http://localhost:5173"),
  ssmPrefix: context("ssmPrefix", "/saathi"),
  sesFromEmail: context("sesFromEmail", "") || undefined,
  description: "Saathi: family medicine escalation (WeMakeDevs x AWS First Commit)",
});

app.synth();
