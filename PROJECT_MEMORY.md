# Khmer Vox TTS Project Memory

Last updated: 2026-06-11

## Purpose

This is the starting context for future Codex chats working in this repository.
Read it before changing code, then verify the current source, `git status`,
environment, and live services because this document can become outdated.

Never put passwords, API keys, bot tokens, private keys, database credentials,
or secret values in this file. Use only existing environment, Kubernetes, and
VPS secrets.

## Memory Maintenance Rule

After any meaningful project work, update this file before finishing the chat.
Include what changed, what was fixed, what was added, what was tested, whether
it was deployed, and anything still local-only. Do not add secrets. For tiny
no-op checks or simple answers with no project state change, no update is
needed.

## Project Overview

- Workspace: `D:\website api seller`
- Product: Khmer Vox TTS API seller platform
- Live site: `https://voxtts.online`
- Image: `ghcr.io/rosielreaksa/khmer-vox-tts:latest`
- TTS provider: Modal VoxCPM2
- Public audio format: MP3 only

The platform contains dashboard speech generation, fixed standard voices,
voice cloning, saved voices, API keys, batch jobs, a worker queue, business
controls, billing, automatic QR checkout, Telegram payment operations, and an
admin dashboard.

## Code Audit

`AUDIT_FINDINGS.md` holds a verified deep audit (dated 2026-06-10): open
security/billing findings with file:line, what is already correct, and a fix
order. Read it before re-auditing — it saves a full re-check. Re-verify the
file:line references first because later code changes can move them.

## Source Of Truth

Use this order when information conflicts:

1. Current source and database schema
2. Current environment and Kubernetes secrets
3. Current tests and live endpoint checks
4. This file
5. Older files such as `AGENT_GUIDE.md`, `README.md`, and `DEPLOYMENT.md`

Some older docs still describe legacy manual PayWay or Bakong flows. Check the
current code before relying on them.

## Repository State

When this file was created:

- Git was initialized.
- Recent commits were `542ee40 Improve batch job retry controls` and
  `7ce05bf Initial project snapshot`.
- The worktree contained many uncommitted changes.
- Checkout, KHQRcc, audio-quality, and queue fixes may still be local-only.

Always run `git status --short` and inspect relevant diffs. Never reset,
discard, or overwrite existing work without explicit user approval.

## Stack And Production

- Next.js 16.2.6, React 19.2.4, TypeScript 5, Tailwind CSS 4
- PostgreSQL in production; local JSON store support in development
- K3s, Docker, GHCR
- FFmpeg for reference cleanup, mastering, and MP3 conversion
- Modal VoxCPM2 for synthesis

Next.js 16 has breaking changes. Read the relevant guide in
`node_modules/next/dist/docs/` before changing framework code.

Kubernetes namespace: `khmer-vox`

- `khmer-vox-web`: web/API, normally 2 replicas
- `khmer-vox-worker`: batch worker, normally 1 replica
- `khmer-vox-postgres`: database, normally 1 replica

The worker calls:

`http://web:3000/api/internal/jobs/process`

`proxy.ts` must not force HTTPS redirects for internal service hosts.

## Business Rules

### Free

- 100 one-time trial tokens
- Dashboard testing only
- No API keys or public API access
- No batch API or webhook callbacks
- Not for production/customer traffic

### Creator And Pro

- Paid API keys
- Standard speech, clone, and batch API access
- Normal concurrency and queue limits
- Standard clone pricing

### Business

- Requires admin approval before launch
- High-volume clone and batch API
- Reference audio required for consistent voices
- Custom token, concurrency, queue, and usage limits
- Business clone rate starts at 1.5 tokens per generated second
- Approved high-volume prepaid accounts may request 1 token per second

VoxCPM2 without reference audio can vary the speaker. Stable business voices
must use reference audio or a saved clone voice.

Standard TTS uses fixed male/female reference presets. Saved voice library
controls belong only to clone mode and must not appear in Standard TTS.

## Plans And Rates

Check `lib/plans.ts` before changing prices.

- Creator: USD 1.50, 10,000 tokens
- Pro: USD 4.00, 30,000 tokens
- 40K add-on: USD 5.00
- 85K add-on: USD 10.00
- 130K add-on: USD 15.00
- 180K add-on: USD 20.00

Plan checkout is one purchase at a time. Users cannot edit plan quantity; they
can buy or switch through a new payment.

- Standard TTS: 1.5 tokens/second
- Standard clone: 2 tokens/second
- Business clone: starts at 1.5 tokens/second

## Payment System

### Current Customer Flow

The current checkout uses KHQRcc ABA Pay:

1. Create an internal payment order.
2. Request a direct QR from KHQRcc.
3. Display the QR and poll payment status.
4. Check status with Check Transaction V2.
5. Verify success again with the full verification endpoint.
6. Validate order ID, amount, currency, and status.
7. Credit tokens idempotently.
8. Refresh checkout and billing state automatically.

Relevant files:

- `lib/khqrcc.ts`
- `app/api/payments/orders/route.ts`
- `app/api/payments/orders/[id]/verify/route.ts`
- `app/api/webhooks/khqrcc/route.ts`
- `app/app/checkout/checkout-client.tsx`
- `app/app/dashboard/billing/billing-client.tsx`

Webhook endpoint:

`https://voxtts.online/api/webhooks/khqrcc`

Never fulfill an order from an unverified browser redirect. Verify the
provider signature and transaction data. Repeated verification or webhook
delivery must never credit an order twice.

Environment names, without values:

- `KHQRCC_PROFILE_ID`
- `KHQRCC_SECRET_KEY`
- `KHQRCC_API_BASE_URL`
- `KHQRCC_ORDER_LIFETIME_MINUTES`
- `KHQRCC_SUCCESS_URL`
- `KHQRCC_DISPLAY_NAME`

Legacy local KHQR, static PayWay, and manual approval paths may remain for old
orders and admin recovery. Do not show them as the primary customer checkout
while KHQRcc is active.

## Telegram Payment Operations

Telegram supports payment/proof alerts, order details, admin links, approve
actions, token crediting, and status updates on the original message.

Approval handlers must be authorized and idempotent.

Telegram cannot call a plain localhost webhook. Local alerts may send, but
callback buttons require a public HTTPS tunnel whose URL is registered as the
webhook. The deployed `voxtts.online` HTTPS callback is the normal test path.

Never write Telegram bot tokens, chat IDs, or webhook secrets to this file.

## TTS And Audio Quality

`lib/speech-text-sanitizer.ts` is the common text preparation layer:

- Keep punctuation that improves natural pacing.
- Remove URLs, emails, emoji, Markdown, decorative symbols, stage directions,
  and sound-effect cues that should not be spoken.
- Preserve supported multilingual text instead of forcing Khmer-only input.

`lib/text-normalizer.ts` converts numbers to Khmer words only for
Khmer-dominant input.

Dashboard, API, and batch generation must use the same preparation and billing
path.

Current defaults in `lib/tts-provider.ts`:

- Reference filter:
  `highpass=f=70,lowpass=f=7600,loudnorm=I=-23:TP=-3:LRA=11`
- Output filter:
  `highpass=f=70,lowpass=f=13500,loudnorm=I=-18:TP=-2.5:LRA=9`
- MP3 bitrate: 96 kbps
- Clone temperature: 0.65
- Long chunks generate sequentially for voice consistency
- Final output is mastered and returned as MP3

Clone prompts request the same speaker as the reference with natural, clear
speech. Do not introduce scene-based voice or sound directions that can cause
speaker changes.

Supported WAV/MP3 files may be accepted as reference input, but generated
public downloads remain MP3.

## Batch Jobs And Worker

Implemented batch behavior includes:

- Standard TTS male/female selector
- Clone batch with uploaded or saved voice
- Batch voice history
- Immediate job summary while item details load
- Per-line status and error display
- Single-item and ZIP downloads
- Failed-line retry controls
- Business external IDs, speaker, timing, and webhook metadata
- Worker queue, heartbeat, and stuck-job recovery support

Worker environment names:

- `JOB_WORKER_SECRET`
- `JOB_WORKER_BASE_URL`
- `DISABLE_INLINE_JOB_WORKER`

Production worker command:

`node scripts/job-worker.mjs --loop`

## Important Completed Fixes

### Batch And Deployment

- Corrected worker calls to the internal web service.
- Skipped HTTPS redirects for internal hosts.
- Added safer worker error handling.
- Improved job selection and item loading UX.
- Added failed item retry and recovery controls.
- `scripts/sanitize-standalone.mjs` creates the hashed `pg-*` standalone alias
  required by Next/Turbopack. Do not remove it without production proof.

### Billing And Checkout

- Changed the primary customer flow to automatic KHQRcc QR verification.
- Added automatic, idempotent token crediting.
- Added checkout polling and smoother loading.
- Billing balance refreshes after confirmed payment without manual refresh.
- Removed the old "verification admin online" customer banner.
- Removed provider-internal wording from customer buttons.
- Removed the unsupported low-price plan.
- Added Pro at USD 4.00 for 30,000 tokens.
- Disabled editable plan quantity.
- Added clearer payment method and short status notes.

### Telegram

- Added payment approval from Telegram.
- Added message updates after approval.
- Added payment method details to alerts.
- Directed approval results to the configured private admin bot/chat.
- Confirmed deployed callbacks work through public HTTPS.

### Voice And Generation

- Added fixed standard male/female presets.
- Removed saved clone library controls from Standard TTS.
- Added common text sanitization across dashboard, API, and batch.
- Added smoother reference and final-output mastering.
- Reduced clone variability.
- Made long generation sequential for speaker consistency.
- Kept public output MP3-only.
- Updated UI/docs for multilingual input supported by VoxCPM2.
- Fixed valid WAV reference uploads being rejected as unsupported media.

### Local Queue Reliability

Recent local work addressed `Failed to poll background job status`:

- Development falls back to in-memory rate limiting if local PostgreSQL rate
  limiting is unavailable; production remains fail-closed.
- Batch concurrency is capped by active policy.
- Job rollups refresh after limiter failures.
- Development queued jobs can be re-kicked.
- Dashboard polling retries transient failures and shows useful errors.

Last local verification completed a real authenticated batch through the API
and Modal, returning merged `audio/mpeg`. Lint had no errors, TypeScript and
build passed, and local health returned 200. Re-run checks before relying on
this result.

Update on 2026-06-11:

- Fixed auto-segmented dashboard generation getting stuck at `Segment 0`.
- Root cause: the worker treated temporary rate/concurrency capacity as a
  failed batch item before `runGenerationForUser()` was reached, so Modal saw
  no call.
- The batch worker now requeues the job with `nextRetryAt` instead of consuming
  item attempts for capacity waits.
- The batch status route now refreshes rollup before kicking the local inline
  worker, so stale `running` jobs with no active items can become `queued` and
  restart.
- JSON and Postgres rollups now recover jobs that have queued items but no
  running items.
- Mixed success/failure jobs now become `partial` instead of `needs_review`
  when at least one segment has audio.
- The dashboard now accepts `partial` background jobs and loads the merged
  successful MP3 while telling the user to retry failed lines.
- Local verification invoked an existing 4-segment dashboard job through the
  internal worker route; Modal was reached and 3 of 4 segments generated. The
  remaining segment failed with a separate near-silent upstream-audio result.
- Verified after the fix: `npm run lint` passed with existing warnings only,
  `npx tsc --noEmit` passed, `npm run build` passed, and local
  `http://localhost:3000/api/health` returned 200.

### Local Auth And JSON Store Reliability

Update on 2026-06-11:

- Local signup and signin returned 500 because `data/store.json` had a valid
  JSON object followed by a trailing partial fragment.
- The local store was repaired by backing up the corrupted file to
  `data/store.json.corrupt-20260611-023137.bak`, truncating after the last
  valid JSON boundary, and validating with `JSON.parse`.
- `lib/json-store.ts` now writes local JSON data atomically through a temporary
  file and rename, instead of writing directly over `data/store.json`.
- Verified locally after repair with `/api/health` 200, one disposable signup
  returning 200, and signin for that disposable account returning 200.
- This was a local development data repair only; production uses Postgres and
  was not changed by the data-file repair.

Follow-up on 2026-06-11:

- Windows local dev still hit `EPERM: operation not permitted, rename ...tmp ->
  data/store.json` during generation/history polling when the JSON store was
  replaced while another local read was active.
- `lib/json-store.ts` now uses a cross-process `data/store.json.lock` for
  read-modify-write mutations, retries retryable Windows replace errors, and
  removes temp files on failure.
- Removed one local failed history row whose only error was the JSON-store
  rename failure. Backup files were kept in `data/`.
- Stress-checked with 8 concurrent disposable local signups; all returned 200,
  `data/store.json` stayed valid, and no temp/lock files remained. The
  disposable users were removed afterward.

## Known Browser Extension Warning

A hydration warning containing `bis_skin_checked` was traced to the Trust
Wallet Chrome extension injecting attributes. It is not application output.
Test in incognito or disable the extension for localhost before changing React
code for this warning.

## Local Commands

```powershell
npm install
npm run dev
```

Default local URL: `http://localhost:3000`

Required checks:

```powershell
npm run lint
npx tsc --noEmit
npm run build
npm run db:check
```

Useful smoke tests:

```powershell
npm run smoke:prelaunch
npm run smoke:payment
npm run smoke:telegram-payment
npm run smoke:telegram-payment-action
npm run smoke:final
```

Use existing local environment values. Do not create secret documentation.

## Deployment

Do not deploy until these pass:

```powershell
npm run lint
npx tsc --noEmit
npm run build
docker build -t ghcr.io/rosielreaksa/khmer-vox-tts:latest .
docker push ghcr.io/rosielreaksa/khmer-vox-tts:latest
```

Use the existing authorized SSH configuration, then:

```text
kubectl rollout restart deployment/khmer-vox-web -n khmer-vox
kubectl rollout restart deployment/khmer-vox-worker -n khmer-vox
kubectl rollout status deployment/khmer-vox-web -n khmer-vox --timeout=180s
kubectl rollout status deployment/khmer-vox-worker -n khmer-vox --timeout=180s
```

Verify:

```powershell
curl.exe -k -s -o NUL -w "%{http_code}" https://voxtts.online/api/health
curl.exe -k -s -o NUL -w "%{http_code}" https://voxtts.online/app/dashboard/jobs
```

Also verify a QR checkout, exactly-once crediting, Telegram actions, standard
and clone MP3 output, and one queued batch job.

## Safety Rules

- Never expose, print, or write secrets.
- Never replace environment or Kubernetes secrets without approval.
- Never reset or discard the dirty worktree.
- Never credit from a browser success screen alone.
- Keep payment and Telegram approval idempotent.
- Keep production authorization and rate limiting fail-closed.
- Free users must not gain API key access.
- Generated public audio must remain MP3.
- Consistent business voices must require reference audio.
- Run lint, typecheck, and build before deployment.

## Next Priorities

1. Finish and verify current uncommitted KHQRcc changes.
2. Improve webhook retry visibility and payment reconciliation.
3. Improve batch history, per-line errors, downloads, and retries.
4. Add admin force-process and selected-job recovery.
5. Improve worker health and stuck-job visibility.
6. Add database and uploaded-audio backup/restore operations.
7. Polish business customer limits and launch review.
8. Expand clone/batch API documentation.
9. Add regression tests for payment idempotency, queue recovery, text
   sanitization, and MP3 output.

## New Chat Checklist

1. Read `AGENTS.md` and this file.
2. Run `git status --short`.
3. Inspect relevant diffs.
4. Read relevant Next.js 16 docs.
5. Confirm whether the task targets local, deployed, or both.
6. Do not read, print, or copy secret values.
7. Make the smallest compatible change.
8. Run focused tests, then lint, typecheck, and build before deploy.
9. Update this file when project state changes.
10. Report what changed, what was verified, and what remains local-only.
