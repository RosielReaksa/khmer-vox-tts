#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-khmer-vox}"
DEPLOYMENT="${DEPLOYMENT:-khmer-vox-web}"
SECRET_NAME="${SECRET_NAME:-khmer-vox-smtp}"

command -v kubectl >/dev/null 2>&1 || {
  echo "kubectl is required." >&2
  exit 1
}

kubectl -n "$NAMESPACE" get deployment "$DEPLOYMENT" >/dev/null

read -r -p "Password reset public URL: " PUBLIC_URL
read -r -p "Gmail address used to send recovery email: " SMTP_EMAIL
read -r -s -p "Gmail App Password (not your normal password): " SMTP_PASSWORD
echo

PUBLIC_URL="${PUBLIC_URL%/}"
SMTP_PASSWORD="${SMTP_PASSWORD//[[:space:]]/}"

if [[ ! "$PUBLIC_URL" =~ ^https?:// ]]; then
  echo "The public URL must begin with http:// or https://." >&2
  exit 1
fi
if [[ ! "$SMTP_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
  echo "Enter a valid Gmail address." >&2
  exit 1
fi
if [[ -z "$SMTP_PASSWORD" ]]; then
  echo "The Gmail App Password cannot be empty." >&2
  exit 1
fi

encoded_password="$(printf '%s' "$SMTP_PASSWORD" | base64 -w 0)"
kubectl apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${SECRET_NAME}
  namespace: ${NAMESPACE}
type: Opaque
data:
  SMTP_PASSWORD: ${encoded_password}
EOF

unset SMTP_PASSWORD encoded_password

kubectl -n "$NAMESPACE" set env deployment/"$DEPLOYMENT" \
  PASSWORD_RESET_PUBLIC_URL="$PUBLIC_URL" \
  PASSWORD_RESET_TOKEN_TTL_MINUTES="60" \
  SMTP_HOST="smtp.gmail.com" \
  SMTP_PORT="587" \
  SMTP_SECURE="false" \
  SMTP_REQUIRE_TLS="true" \
  SMTP_USER="$SMTP_EMAIL" \
  SMTP_FROM_EMAIL="$SMTP_EMAIL" \
  SMTP_FROM_NAME="Khmer Vox TTS" \
  AUTH_PASSWORD_RESET_RATE_LIMIT="5" \
  AUTH_PASSWORD_RESET_CONCURRENT_LIMIT="2" >/dev/null

kubectl -n "$NAMESPACE" set env deployment/"$DEPLOYMENT" --from=secret/"$SECRET_NAME" >/dev/null

if [[ "$PUBLIC_URL" == http://* ]]; then
  kubectl -n "$NAMESPACE" set env deployment/"$DEPLOYMENT" \
    PASSWORD_RESET_ALLOW_INSECURE_HTTP="true" >/dev/null
else
  kubectl -n "$NAMESPACE" set env deployment/"$DEPLOYMENT" \
    PASSWORD_RESET_ALLOW_INSECURE_HTTP- >/dev/null
fi

kubectl -n "$NAMESPACE" rollout status deployment/"$DEPLOYMENT" --timeout=180s
echo "SMTP configuration applied. The App Password was not written to shell history."
