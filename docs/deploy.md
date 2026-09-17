# Deploying

One command does everything, and it is safe to re-run:

```bash
AWS_PROFILE=<profile> ALARM_EMAIL=you@example.com scripts/deploy.sh
```

## What you need first

1. **An AWS account with admin rights** for the identity you deploy with: CDK creates IAM roles and
   CloudFormation stacks. A Bedrock-only or read-only user cannot deploy.
   ```bash
   aws configure --profile dosecircle      # region ap-south-1, output json
   aws sts get-caller-identity --profile dosecircle
   ```
2. **Claude on Bedrock:** submit Anthropic's first-time-use form in the Bedrock console (ap-south-1). Without
   it, everything deploys and works except reading a real prescription photo.
3. Nothing else. No Docker (Lambdas bundle locally), no domain, and no GitHub token, because the site is
   uploaded from your machine.

## What the script does

1. Prints the AWS account and asks you to confirm.
2. Creates (or updates) the **Amplify Hosting** app first, with the single-page routing rule and the security
   headers from `web/customHttp.yml`. Its address, `https://main.<app-id>.amplifyapp.com`, is the origin the
   API will allow, so it has to exist before the backend deploys.
3. `cdk bootstrap` for ap-south-1.
4. Creates the secrets in SSM: VAPID push keys, the receipt HMAC and the demo token secret. **Existing
   parameters are never overwritten**, because new push keys would silently break every phone already
   subscribed.
5. `cdk deploy DoseCircle` with the site origin and your alarm email, writing the stack outputs to
   `.deploy/outputs.json`.
6. Builds the web app with those outputs and uploads it to Amplify, then waits for the deployment to finish.

Roughly 10–15 minutes the first time, a few minutes after that.

## After the first deploy

- **Confirm the SNS subscription email** sent to your alarm address, or alarm emails will not arrive.
- **Voice clips** (optional): `AWS_PROFILE=… pnpm --filter @dosecircle/backend exec tsx scripts/gen-polly-phrases.ts`
  generates the Hindi and Indian English phrases from reviewed strings only.
- **Check it works:** open the site, then `/demo`, start a demo and send a dose. In the AWS console the
  Step Functions execution should appear, and the CloudWatch dashboard `DoseCircle-operations` should start
  filling in.

## Useful checks

```bash
cd infra && pnpm exec cdk diff --profile dosecircle --context appOrigin=<site>   # what a redeploy would change
aws stepfunctions list-executions --state-machine-arn <arn> --max-results 5      # recent doses
aws logs tail /aws/lambda/DoseCircle-FamilyApi... --follow                       # an API function's logs
aws scheduler list-schedules --group-name dosecircle-doses                       # one schedule per parent slot
```

## Turning it off

```bash
cd infra && pnpm exec cdk destroy DoseCircle --profile dosecircle
```

The DynamoDB table, the prescriptions bucket, the Cognito user pool and the Verified Permissions policy store
are set to **retain**, so family data survives a stack delete and must be removed deliberately. Amplify apps
are deleted separately (`aws amplify delete-app --app-id <id>`).

## Regions, and the one exception

Everything is in **ap-south-1 (Mumbai)**: data, workflows, Textract, the guardrail. The exception is Claude
itself, which from Mumbai is only reachable through the **global cross-Region inference profile**, so a
prescription photo may be processed outside India. The app says so before the upload, and the IAM policy for
it is the three-statement form that profile requires. CloudTrail records which Region served each call.
