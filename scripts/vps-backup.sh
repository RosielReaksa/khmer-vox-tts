#!/usr/bin/env bash
set -Eeuo pipefail

NAMESPACE="${NAMESPACE:-khmer-vox}"
POSTGRES_LABEL="${POSTGRES_LABEL:-app=khmer-vox-postgres}"
WEB_LABEL="${WEB_LABEL:-app=khmer-vox-web}"
POSTGRES_DB="${POSTGRES_DB:-voxtts}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/voxtts-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
KEEP_COUNT="${KEEP_COUNT:-30}"
CONFIG_FILE="${CONFIG_FILE:-/etc/voxtts-backup.env}"

if [[ -f "${CONFIG_FILE}" ]]; then
  # shellcheck source=/dev/null
  source "${CONFIG_FILE}"
fi

OFFSITE_REMOTE="${OFFSITE_REMOTE:-}"
OFFSITE_KEEP_DAYS="${OFFSITE_KEEP_DAYS:-30}"
OFFSITE_RETENTION_DELETE="${OFFSITE_RETENTION_DELETE:-false}"
BACKUP_ENCRYPTION_PASSPHRASE_FILE="${BACKUP_ENCRYPTION_PASSPHRASE_FILE:-}"
ALERT_TELEGRAM_BOT_TOKEN="${ALERT_TELEGRAM_BOT_TOKEN:-}"
ALERT_TELEGRAM_CHAT_ID="${ALERT_TELEGRAM_CHAT_ID:-}"
ALERT_TELEGRAM_NOTIFY_SUCCESS="${ALERT_TELEGRAM_NOTIFY_SUCCESS:-false}"
ALERT_TELEGRAM_SERVICE_NAME="${ALERT_TELEGRAM_SERVICE_NAME:-Khmer Vox TTS VPS}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${BACKUP_ROOT}/${timestamp}"
manifest="${backup_dir}/manifest.txt"
bundle_path="${BACKUP_ROOT}/${timestamp}.tar.zst"
offsite_status="${backup_dir}/offsite-status.txt"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

html_escape() {
  printf '%s' "$1" | sed \
    -e 's/&/\&amp;/g' \
    -e 's/</\&lt;/g' \
    -e 's/>/\&gt;/g'
}

send_telegram_alert() {
  local severity="$1"
  local title="$2"
  local detail="$3"

  if [[ -z "${ALERT_TELEGRAM_BOT_TOKEN}" || -z "${ALERT_TELEGRAM_CHAT_ID}" ]]; then
    return
  fi
  if ! command -v curl >/dev/null 2>&1; then
    log "Telegram alert is configured but curl is missing."
    return
  fi

  local text
  text="<b>$(html_escape "${title}")</b>
Service: <code>$(html_escape "${ALERT_TELEGRAM_SERVICE_NAME}")</code>
Severity: <code>$(html_escape "${severity}")</code>
Time: <code>$(date -u +%Y-%m-%dT%H:%M:%SZ)</code>
Details: $(html_escape "${detail}")"

  curl -fsS --max-time 12 \
    -X POST "https://api.telegram.org/bot${ALERT_TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${ALERT_TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${text}" \
    --data-urlencode "parse_mode=HTML" \
    --data-urlencode "disable_web_page_preview=true" >/dev/null || {
      log "Telegram alert send failed."
    }
}

on_backup_error() {
  local line="${1:-unknown}"
  send_telegram_alert \
    "critical" \
    "Khmer Vox TTS backup failed" \
    "Backup failed at line ${line}. Check /var/log/voxtts-backup.log on the VPS. Backup root: ${BACKUP_ROOT}."
}

trap 'on_backup_error "$LINENO"' ERR

require_bin() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

first_pod_by_label() {
  local label="$1"
  kubectl -n "${NAMESPACE}" get pod -l "${label}" \
    -o jsonpath='{range .items[?(@.status.phase=="Running")]}{.metadata.name}{"\n"}{end}' |
    head -n 1
}

write_restore_note() {
  local note_path="${BACKUP_ROOT}/README-restore.txt"
  if [[ -f "${note_path}" ]]; then
    return
  fi

  cat > "${note_path}" <<'EOF'
Khmer Vox TTS VPS Backup Restore Notes

Backups are stored in timestamped folders. Each folder should contain:
- postgres-voxtts.dump: PostgreSQL custom-format pg_dump.
- postgres-schema.sql: schema-only SQL snapshot.
- app-data.tgz: archive of /app/data from a web pod.
- SHA256SUMS: checksums for backup files.
- manifest.txt: non-secret Kubernetes metadata.

Restore is destructive. Do not run restore commands on production without a fresh manual backup.

Non-destructive restore drill:
  BACKUP_DIR=/root/voxtts-backups/YYYYMMDDTHHMMSSZ /usr/local/sbin/voxtts-restore-check

Example database restore:
  BACKUP_DIR=/root/voxtts-backups/YYYYMMDDTHHMMSSZ
  POD=$(kubectl -n khmer-vox get pod -l app=khmer-vox-postgres -o jsonpath='{.items[0].metadata.name}')
  kubectl -n khmer-vox cp "$BACKUP_DIR/postgres-voxtts.dump" "$POD:/tmp/postgres-voxtts.dump"
  kubectl -n khmer-vox exec "$POD" -- pg_restore -U postgres -d voxtts --clean --if-exists --no-owner --no-privileges /tmp/postgres-voxtts.dump

Example app data restore:
  BACKUP_DIR=/root/voxtts-backups/YYYYMMDDTHHMMSSZ
  POD=$(kubectl -n khmer-vox get pod -l app=khmer-vox-web -o jsonpath='{.items[0].metadata.name}')
  kubectl -n khmer-vox exec "$POD" -- sh -c 'mkdir -p /app/data'
  cat "$BACKUP_DIR/app-data.tgz" | kubectl -n khmer-vox exec -i "$POD" -- tar -C /app -xzf -
EOF
  chmod 600 "${note_path}"
}

cleanup_retention() {
  log "Applying retention: keep ${KEEP_DAYS} days and latest ${KEEP_COUNT} backups."
  find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -name '20*T*Z' -mtime +"${KEEP_DAYS}" -print0 |
    xargs -0r rm -rf
  find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type f -name '20*T*Z.tar.zst*' -mtime +"${KEEP_DAYS}" -print0 |
    xargs -0r rm -f

  mapfile -t backups < <(find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -name '20*T*Z' | sort -r)
  if (( ${#backups[@]} > KEEP_COUNT )); then
    printf '%s\0' "${backups[@]:KEEP_COUNT}" | xargs -0r rm -rf
  fi

  mapfile -t bundles < <(find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type f -name '20*T*Z.tar.zst*' | sort -r)
  if (( ${#bundles[@]} > KEEP_COUNT )); then
    printf '%s\0' "${bundles[@]:KEEP_COUNT}" | xargs -0r rm -f
  fi
}

package_backup() {
  require_bin tar
  require_bin zstd

  log "Packaging backup bundle."
  tar -C "${BACKUP_ROOT}" -cf - "${timestamp}" | zstd -T0 -19 -q -o "${bundle_path}"

  if [[ ! -s "${bundle_path}" ]]; then
    echo "Backup bundle is empty." >&2
    exit 1
  fi

  sha256sum "${bundle_path}" > "${bundle_path}.sha256"
  log "Backup bundle created: ${bundle_path}"
}

encrypted_upload_file() {
  local encrypted_path="${bundle_path}.enc"
  if [[ -z "${BACKUP_ENCRYPTION_PASSPHRASE_FILE}" ]]; then
    printf '%s\n' "${bundle_path}"
    return
  fi

  if [[ ! -r "${BACKUP_ENCRYPTION_PASSPHRASE_FILE}" ]]; then
    echo "BACKUP_ENCRYPTION_PASSPHRASE_FILE is set but not readable." >&2
    exit 1
  fi

  require_bin openssl
  log "Encrypting backup bundle for off-server upload."
  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -in "${bundle_path}" \
    -out "${encrypted_path}" \
    -pass "file:${BACKUP_ENCRYPTION_PASSPHRASE_FILE}"
  sha256sum "${encrypted_path}" > "${encrypted_path}.sha256"
  printf '%s\n' "${encrypted_path}"
}

upload_offsite() {
  {
    echo "timestamp_utc=${timestamp}"
    echo "remote_configured=$([[ -n "${OFFSITE_REMOTE}" ]] && echo true || echo false)"
    echo "encryption_configured=$([[ -n "${BACKUP_ENCRYPTION_PASSPHRASE_FILE}" ]] && echo true || echo false)"
  } > "${offsite_status}"

  if [[ -z "${OFFSITE_REMOTE}" ]]; then
    log "Off-server upload is not configured. Set OFFSITE_REMOTE in ${CONFIG_FILE}."
    echo "status=skipped" >> "${offsite_status}"
    echo "reason=OFFSITE_REMOTE is not configured" >> "${offsite_status}"
    return
  fi

  require_bin rclone

  local upload_file
  upload_file="$(encrypted_upload_file)"
  local checksum_file="${upload_file}.sha256"

  log "Uploading backup bundle to configured off-server remote."
  rclone copy "${upload_file}" "${OFFSITE_REMOTE}" --checksum --transfers=1 --checkers=4
  rclone copy "${checksum_file}" "${OFFSITE_REMOTE}" --checksum --transfers=1 --checkers=4

  {
    echo "status=uploaded"
    echo "uploaded_file=$(basename "${upload_file}")"
    echo "uploaded_checksum=$(basename "${checksum_file}")"
  } >> "${offsite_status}"

  if [[ "${OFFSITE_RETENTION_DELETE}" == "true" ]]; then
    log "Applying off-server retention: delete backup bundles older than ${OFFSITE_KEEP_DAYS} days."
    rclone delete "${OFFSITE_REMOTE}" --min-age "${OFFSITE_KEEP_DAYS}d" --include "*.tar.zst" --include "*.tar.zst.sha256" --include "*.tar.zst.enc" --include "*.tar.zst.enc.sha256"
    rclone rmdirs "${OFFSITE_REMOTE}" --leave-root
  else
    log "Off-server retention delete is disabled. Set OFFSITE_RETENTION_DELETE=true after verifying remote path."
  fi
}

main() {
  require_bin kubectl
  require_bin sha256sum
  require_bin find

  umask 077
  mkdir -p "${backup_dir}"
  chmod 700 "${BACKUP_ROOT}" "${backup_dir}"
  write_restore_note

  local postgres_pod
  local web_pod
  postgres_pod="$(first_pod_by_label "${POSTGRES_LABEL}")"
  web_pod="$(first_pod_by_label "${WEB_LABEL}")"

  if [[ -z "${postgres_pod}" ]]; then
    echo "No running Postgres pod found for label ${POSTGRES_LABEL}." >&2
    exit 1
  fi
  if [[ -z "${web_pod}" ]]; then
    echo "No running web pod found for label ${WEB_LABEL}." >&2
    exit 1
  fi

  {
    echo "timestamp_utc=${timestamp}"
    echo "namespace=${NAMESPACE}"
    echo "postgres_pod=${postgres_pod}"
    echo "web_pod=${web_pod}"
    echo
    echo "pods:"
    kubectl -n "${NAMESPACE}" get pods -o wide
    echo
    echo "pvcs:"
    kubectl -n "${NAMESPACE}" get pvc -o wide
    echo
    echo "deployments:"
    kubectl -n "${NAMESPACE}" get deploy \
      -o custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,DESIRED:.spec.replicas,IMAGE:.spec.template.spec.containers[0].image \
      --no-headers
  } > "${manifest}"

  log "Checking Postgres readiness."
  kubectl -n "${NAMESPACE}" exec "${postgres_pod}" -- pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null

  log "Dumping Postgres database ${POSTGRES_DB}."
  kubectl -n "${NAMESPACE}" exec "${postgres_pod}" -- \
    pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --format=custom --no-owner --no-privileges \
    > "${backup_dir}/postgres-voxtts.dump"

  log "Dumping Postgres schema snapshot."
  kubectl -n "${NAMESPACE}" exec "${postgres_pod}" -- \
    pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --schema-only --no-owner --no-privileges \
    > "${backup_dir}/postgres-schema.sql"

  log "Archiving /app/data from ${web_pod}."
  kubectl -n "${NAMESPACE}" exec "${web_pod}" -- tar -C /app -czf - data \
    > "${backup_dir}/app-data.tgz"

  if [[ ! -s "${backup_dir}/postgres-voxtts.dump" ]]; then
    echo "Postgres dump is empty." >&2
    exit 1
  fi
  if [[ ! -s "${backup_dir}/app-data.tgz" ]]; then
    echo "App data archive is empty." >&2
    exit 1
  fi

  (
    cd "${backup_dir}"
    sha256sum postgres-voxtts.dump postgres-schema.sql app-data.tgz manifest.txt > SHA256SUMS
  )

  package_backup
  upload_offsite

  cleanup_retention

  log "Backup completed: ${backup_dir}"
  du -sh "${backup_dir}"
  du -sh "${bundle_path}" 2>/dev/null || true

  if [[ "${ALERT_TELEGRAM_NOTIFY_SUCCESS}" == "true" ]]; then
    local offsite_state="unknown"
    if [[ -f "${offsite_status}" ]]; then
      offsite_state="$(grep -E '^status=' "${offsite_status}" | tail -n 1 | cut -d= -f2- || true)"
    fi
    send_telegram_alert \
      "ok" \
      "Khmer Vox TTS backup completed" \
      "Backup ${timestamp} completed. Offsite status: ${offsite_state}. Backup root: ${BACKUP_ROOT}."
  fi
}

main "$@"
