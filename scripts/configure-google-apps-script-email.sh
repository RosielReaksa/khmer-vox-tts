#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-khmer-vox}"
DEPLOYMENT="${DEPLOYMENT:-khmer-vox-web}"
SECRET_NAME="${SECRET_NAME:-khmer-vox-email-relay}"

command -v kubectl >/dev/null 2>&1 || {
  echo "kubectl is required." >&2
  exit 1
}

kubectl -n "$NAMESPACE" get deployment "$DEPLOYMENT" >/dev/null

read -r -p "Password reset public URL: " PUBLIC_URL
read -r -p "Google Apps Script web app URL: " RELAY_URL
read -r -s -p "Relay shared secret: " RELAY_SECRET
echo

PUBLIC_URL="${PUBLIC_URL%/}"
RELAY_SECRET="${RELAY_SECRET//[[:space:]]/}"

if [[ ! "$PUBLIC_URL" =~ ^https?:// ]]; then
  echo "The public URL must begin with http:// or https://." >&2
  exit 1
fi
if [[ ! "$RELAY_URL" =~ ^https://script\.google\.com/ ]]; then
  echo "The Apps Script URL should begin with https://script.google.com/." >&2
  exit 1
fi
if [[ -z "$RELAY_SECRET" ]]; then
  echo "The relay shared secret cannot be empty." >&2
  exit 1
fi

encoded_secret="$(printf '%s' "$RELAY_SECRET" | base64 -w 0)"
kubectl apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${SECRET_NAME}
  namespace: ${NAMESPACE}
type: Opaque
data:
  GOOGLE_APPS_SCRIPT_EMAIL_SECRET: ${encoded_secret}
EOF

unset RELAY_SECRET encoded_secret

kubectl -n "$NAMESPACE" set env deployment/"$DEPLOYMENT" \
  PASSWORD_RESET_EMAIL_PROVIDER="google_apps_script" \
  PASSWORD_RESET_PUBLIC_URL="$PUBLIC_URL" \
  PASSWORD_RESET_TOKEN_TTL_MINUTES="60" \
  PASSWORD_RESET_EMAIL_TIMEOUT_MS="15000" \
  GOOGLE_APPS_SCRIPT_EMAIL_URL="$RELAY_URL" \
  SMTP_FROM_NAME="Khmer Vox TTS" >/dev/null

kubectl -n "$NAMESPACE" set env deployment/"$DEPLOYMENT" --from=secret/"$SECRET_NAME" >/dev/null

if [[ "$PUBLIC_URL" == http://* ]]; then
  kubectl -n "$NAMESPACE" set env deployment/"$DEPLOYMENT" \
    PASSWORD_RESET_ALLOW_INSECURE_HTTP="true" >/dev/null
else
  kubectl -n "$NAMESPACE" set env deployment/"$DEPLOYMENT" \
    PASSWORD_RESET_ALLOW_INSECURE_HTTP- >/dev/null
fi

kubectl -n "$NAMESPACE" rollout status deployment/"$DEPLOYMENT" --timeout=180s
echo "Google Apps Script email relay configuration applied."
