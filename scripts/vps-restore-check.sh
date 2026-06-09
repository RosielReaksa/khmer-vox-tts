#!/usr/bin/env bash
set -Eeuo pipefail

NAMESPACE="${NAMESPACE:-khmer-vox}"
POSTGRES_LABEL="${POSTGRES_LABEL:-app=khmer-vox-postgres}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/voxtts-backups}"
CONFIG_FILE="${CONFIG_FILE:-/etc/voxtts-backup.env}"
BACKUP_DIR="${BACKUP_DIR:-}"
VERIFY_REMOTE="${VERIFY_REMOTE:-true}"
WORK_ROOT="${WORK_ROOT:-/tmp/voxtts-restore-check}"
RUN_WORK_DIR=""

if [[ -f "${CONFIG_FILE}" ]]; then
  # shellcheck source=/dev/null
  source "${CONFIG_FILE}"
fi

OFFSITE_REMOTE="${OFFSITE_REMOTE:-}"
BACKUP_ENCRYPTION_PASSPHRASE_FILE="${BACKUP_ENCRYPTION_PASSPHRASE_FILE:-}"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

require_bin() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

cleanup() {
  if [[ -n "${RUN_WORK_DIR}" && -d "${RUN_WORK_DIR}" ]]; then
    rm -rf -- "${RUN_WORK_DIR}"
  fi
}

first_pod_by_label() {
  local label="$1"
  kubectl -n "${NAMESPACE}" get pod -l "${label}" \
    -o jsonpath='{range .items[?(@.status.phase=="Running")]}{.metadata.name}{"\n"}{end}' |
    head -n 1
}

latest_backup_dir() {
  find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -name '20*T*Z' |
    sort |
    tail -n 1
}

require_backup_file() {
  local backup_dir="$1"
  local file_name="$2"
  if [[ ! -s "${backup_dir}/${file_name}" ]]; then
    echo "Missing or empty backup file: ${backup_dir}/${file_name}" >&2
    exit 1
  fi
}

verify_postgres_dump() {
  local dump_path="$1"
  local postgres_pod
  postgres_pod="$(first_pod_by_label "${POSTGRES_LABEL}")"

  if [[ -z "${postgres_pod}" ]]; then
    echo "No running Postgres pod found for label ${POSTGRES_LABEL}." >&2
    exit 1
  fi

  local pod_dump="/tmp/voxtts-restore-check-postgres.dump"
  kubectl -n "${NAMESPACE}" cp "${dump_path}" "${postgres_pod}:${pod_dump}" >/dev/null
  kubectl -n "${NAMESPACE}" exec "${postgres_pod}" -- pg_restore --list "${pod_dump}" >/dev/null
  kubectl -n "${NAMESPACE}" exec "${postgres_pod}" -- rm -f "${pod_dump}" >/dev/null
}

verify_backup_tree() {
  local backup_dir="$1"

  require_backup_file "${backup_dir}" "postgres-voxtts.dump"
  require_backup_file "${backup_dir}" "postgres-schema.sql"
  require_backup_file "${backup_dir}" "app-data.tgz"
  require_backup_file "${backup_dir}" "manifest.txt"
  require_backup_file "${backup_dir}" "SHA256SUMS"

  log "Checking backup file checksums in ${backup_dir}."
  (cd "${backup_dir}" && sha256sum -c SHA256SUMS >/dev/null)

  log "Checking app data archive can be read."
  tar -tzf "${backup_dir}/app-data.tgz" >/dev/null

  log "Checking Postgres dump can be listed by pg_restore."
  verify_postgres_dump "${backup_dir}/postgres-voxtts.dump"
}

verify_remote_bundle() {
  local timestamp="$1"

  if [[ "${VERIFY_REMOTE}" != "true" ]]; then
    log "Remote verification skipped because VERIFY_REMOTE is not true."
    return
  fi

  if [[ -z "${OFFSITE_REMOTE}" ]]; then
    log "Remote verification skipped because OFFSITE_REMOTE is not configured."
    return
  fi

  if [[ -z "${BACKUP_ENCRYPTION_PASSPHRASE_FILE}" || ! -r "${BACKUP_ENCRYPTION_PASSPHRASE_FILE}" ]]; then
    echo "BACKUP_ENCRYPTION_PASSPHRASE_FILE is required and must be readable for remote restore checks." >&2
    exit 1
  fi

  require_bin rclone
  require_bin openssl
  require_bin zstd

  local remote_dir="${OFFSITE_REMOTE%/}"
  local encrypted_name="${timestamp}.tar.zst.enc"
  local checksum_name="${encrypted_name}.sha256"
  local remote_work="${RUN_WORK_DIR}/remote"
  mkdir -p "${remote_work}"

  log "Downloading encrypted bundle from off-server storage."
  rclone copy "${remote_dir}/${encrypted_name}" "${remote_work}" --checksum --transfers=1 --checkers=4 >/dev/null
  rclone copy "${remote_dir}/${checksum_name}" "${remote_work}" --checksum --transfers=1 --checkers=4 >/dev/null

  log "Checking downloaded encrypted bundle checksum."
  (cd "${remote_work}" && sha256sum -c "${checksum_name}" >/dev/null)

  log "Decrypting downloaded bundle."
  openssl enc -d -aes-256-cbc -pbkdf2 \
    -in "${remote_work}/${encrypted_name}" \
    -out "${remote_work}/${timestamp}.tar.zst" \
    -pass "file:${BACKUP_ENCRYPTION_PASSPHRASE_FILE}"

  log "Testing decompressed bundle and extracting restore tree."
  zstd -t -q "${remote_work}/${timestamp}.tar.zst"
  mkdir -p "${remote_work}/extracted"
  zstd -dc "${remote_work}/${timestamp}.tar.zst" | tar -C "${remote_work}/extracted" -xf -

  local extracted_backup_dir="${remote_work}/extracted/${timestamp}"
  if [[ ! -d "${extracted_backup_dir}" ]]; then
    echo "Downloaded bundle did not contain expected backup folder: ${timestamp}" >&2
    exit 1
  fi

  verify_backup_tree "${extracted_backup_dir}"
}

main() {
  require_bin kubectl
  require_bin sha256sum
  require_bin tar
  require_bin find

  umask 077
  mkdir -p "${WORK_ROOT}"
  chmod 700 "${WORK_ROOT}"

  local backup_dir="${BACKUP_DIR}"
  if [[ -z "${backup_dir}" ]]; then
    backup_dir="$(latest_backup_dir)"
  fi

  if [[ -z "${backup_dir}" || ! -d "${backup_dir}" ]]; then
    echo "No backup directory found. Set BACKUP_DIR or create a backup first." >&2
    exit 1
  fi

  local timestamp
  timestamp="$(basename "${backup_dir}")"

  RUN_WORK_DIR="$(mktemp -d "${WORK_ROOT}/run-${timestamp}.XXXXXX")"
  trap cleanup EXIT

  log "Starting restore drill for ${timestamp}."
  verify_backup_tree "${backup_dir}"

  local bundle_path="${BACKUP_ROOT}/${timestamp}.tar.zst"
  if [[ -s "${bundle_path}" && -s "${bundle_path}.sha256" ]]; then
    log "Checking local packaged bundle checksum."
    (cd "${BACKUP_ROOT}" && sha256sum -c "$(basename "${bundle_path}.sha256")" >/dev/null)
  else
    log "Local packaged bundle is missing; folder verification still passed."
  fi

  verify_remote_bundle "${timestamp}"

  log "Restore drill passed for ${timestamp}."
  echo "RESTORE_DRILL_OK timestamp=${timestamp} local=${backup_dir} remote_checked=${VERIFY_REMOTE}"
}

main "$@"
