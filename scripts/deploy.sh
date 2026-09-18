#!/usr/bin/env bash
# Deploys DoseCircle to AWS Mumbai (ap-south-1): backend with CDK, web app on Amplify Hosting.
# Safe to re-run: every step reuses what already exists.
#
#   AWS_PROFILE=dosecircle ALARM_EMAIL=you@example.com scripts/deploy.sh
#
# Steps
#   1. Show the AWS account (so you know where this is going).
#   2. Create the Amplify app first, because its URL is the origin the API allows (CORS).
#   3. Bootstrap CDK, create secrets in SSM, deploy the backend stack.
#   4. Build the web app with the stack outputs and upload it to Amplify.
set -euo pipefail

export AWS_REGION=ap-south-1
export AWS_DEFAULT_REGION=ap-south-1
: "${AWS_PROFILE:?Set AWS_PROFILE to the profile to deploy with}"
: "${ALARM_EMAIL:?Set ALARM_EMAIL for alarms, the budget and the push contact}"
APP_NAME="${APP_NAME:-DoseCircle}"
BRANCH="main"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$ROOT/.deploy"
mkdir -p "$STATE"

step() { printf "\n\033[1m== %s\033[0m\n" "$*"; }

step "1. AWS account"
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output table
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
if [[ "${CONFIRM:-}" != "yes" ]]; then
  read -r -p "Deploy DoseCircle to account $ACCOUNT in ap-south-1? [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "Stopped."; exit 1; }
fi

step "2. Amplify app"
APP_ID=$(aws amplify list-apps --query "apps[?name=='$APP_NAME'].appId | [0]" --output text)
if [[ "$APP_ID" == "None" || -z "$APP_ID" ]]; then
  RULES=$(jq -c . "$ROOT/web/amplify-rewrites.json")
  APP_ID=$(aws amplify create-app --name "$APP_NAME" --platform WEB \
    --custom-rules "$RULES" \
    --custom-headers "$(cat "$ROOT/web/customHttp.yml")" \
    --query app.appId --output text)
  echo "Created Amplify app $APP_ID"
else
  aws amplify update-app --app-id "$APP_ID" --custom-rules "$(jq -c . "$ROOT/web/amplify-rewrites.json")" --custom-headers "$(cat "$ROOT/web/customHttp.yml")" >/dev/null
  echo "Using Amplify app $APP_ID"
fi
if ! aws amplify get-branch --app-id "$APP_ID" --branch-name "$BRANCH" >/dev/null 2>&1; then
  aws amplify create-branch --app-id "$APP_ID" --branch-name "$BRANCH" --stage PRODUCTION >/dev/null
fi
APP_ORIGIN="https://$BRANCH.$APP_ID.amplifyapp.com"
echo "Web app will be at $APP_ORIGIN"

step "3a. CDK bootstrap"
cd "$ROOT/infra"
pnpm exec cdk bootstrap "aws://$ACCOUNT/ap-south-1" --profile "$AWS_PROFILE"

step "3b. Secrets in SSM (never overwritten)"
cd "$ROOT"
pnpm --filter @dosecircle/backend secrets:init -- "$ALARM_EMAIL" | tee "$STATE/secrets.log"
VAPID_PUBLIC_KEY=$(aws ssm get-parameter --name /dosecircle/vapid/public --query Parameter.Value --output text)

step "3c. Backend stack"
cd "$ROOT/infra"
pnpm exec cdk deploy DoseCircle --profile "$AWS_PROFILE" --require-approval never \
  --context appOrigin="$APP_ORIGIN" --context alarmEmail="$ALARM_EMAIL" \
  --outputs-file "$STATE/outputs.json"
OUT() { jq -r ".DoseCircle.$1" "$STATE/outputs.json"; }

step "4a. Build the web app"
cd "$ROOT/web"
# SHOW_DRAFT_LANGUAGES offers Kannada and Hindi before a native speaker has signed off every string.
# They are labelled "draft translation" in the picker. Set it to false to hold them back until the
# review is done; the code path is the same either way.
cat > .env.production.local <<EOF
VITE_API_URL=$(OUT ApiUrl)
VITE_USER_POOL_ID=$(OUT UserPoolId)
VITE_USER_POOL_CLIENT_ID=$(OUT UserPoolClientId)
VITE_VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY
VITE_SHOW_DRAFT_LANGUAGES=${SHOW_DRAFT_LANGUAGES:-true}
EOF
rm -rf dist
pnpm build
(cd dist && rm -f "$STATE/web.zip" && zip -qr "$STATE/web.zip" .)

step "4b. Upload to Amplify"
DEPLOYMENT=$(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --output json)
JOB_ID=$(echo "$DEPLOYMENT" | jq -r .jobId)
UPLOAD_URL=$(echo "$DEPLOYMENT" | jq -r .zipUploadUrl)
curl -sS --fail -X PUT -H "Content-Type: application/zip" --data-binary "@$STATE/web.zip" "$UPLOAD_URL"
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" >/dev/null
for _ in $(seq 1 60); do
  STATUS=$(aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" --query job.summary.status --output text)
  [[ "$STATUS" == "SUCCEED" || "$STATUS" == "FAILED" || "$STATUS" == "CANCELLED" ]] && break
  sleep 5
done
echo "Amplify deployment: $STATUS"

step "Done"
echo "Web app:  $APP_ORIGIN"
echo "Demo:     $APP_ORIGIN/demo"
echo "API:      $(OUT ApiUrl)"
echo "Confirm the SNS subscription email sent to $ALARM_EMAIL to receive alarms."
