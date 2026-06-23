# Database Backup — Deployment & Operations Guide

## Quick Deploy

SSH into the VPS and run:

```bash
# 1. Create the backup PVC
kubectl -n khmer-vox apply -f /path/to/backup-pvc.yaml

# 2. Create the CronJob
kubectl -n khmer-vox apply -f /path/to/backup-cronjob.yaml

# 3. Verify it's created
kubectl -n khmer-vox get cronjob voxtts-db-backup
```

## What It Does

- **Schedule**: Runs daily at 03:00 UTC (10:00 AM Cambodia time)
- **What's backed up**:
  - Full PostgreSQL custom-format dump (`pg_dump --format=custom`)
  - Schema-only SQL snapshot
  - SHA256 checksums for integrity verification
- **Storage**: Dedicated 20Gi PVC (`voxtts-backup-pvc`)
- **Retention**: 14 days automatic cleanup
- **History**: Keeps last 3 successful and 5 failed job logs

## Manual Operations

### Trigger a backup now

```bash
kubectl -n khmer-vox create job --from=cronjob/voxtts-db-backup voxtts-db-backup-manual-$(date +%s)
```

### Watch a running backup

```bash
# Find the running pod
kubectl -n khmer-vox get pods -l app=voxtts-db-backup

# Stream logs
kubectl -n khmer-vox logs -l app=voxtts-db-backup -f --tail=50
```

### List available backups

```bash
# Find the backup pod that completed most recently
POD=$(kubectl -n khmer-vox get pod -l app=voxtts-db-backup --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1].metadata.name}')

# List backup directories
kubectl -n khmer-vox exec "$POD" -- ls -la /backups/ 2>/dev/null || \
  echo "No completed backup pod found. Check PVC directly."
```

### Restore from a backup

```bash
# 1. Identify the backup timestamp you want to restore
# 2. Get the postgres pod
PG=$(kubectl -n khmer-vox get pod -l app=khmer-vox-postgres -o jsonpath='{.items[0].metadata.name}')

# 3. Copy the dump into the postgres pod
#    (You need a running backup pod or mount the PVC to access files)
#    Option A: Spin up a temp pod with the backup PVC mounted
kubectl -n khmer-vox run backup-access --rm -it \
  --image=postgres:16-alpine \
  --overrides='{"spec":{"volumes":[{"name":"bv","persistentVolumeClaim":{"claimName":"voxtts-backup-pvc"}}],"containers":[{"name":"backup-access","image":"postgres:16-alpine","command":["sleep","3600"],"volumeMounts":[{"name":"bv","mountPath":"/backups"}]}]}}'

# 4. From inside the temp pod, copy the dump to postgres
#    (or use kubectl cp from the temp pod)
```

### Download a backup to your local machine

```bash
# Option 1: Port-forward and download
# Option 2: Use kubectl cp from a pod that has the PVC mounted
# Option 3: Use the existing vps-ssh.py script to run commands on the VPS
```

## Monitoring

### Check if backups are running on schedule

```bash
kubectl -n khmer-vox get cronjob voxtts-db-backup
kubectl -n khmer-vox get jobs -l app=voxtts-db-backup --sort-by=.metadata.creationTimestamp
```

### Check PVC usage

```bash
kubectl -n khmer-vox get pvc voxtts-backup-pvc
```

## Alerting (Optional)

To add Telegram alerts on backup failure, add this env to the CronJob container:

```yaml
env:
  - name: ALERT_TELEGRAM_BOT_TOKEN
    valueFrom:
      secretKeyRef:
        name: voxtts-secrets
        key: TELEGRAM_BOT_TOKEN
  - name: ALERT_TELEGRAM_CHAT_ID
    valueFrom:
      secretKeyRef:
        name: voxtts-secrets
        key: TELEGRAM_CHAT_ID
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| CronJob not creating pods | Check `kubectl -n khmer-vox describe cronjob voxtts-db-backup` |
| Pod fails with "connection refused" | Postgres pod may be down. Check `kubectl -n khmer-vox get pods` |
| Pod fails with "authentication failed" | Check the postgres secret has the correct password |
| PVC pending | No available PV. Check `kubectl get pv` and node disk space |
| Old backups not cleaned up | The cleanup runs inside the pod. If the pod crashes, cleanup is skipped. Run manually. |
