# VPS Migration Runbook (K3s → new K3s, same domain voxtts.online)

Goal: move the whole site to a new VPS **without losing any users** and with
Google sign-in still working. Users live in PostgreSQL, not in the code, so the
database and secrets must travel with you.

This runbook assumes: new VPS also runs K3s, same namespace `khmer-vox`,
Postgres stays in-cluster, and you keep the domain `voxtts.online`.

---

## What must move (and why)

| Item | Source | If skipped |
|---|---|---|
| User accounts/data | PostgreSQL (`khmer-vox-postgres-pvc`) | All users lost |
| Secrets (DB password, **JWT/session secret**, Google OAuth id+secret, API keys, GHCR pull secret) | k8s secrets | Logins break; Google sign-in breaks |
| `/app/data` files (Modal pool = the 7 accounts, Google verify file) | `khmer-vox-data-pvc` | TTS engines/config lost |
| Code image | GHCR (already in cloud) | none — pulled anywhere |

> The normal `voxtts-backup` does **not** include secrets. The export script
> `scripts/vps-migrate-export.sh` captures secrets + manifests + a fresh backup.

---

## Phase 1 — Export from the OLD VPS (non-destructive)

```bash
# copy the export helper up, then run it
install -m 700 scripts/vps-migrate-export.sh /usr/local/sbin/voxtts-migrate-export
/usr/local/sbin/voxtts-migrate-export
# -> writes /root/voxtts-migration/<timestamp>/ with:
#    postgres dump (+ /app/data) OR a fresh voxtts-backup,
#    secrets/secrets.yaml (0600, plaintext),
#    manifests/*.yaml, MIGRATION-INFO.txt, SHA256SUMS
```

Download the whole folder to your PC over SFTP (keep it off shared storage):

```bash
# from your PC
scp -r root@OLD_VPS_IP:/root/voxtts-migration/<timestamp> ./voxtts-migration
```

**Do NOT delete anything on the old VPS yet.**

---

## Phase 2 — Prepare the NEW VPS

1. Install K3s:
   ```bash
   curl -sfL https://get.k3s.io | sh -
   export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
   kubectl create namespace khmer-vox
   ```
2. Add a swap file if the box is 2–4 GB RAM (matches current setup):
   ```bash
   fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   ```
3. Upload your migration folder to the new VPS:
   ```bash
   scp -r ./voxtts-migration root@NEW_VPS_IP:/root/voxtts-migration
   ```

---

## Phase 3 — Restore on the NEW VPS

> Verify integrity first: `cd <folder> && sha256sum -c SHA256SUMS`

1. **Secrets first** (so pods can start with correct config):
   ```bash
   kubectl -n khmer-vox apply -f /root/voxtts-migration/<ts>/secrets/secrets.yaml
   ```
   Critical: this carries the **same JWT/session secret**, so existing user
   sessions stay valid and Google OAuth keeps working.

2. **Manifests** (PVCs, deployments, services, ingress, configmaps):
   ```bash
   kubectl -n khmer-vox apply -f /root/voxtts-migration/<ts>/manifests/pvc.yaml
   kubectl -n khmer-vox apply -f /root/voxtts-migration/<ts>/manifests/configmap.yaml
   kubectl -n khmer-vox apply -f /root/voxtts-migration/<ts>/manifests/deploy.yaml
   kubectl -n khmer-vox apply -f /root/voxtts-migration/<ts>/manifests/svc.yaml
   kubectl -n khmer-vox apply -f /root/voxtts-migration/<ts>/manifests/ingress.yaml
   ```
   Wait for Postgres + web + worker pods to be Running:
   ```bash
   kubectl -n khmer-vox get pods -w
   ```

3. **Restore the database** into the new Postgres:
   ```bash
   PG=$(kubectl -n khmer-vox get pod -l app=khmer-vox-postgres -o jsonpath='{.items[0].metadata.name}')
   # if you used voxtts-backup, the dump is postgres-voxtts.dump
   kubectl -n khmer-vox cp /root/voxtts-migration/<ts>/postgres-voxtts.dump "$PG:/tmp/db.dump"
   kubectl -n khmer-vox exec "$PG" -- \
     pg_restore -U postgres -d voxtts --clean --if-exists --no-owner --no-privileges /tmp/db.dump
   ```

4. **Restore /app/data** into a web pod (shared PVC):
   ```bash
   WEB=$(kubectl -n khmer-vox get pod -l app=khmer-vox-web -o jsonpath='{.items[0].metadata.name}')
   kubectl -n khmer-vox exec "$WEB" -- sh -c 'mkdir -p /app/data'
   cat /root/voxtts-migration/<ts>/app-data.tgz | kubectl -n khmer-vox exec -i "$WEB" -- tar -C /app -xzf -
   # restart so pods pick up restored files
   kubectl -n khmer-vox rollout restart deploy/khmer-vox-web deploy/khmer-vox-worker
   ```

---

## Phase 4 — VERIFY before touching DNS

Test the new VPS directly by IP (or a temporary hosts entry mapping
voxtts.online → NEW_VPS_IP on your PC):

- [ ] `curl http://NEW_VPS_IP/api/health` (or NodePort) returns 200
- [ ] Existing user can **log in** (proves DB + JWT secret moved correctly)
- [ ] **Google sign-in** works (proves OAuth secrets moved)
- [ ] Admin → Modal pool shows **all 7 accounts**
- [ ] Generate a short audio clip end-to-end
- [ ] Row counts match old VPS:
      `kubectl exec $PG -- psql -U postgres -d voxtts -c "select count(*) from users;"`

Only proceed when every box passes.

---

## Phase 5 — Cut over DNS (last step)

1. In your DNS provider, point `voxtts.online` and `www.voxtts.online`
   A records to **NEW_VPS_IP**.
2. Let cert-manager issue TLS on the new box (same ingress hosts).
3. **Keep the OLD VPS running 24–48h** until DNS fully propagates so no user
   hits a dead server.

### Avoiding split-brain (important)
While both servers are live during propagation, a user could write to the old
DB. To avoid lost signups, either:
- Do the final `pg_dump` + restore in a short maintenance window right before
  the DNS switch (cleanest), **or**
- Put the old site read-only / show a brief maintenance page during cutover.

For low traffic this window is tiny, but know the tradeoff.

---

## Phase 6 — Decommission (only after success)

- [ ] New VPS verified and serving on HTTPS for 24–48h
- [ ] Final backup taken on the new VPS (`voxtts-backup`)
- [ ] **Securely delete** the migration folder (contains plaintext secrets):
      `shred -u /root/voxtts-migration/<ts>/secrets/secrets.yaml; rm -rf /root/voxtts-migration/<ts>` on both servers and your PC
- [ ] Only then shut down / destroy the old VPS

---

## Rollback

If anything fails verification, **do not switch DNS**. The old VPS is untouched
and still serving live traffic, so there is no user impact. Fix the new box and
re-verify, or abandon it — zero risk to production until Phase 5.
