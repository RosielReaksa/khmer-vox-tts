#!/usr/bin/env bash
# VPS migration EXPORT helper (run on the OLD/source VPS).
#
# Captures everything needed to recreate the site on a new K3s VPS:
#   1) A fresh full data backup (Postgres dump + /app/data) via voxtts-backup
#      if available; otherwise it dumps Postgres + /app/data directly.
#   2) Kubernetes SECRETS (DB password, JWT/session secret, Google OAuth,
#      API keys, GHCR pull secret) -- the one thing the normal backup omits.
#   3) Live Kubernetes objects (deployments, services, ingress, PVCs,
#      configmaps) cleaned of cluster-managed runtime fields.
#
# SECURITY: the secrets file contains plaintext credentials. It is written
# 0600, kept only under the migration dir, and must be transferred over a
# secure channel (scp/sftp) and deleted after the new VPS is verified.
# This script never prints secret VALUES to stdout.
set -Eeuo pipefail

NAMESPACE="${NAMESPACE:-khmer-vox}"
export KUBECONFIG="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${OUT:-/root/voxtts-migration/${TS}}"
SECRETS_DIR="${OUT}/secrets"
MANIFESTS_DIR="${OUT}/manifests"

log() { printf '[migrate-export] %s\n' "$*" >&2; }
require() { command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }; }

require kubectl
umask 077
mkdir -p "${SECRETS_DIR}" "${MANIFESTS_DIR}"
chmod 700 "${OUT}" "${SECRETS_DIR}" "${MANIFESTS_DIR}"

# 1) Fresh data backup -------------------------------------------------------
if command -v voxtts-backup >/dev/null 2>&1; then
  log "Running existing voxtts-backup for a fresh DB + /app/data snapshot."
  voxtts-backup || { echo "voxtts-backup failed; aborting export." >&2; exit 1; }
  log "Latest backups live under /root/voxtts-backups (copy the newest folder)."
else
  log "voxtts-backup not found; dumping Postgres + /app/data directly."
  PG_POD="$(kubectl -n "${NAMESPACE}" get pod -l app=khmer-vox-postgres -o jsonpath='{.items[0].metadata.name}')"
  WEB_POD="$(kubectl -n "${NAMESPACE}" get pod -l app=khmer-vox-web -o jsonpath='{.items[0].metadata.name}')"
  kubectl -n "${NAMESPACE}" exec "${PG_POD}" -- \
    pg_dump -U postgres -d voxtts --format=custom --no-owner --no-privileges \
    > "${OUT}/postgres-voxtts.dump"
  kubectl -n "${NAMESPACE}" exec "${WEB_POD}" -- tar -C /app -czf - data \
    > "${OUT}/app-data.tgz"
fi

# 2) Secrets (the critical gap in the normal backup) ------------------------
log "Exporting Kubernetes secrets (plaintext -> ${SECRETS_DIR}/secrets.yaml, 0600)."
kubectl -n "${NAMESPACE}" get secret -o yaml > "${SECRETS_DIR}/secrets.yaml"
chmod 600 "${SECRETS_DIR}/secrets.yaml"
# A non-secret inventory so you can eyeball what exists without revealing values.
kubectl -n "${NAMESPACE}" get secret \
  -o custom-columns=NAME:.metadata.name,TYPE:.type,KEYS:.data \
  --no-headers 2>/dev/null | sed 's/map\[\(.*\)\]/\1/' > "${SECRETS_DIR}/secrets-inventory.txt" || true
chmod 600 "${SECRETS_DIR}/secrets-inventory.txt"

# 3) Live manifests (cleaned of runtime-only fields) ------------------------
clean_yaml() {
  # Drop fields the new cluster must NOT receive (uid, resourceVersion, status,
  # cluster IPs, etc.) so `kubectl apply` works cleanly on the new VPS.
  kubectl -n "${NAMESPACE}" get "$1" -o yaml 2>/dev/null | \
    grep -vE '^\s+(uid|resourceVersion|creationTimestamp|generation|selfLink):' || true
}
for kind in deploy svc ingress pvc configmap statefulset serviceaccount; do
  log "Exporting ${kind}."
  clean_yaml "${kind}" > "${MANIFESTS_DIR}/${kind}.yaml"
done
# Also grab the server-side template if it exists (partial, placeholder secrets).
if [[ -f /root/voxtts-populated.yaml ]]; then
  cp /root/voxtts-populated.yaml "${MANIFESTS_DIR}/voxtts-populated.yaml"
fi

# Inventory + checksums ------------------------------------------------------
{
  echo "migration_export_utc=${TS}"
  echo "namespace=${NAMESPACE}"
  echo "node_ip=$(hostname -I | awk '{print $1}')"
  echo
  echo "deployments:"; kubectl -n "${NAMESPACE}" get deploy -o wide --no-headers
  echo; echo "pvcs:"; kubectl -n "${NAMESPACE}" get pvc --no-headers
  echo; echo "ingress hosts:"; kubectl -n "${NAMESPACE}" get ingress -o jsonpath='{range .items[*]}{.spec.rules[*].host}{"\n"}{end}'
} > "${OUT}/MIGRATION-INFO.txt"

( cd "${OUT}" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS )

log "DONE. Export written to: ${OUT}"
log "Transfer this whole folder securely to your PC, then to the new VPS."
log "REMINDER: ${SECRETS_DIR}/secrets.yaml holds plaintext credentials -- handle carefully and delete after cutover."
