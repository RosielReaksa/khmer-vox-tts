# Khmer Vox TTS

Next.js app for selling Khmer VoxCPM TTS API access with user accounts, API keys, token balances, billing orders, and admin payment approval.

## Local Development

```powershell
npm run dev -- --port 3000
```

Open `http://localhost:3000`.

## Important Routes

- `/app/dashboard` - text to speech dashboard
- `/app/dashboard/voice-cloning` - temporary session clone voice
- `/app/dashboard/jobs` - queued batch TTS and session clone jobs
- `/app/dashboard/api` - API keys and request logs
- `/app/dashboard/billing` - token packs and KHQR payment orders
- `/app/checkout` - focused manual ABA/KHQR checkout for prepaid token packs
- `/docs` - public developer docs for speech, clone voice, tokens, errors, and webhooks
- `/support` - public support instructions for payments, API failures, and clone voice issues
- `/terms` - public acceptable-use and billing terms
- `/payment-guide` - public manual KHQR payment instructions and order status meanings
- `/refund-policy` - public cancellation and refund policy for prepaid token packs
- `/privacy` - public data handling policy
- `/app/admin` - admin command center for revenue, customers, usage, and launch risk
- `/app/admin/customers` - customer list, balances, suspension, and support controls
- `/app/admin/usage` - global generation/API usage log and failure filters
- `/app/admin/payments` - admin approval/rejection for payment orders
- `/app/admin/payment-webhooks` - PayWay webhook audit log
- `/app/admin/system` - production launch checklist and live system tests
- `/app/admin/jobs` - batch job monitoring, CSV export, and retry failed jobs

## Environment

Copy `.env.example` to `.env` and set:

```env
SESSION_SECRET="replace-with-a-long-random-secret"
ADMIN_EMAILS="owner@example.com"
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@YOUR_SUPABASE_HOST:5432/postgres"
DATABASE_SSL="true"
DATABASE_POOL_MAX="10"
APP_PUBLIC_URL="https://voxtts.online"
KHQR_DISPLAY_NAME="Khmer Vox TTS"
KHQR_ACCOUNT="your-bakong-id@bank"
KHQR_BAKONG_ACCOUNT_ID="your-bakong-id@bank"
KHQR_CITY="Phnom Penh"
KHQR_CURRENCY="USD"
KHQR_USD_TO_KHR_RATE="4100"
BAKONG_API_TOKEN="YOUR_BAKONG_API_TOKEN"
PAYWAY_WEBHOOK_SECRET="YOUR_PAYWAY_WEBHOOK_SECRET"
TELEGRAM_ADMIN_HANDLE="https://t.me/OfficalVoxTTS"
TELEGRAM_BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN"
TELEGRAM_CHAT_ID="YOUR_TELEGRAM_CHAT_ID"
JOB_WORKER_SECRET="YOUR_LONG_RANDOM_WORKER_SECRET"
TTS_UPSTREAM_URL="https://YOUR_MODAL_ENDPOINT/v1/audio/speech"
TTS_UPSTREAM_TOKEN="YOUR_MODAL_BEARER_TOKEN"
TTS_UPSTREAM_MODEL="voxcpm2"
TTS_RATE_LIMIT_WINDOW_MS="60000"
TTS_RATE_LIMIT_LEASE_MS="900000"
TTS_API_RATE_LIMIT="60"
TTS_API_CONCURRENT_LIMIT="4"
AUTH_SIGNIN_RATE_LIMIT="12"
AUTH_SIGNUP_RATE_LIMIT="5"
```

If `ADMIN_EMAILS` is empty, no users have admin access. Set it to your owner email before using `/app/admin/*`.

Storage mode is selected automatically:

- `DATABASE_URL="file:./dev.db"` or empty uses `data/store.json` for local testing.
- `DATABASE_URL="postgresql://..."` or `postgres://...` uses Postgres/Supabase.
- Supabase normally needs SSL. Keep `DATABASE_SSL="true"` or omit it. For a local Postgres server without SSL, set `DATABASE_SSL="false"`.
- Production now refuses to use the JSON store. Set a Postgres/Supabase `DATABASE_URL` before deploying.

## Payment Approval Flow

1. User creates a payment order from Billing.
2. User scans the generated KHQR code with the exact order amount.
3. PayWay can call `/api/webhooks/payway` with a successful payment callback.
4. If the callback order ID, amount, and currency match, tokens are credited automatically once.
5. If automatic verification is not configured, admin opens `/app/admin/payments` and approves manually after checking PayWay/ABA.

Rejecting an order does not add tokens.

## Static PayWay QR Fallback

If your official ABA PayWay merchant QR works but local dynamic KHQR is rejected by the banking app, use static PayWay mode while waiting for production Bakong or PayWay QR API access.

1. Save the exact working PayWay QR image as `public/payway-static-qr-code.png`.
2. Set `PAYMENT_CHECKOUT_MODE="static_payway_qr"`.
3. Leave `STATIC_PAYWAY_QR_IMAGE_URL="/payway-static-qr-code.png"` or point it to a hosted image URL.
4. Restart the app.

In this mode the app shows the merchant QR and the exact amount to enter manually. After payment, users click **I Paid** and upload the ABA receipt. Tokens are credited only after the payment notice is matched and approved by admin.

## PayWay Webhook

Configure PayWay/ABA to send payment notifications to:

```text
https://voxtts.online/api/webhooks/payway
```

The webhook expects PayWay KHQR fields such as `merchant_ref`, `payment_status_code`, `original_amount`, and `original_currency`. The app uses `merchant_ref` as the order ID, then checks that the paid amount and currency match the QR order before adding tokens.

Set `PAYWAY_WEBHOOK_SECRET` before production so callbacks must be signed. Unsigned callbacks are accepted only in local development.

Every PayWay callback is saved to `/app/admin/payment-webhooks` with signature status, provider amount, provider status, matched order, and the final credit decision. Use this page to debug customer claims, duplicate callbacks, amount mismatches, expired orders, and invalid signatures.

## Telegram Payment Alerts

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_PAYMENT_BOT_CHAT_ID` to receive new KHQR payment orders in the private Telegram bot chat. If the private chat ID is not set yet, send `/start` to the bot from the Telegram account configured in `TELEGRAM_ADMIN_HANDLE`; the webhook saves that private chat ID as a non-secret system setting. The alert includes user email, order ID, plan, quantity, total price, tokens, payment reference, note, and proof upload status. If a user uploads a proof image, the app also sends it as a Telegram photo.

If Telegram is not configured or fails, payment orders are still saved and can be reviewed in `/app/admin/payments`.

## API Protection

Generation input is capped at 5,000 characters per request. Token charging is locked in the active store before each upstream TTS call, and failed upstream calls are refunded automatically.

When `DATABASE_URL` points to Postgres/Supabase, rate limits and concurrency leases are stored in the database so limits work across multiple app instances. Without Postgres, local development uses an in-memory limiter.

Default per-user limits:

- Dashboard TTS: 20 requests/minute, 2 running at once
- Dashboard clone: 8 requests/minute, 1 running at once
- API TTS: 60 requests/minute, 4 running at once
- API clone: 20 requests/minute, 2 running at once
- Auth sign in: 12 attempts/minute per IP/email
- Auth sign up: 5 attempts/minute per IP/email

API keys can also have optional daily and monthly token limits from Dashboard > API. Admins can set business overrides per key from Admin > Customers: concurrent API requests, running batch jobs, and max queued jobs.

Override with these environment variables when needed:

```env
TTS_RATE_LIMIT_WINDOW_MS="60000"
TTS_RATE_LIMIT_LEASE_MS="900000"
TTS_DASHBOARD_RATE_LIMIT="20"
TTS_DASHBOARD_CONCURRENT_LIMIT="2"
TTS_DASHBOARD_CLONE_RATE_LIMIT="8"
TTS_DASHBOARD_CLONE_CONCURRENT_LIMIT="1"
TTS_API_RATE_LIMIT="60"
TTS_API_CONCURRENT_LIMIT="4"
TTS_API_CLONE_RATE_LIMIT="20"
TTS_API_CLONE_CONCURRENT_LIMIT="2"
API_KEY_DEFAULT_MAX_CONCURRENT_JOBS="2"
API_KEY_DEFAULT_MAX_QUEUED_JOBS="10"
BATCH_WEBHOOK_MAX_ATTEMPTS="3"
BATCH_WEBHOOK_SIGNING_SECRET="generate-a-long-random-webhook-signing-secret"
AUTH_SIGNIN_RATE_LIMIT="12"
AUTH_SIGNIN_CONCURRENT_LIMIT="4"
AUTH_SIGNUP_RATE_LIMIT="5"
AUTH_SIGNUP_CONCURRENT_LIMIT="2"
```

## Batch Worker

Batch endpoints return `202 Accepted` with a queued job. The app starts a lightweight inline worker for local/dev use, and production can run a dedicated worker:

```powershell
npm run worker:jobs
```

Set `JOB_WORKER_SECRET` before production. The worker calls `/api/internal/jobs/process` and processes queued jobs one at a time. Clone voice samples are stored only while the queued job is pending/running and are cleared after the job reaches `completed`, `partial`, or `failed`.

Public API batch flow:

1. `POST /api/v1/audio/batch` or `/api/v1/audio/batch/clone`
2. Poll `GET /api/v1/audio/batch/jobs/{jobId}`
3. Download `GET /api/v1/audio/batch/jobs/{jobId}/download`

Clone endpoints require `voice_consent=true`. Business callers can include `webhook_url`, job `external_id`, job `metadata`, and per-line objects with `text`, `external_id`, `speaker`, `start_ms`, `end_ms`, and `metadata`. The dashboard batch page also has a Dubbing JSON mode for testing this line format before integrating a customer backend. The worker posts job/item status when a job reaches `completed`, `partial`, or `failed`; audio stays behind the authenticated download endpoint instead of being embedded in the callback.

If `BATCH_WEBHOOK_SIGNING_SECRET` is set, callbacks include `X-Khmer-Vox-Timestamp` and `X-Khmer-Vox-Signature: sha256=...`, where the signature is HMAC-SHA256 over `timestamp.raw_body`.

## Production Database

The current local app can use `data/store.json` for development. Before real users, use Supabase/Postgres by setting `DATABASE_URL` to the Supabase connection string.

The app can create its required tables automatically on first use, and the same schema is also available here:

- SQL schema: `database/schema.sql`

Recommended setup:

```powershell
npm run db:setup
npm run db:check
```

If you need to move local JSON test data into Supabase/Postgres:

```powershell
npm run db:migrate-json -- --dry-run
npm run db:migrate-json
```

The production database must include these tables:

- `users`
- `api_keys`
- `token_transactions`
- `generations`
- `payment_orders`
- `payment_webhook_events`
- `rate_limit_buckets`
- `rate_limit_leases`

Run `npm run db:setup` after schema changes and `npm run db:check` before launch.

Do not sell publicly on the JSON store because it is not durable enough for payments.

## Deployment

Production needs both the Next.js web process and the background job worker. Use `DEPLOYMENT.md` for Docker Compose, PM2, environment setup, database setup, health checks, and the PayWay webhook URL.

If `BAKONG_API_TOKEN` is missing, KHQR checkout still works in manual confirmation mode. Users pay the generated QR amount, Telegram/admin notices are used as payment evidence, and admins approve orders in `/app/admin/payments` before tokens are credited.

## Checks

```powershell
npm run lint
npm run build
npm run smoke:prelaunch
npm run smoke:final
npm run smoke:payment -- --base-url=http://localhost:3000
npm run smoke:payway-webhook -- --base-url=http://localhost:3000
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\website api seller\scripts\full_feature_check.ps1"
```

Admins can also open `/app/admin/system` to copy the PayWay webhook URL and run live checks for database, KHQR, PayWay signing, Telegram alerts, and a short Modal TTS upstream call.

To spend a few credits and verify Modal TTS, public API audio, and clone voice from the prelaunch script:

```powershell
npm run smoke:prelaunch -- --live-tts
npm run smoke:final -- --live-tts
```

To also test manual admin approval and token crediting, set `SMOKE_ADMIN_EMAIL` and `SMOKE_ADMIN_PASSWORD`, then run:

```powershell
npm run smoke:payment -- --base-url=http://localhost:3000 --approve
npm run smoke:prelaunch -- --approve --admin-email=you@example.com --admin-password=your-password
npm run smoke:final -- --approve --admin-email=you@example.com --admin-password=your-password
```
