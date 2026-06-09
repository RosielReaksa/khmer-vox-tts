# Khmer Vox TTS Deployment

This app needs two production processes:

- `web`: the Next.js app and API.
- `worker`: the background job processor for queued TTS jobs.

Do not deploy it as web-only unless queued generation is disabled. The cheapest stable setup is Docker Compose on a VPS or a container host that supports a long-running worker.

## 1. Create Production Env

Copy the template and fill real values:

```powershell
Copy-Item deploy\production.env.example deploy\production.env
```

Never commit `deploy/production.env`.

Generate strong secrets:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Set these required values:

- `SESSION_SECRET`: random secret.
- `ADMIN_EMAILS`: your owner/admin email.
- `DATABASE_URL`: Supabase/Postgres pooler connection string.
- `DATABASE_SSL=true`: required for Supabase.
- `APP_PUBLIC_URL`: real HTTPS domain, for example `https://voxtts.online`.
- `JOB_WORKER_SECRET`: random secret shared by web and worker.
- `JOB_WORKER_BASE_URL=http://web:3000`: Docker worker internal URL.
- `KHQR_*`: your KHQR business/account settings.
- `PAYWAY_WEBHOOK_SECRET`: random secret used by PayWay webhook verification.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_PAYMENT_BOT_CHAT_ID`: payment/admin notifications. If the dedicated private chat ID is not set, send `/start` to the bot from the `TELEGRAM_ADMIN_HANDLE` account so the webhook can save that non-secret chat ID.
- `TTS_UPSTREAM_URL`, `TTS_UPSTREAM_TOKEN`, `TTS_UPSTREAM_MODEL`: Modal VoxCPM endpoint.

If `BAKONG_API_TOKEN` is not available yet, the app runs in manual confirmation mode:

1. User scans and pays the generated KHQR.
2. Telegram receives the payment order notice.
3. Admin confirms the matching bank/PayWay notice.
4. Admin approves the order in `/app/admin/payments`.
5. Tokens are credited after approval.

When Bakong token registration works again, add `BAKONG_API_TOKEN` and the billing/admin UI will switch back to automatic recheck support.

## 2. Prepare Database

Run this after setting `deploy/production.env` values:

```powershell
docker compose -f docker-compose.production.example.yml --env-file deploy\production.env build
docker compose -f docker-compose.production.example.yml --env-file deploy\production.env run --rm web npm run db:setup
```

For local verification without Docker:

```powershell
npm run db:check
```

## 3. Start Production

```powershell
docker compose -f docker-compose.production.example.yml --env-file deploy\production.env up -d
```

Check health:

```powershell
Invoke-RestMethod https://voxtts.online/api/health
```

Open these pages:

- `/app/dashboard`
- `/app/dashboard/billing`
- `/app/dashboard/api`
- `/app/admin/payments`
- `/app/admin/system`

## 4. Webhook URLs

Set PayWay/Bakong callback URL to:

```text
https://voxtts.online/api/webhooks/payway
```

Keep Telegram notifications enabled during launch so you can confirm payment events and admin actions.

## 5. Production Checks

Before launch:

```powershell
npm run deploy:check
npm run smoke:prelaunch
```

To spend a few credits and verify Modal audio plus the public API path:

```powershell
npm run smoke:prelaunch -- --live-tts
```

After deploy:

```powershell
docker compose -f docker-compose.production.example.yml --env-file deploy\production.env logs -f web
docker compose -f docker-compose.production.example.yml --env-file deploy\production.env logs -f worker
```

## 6. Modal TTS

Modal runs separately from this web app. Keep Modal configured to scale to zero when idle. The website can stay online on CPU, and it only wakes the Modal GPU endpoint when a user generates speech.

## 7. If You Use PM2 Instead

Install and build on the server, then run:

```powershell
npm ci
npm run build
npm run db:setup
pm2 start deploy\pm2.ecosystem.config.cjs
```

Set `DISABLE_INLINE_JOB_WORKER=true` for the web process so only the worker process handles queued jobs.
