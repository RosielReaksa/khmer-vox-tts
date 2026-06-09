# VPS restore drill

Run this before trusting backups in production. It is non-destructive: it does not write into the live database and does not restore `/app/data`.

What the drill checks:

- Local backup folder exists and has the expected files.
- `SHA256SUMS` passes.
- `app-data.tgz` can be read.
- `postgres-voxtts.dump` can be listed by `pg_restore` inside the Postgres pod.
- If off-server backup is configured, the encrypted remote bundle downloads, verifies, decrypts, extracts, and passes the same checks.

Install/update the restore checker on the VPS:

```bash
install -m 700 scripts/vps-restore-check.sh /usr/local/sbin/voxtts-restore-check
```

Run against the newest local backup:

```bash
/usr/local/sbin/voxtts-restore-check
```

Run against a specific backup:

```bash
BACKUP_DIR=/root/voxtts-backups/YYYYMMDDTHHMMSSZ /usr/local/sbin/voxtts-restore-check
```

Skip off-server download/decrypt if the remote storage is under maintenance:

```bash
VERIFY_REMOTE=false /usr/local/sbin/voxtts-restore-check
```

Success output ends with:

```bash
RESTORE_DRILL_OK timestamp=YYYYMMDDTHHMMSSZ
```

Do not run destructive restore commands on production unless:

- you made a fresh manual backup first,
- you know which timestamp you are restoring,
- you accept that the live database or `/app/data` will be replaced.
