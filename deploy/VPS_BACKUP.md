# VPS backup runbook

The production VPS runs K3s in namespace `khmer-vox`.

The backup system stores local backups under:

```bash
/root/voxtts-backups
```

Each backup contains:

- `postgres-voxtts.dump`: PostgreSQL custom-format dump.
- `postgres-schema.sql`: schema-only SQL snapshot.
- `app-data.tgz`: `/app/data` archive from a web pod.
- `manifest.txt`: non-secret pod, PVC, and image metadata.
- `SHA256SUMS`: checksums.
- `offsite-status.txt`: upload status for remote backup.

The script also creates a packaged bundle beside the folder:

```bash
/root/voxtts-backups/YYYYMMDDTHHMMSSZ.tar.zst
```

If encryption is configured, off-server upload uses:

```bash
/root/voxtts-backups/YYYYMMDDTHHMMSSZ.tar.zst.enc
```

Manual backup:

```bash
/usr/local/sbin/voxtts-backup
```

Check schedule:

```bash
cat /etc/cron.d/voxtts-backup
tail -n 100 /var/log/voxtts-backup.log
```

Telegram alert setup is optional and uses `/etc/voxtts-backup.env`. See `deploy/VPS_ALERTS.md`.

List backups:

```bash
ls -lah /root/voxtts-backups
```

Non-destructive restore drill:

```bash
/usr/local/sbin/voxtts-restore-check
```

See `deploy/VPS_RESTORE_DRILL.md` for the full restore verification flow.

Off-server backup setup:

1. Install and configure `rclone` on the VPS for your storage provider.
2. Create `/etc/voxtts-backup.env` with root-only permissions.
3. Set `OFFSITE_REMOTE` to the rclone destination, for example:

```bash
OFFSITE_REMOTE="remote-name:voxtts-backups/voxtts.online"
BACKUP_ENCRYPTION_PASSPHRASE_FILE="/root/.config/voxtts-backup/offsite-passphrase"
OFFSITE_RETENTION_DELETE="false"
OFFSITE_KEEP_DAYS="30"
```

The passphrase file must be root-only:

```bash
chmod 600 /root/.config/voxtts-backup/offsite-passphrase
chmod 600 /etc/voxtts-backup.env
```

Keep `OFFSITE_RETENTION_DELETE=false` until one upload is verified in the remote storage dashboard.

Restore notes are written on the VPS at:

```bash
/root/voxtts-backups/README-restore.txt
```

Do not restore onto production without taking a fresh manual backup first.

Telegram alerts are intentionally separate from this backup script. Use a separate alert bot for backup failures, Modal issues, queue issues, and system health alerts.
