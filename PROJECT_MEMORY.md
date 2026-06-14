# Khmer Vox TTS Project Memory

Last updated: 2026-06-14

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
- Generated output is kept close to the upstream VoxCPM2 result.
- WAV upstream responses are converted to MP3; MP3 upstream responses are
  preserved.
- No final EQ, loud-normalization, silence trimming, PCM remastering, or
  stuck-tone quality repair is applied to passing generated audio.
- MP3 bitrate default: 160 kbps.
- Standard preset temperature default: 0.45.
- Clone temperature default: 0.55.
- Long chunks generate sequentially and target about one minute of audio per
  provider request for voice consistency.
- A narrow silence guard analyzes generated audio and retries near-silent
  upstream output, but returns the original upstream bytes when audio passes.

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

### Dashboard UI

- Rebuilt the dashboard audio result player (2026-06-14, local-only, not yet
  deployed). Replaced the basic `<audio controls>` tag in
  `app/app/dashboard/speech-workspace.tsx` with a custom `WaveformPlayer`
  component: decodes the MP3 via the Web Audio API into 96 peak bars, renders a
  seekable waveform with a played/unplayed split and a red playhead, supports
  click and pointer drag-to-seek, play/pause, a 0.75x-1.5x speed cycle button,
  and a current/total time readout. Falls back to a synthetic waveform if
  decoding fails. The separate "Download audio" button is unchanged. Verified
  with `npm run build` (exit 0, no lint/TS errors).

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

Local performance follow-up on 2026-06-11:

- Local development was much slower than production because `data/store.json`
  had grown above 42 MB, mostly from stored base64 audio, and every batch poll
  refreshed and rewrote the full file.
- The local JSON store now caches normalized reads by file metadata, shares an
  in-flight read, and writes compact JSON after atomic replacement.
- Batch status polling no longer refreshes the full job rollup on every GET and
  no longer returns item audio payloads or the stored clone sample.
- Local inline worker kicks are deduplicated per job, including queued work
  resumed from a stale `running` job after a dev-server restart.
- File-backed local development defaults to one batch item at a time unless
  `BATCH_ITEM_CONCURRENCY` is explicitly configured. Production with Postgres
  keeps the existing higher default concurrency.
- A real local 3-segment long-text job completed successfully with one running
  item at a time. Warm status polls were usually 20-40 ms, and the merged result
  returned a valid 2.4 MB `audio/mpeg` MP3 for about 204 seconds of audio.
- Verification passed: `npm run lint` with existing warnings only,
  `npx tsc --noEmit`, and `npm run build`.
- These performance changes remain local-only and were not deployed.

Dashboard long-form Standard TTS limit update on 2026-06-11:

- Standard TTS on the dashboard now accepts up to 50,000 characters.
- The 5,000-character limit remains the single-segment and direct API input
  limit. Clone mode also keeps the 5,000-character dashboard input limit.
- `/api/generate` accepts the 50,000-character dashboard Standard TTS payload
  only because long text is immediately split into queued batch segments.
- This avoids sending one huge request to Modal while allowing long-form user
  text in the main Generate Speech page.
- Verification passed locally: `npm run lint` with existing warnings only,
  `npx tsc --noEmit`, and `npm run build`.
- This limit update remains local-only and was not deployed.

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

## Recent Local Audio Quality Work

Update on 2026-06-11:

- Generated audio now goes through shared silence cleanup before public MP3
  delivery. This applies to dashboard, API, queued batch output, and merged
  batch downloads.
- Upstream chunks that are mostly quiet, have a long quiet tail, or contain a
  long silent section are rejected and retried instead of being saved as a
  silent or empty-sounding result.
- Merged batch MP3 downloads are re-cleaned and mastered before returning to
  the dashboard so old segment joins do not expose long silent tails.
- Non-secret quality knobs were added to `.env.example` for silence filters,
  low-window analysis, long-silence limits, and retry behavior.
- Verification passed locally: `npm run lint` with existing warnings only,
  `npx tsc --noEmit`, and `npm run build`.
- This audio-quality work remains local-only and was not deployed.

## Recent Modal Account Pool Fix

Update on 2026-06-11:

- Modal deployment now reuses an existing configured VoxCPM API key from the
  active upstream pool when a new account is connected, so the connect flow no
  longer fails when `VOXCPM_API_KEY` is absent from the local shell.
- The upstream pool loader now merges the persisted `data/tts-upstream-pool.json`
  entries with the env-backed pool instead of letting an empty or stale file
  hide connected accounts.
- Undeploy now removes only the selected endpoint by URL when available, then
  rewrites both pool sources from the merged filtered list so one account no
  longer clears the rest.
- The admin Modal page now sends the selected endpoint URL with the undeploy
  request to make account removal unambiguous.
- Verification passed locally: `npm run lint` with existing warnings only,
  `npx tsc --noEmit`, and `npm run build`.
- This Modal account pool fix remains local-only and was not deployed.

## Recent Security Fixes (SSRF + Command Injection)

Update on 2026-06-11:

Closed the two CRITICAL findings from `AUDIT_FINDINGS.md` (C1, C2).

- C1 (SSRF via webhook URLs): added `lib/ssrf-guard.ts`. It blocks
  cloud-metadata (`169.254.169.254`), loopback, RFC1918 private ranges, CGNAT
  (100.64/10), multicast/reserved, IPv6 loopback/link-local/ULA and
  IPv4-mapped addresses, and internal hostnames (`localhost`, dotless
  service names like `web`/`postgres`, `*.svc.cluster.local`, `.internal`,
  `.local`). It exposes `safeFetch`, which re-resolves DNS and re-validates
  every redirect hop using `redirect: "manual"`.
- Wired `safeFetch` into both outbound user-supplied webhook paths:
  `lib/batch-service.ts` (batch job callback delivery) and
  `lib/business-webhook-test.ts` (dashboard webhook test).
- The guard is ON in production and OFF in local development by default so
  localhost webhook testing keeps working. Override with the
  `WEBHOOK_SSRF_GUARD` env name (`1`/`true`/`on` to force on, `0`/`false`/`off`
  to force off). No new production env value is required; it is on automatically
  when `NODE_ENV=production`.
- C2 (command injection in Modal deployer): the admin deploy route
  `app/api/admin/modal/deploy/route.ts` now validates `tokenId`, `tokenSecret`,
  `profile`, and `modelFile` with strict charset regexes plus length caps.
  `lib/modal-deployer.ts` also validates each user-influenced arg with
  `assertSafeModalArg` before every `spawn`, which additionally covers the
  undeploy path whose `label`/`profile` come from unvalidated query params.
  `shell: true` was intentionally kept for cross-platform `modal`/`modal.cmd`
  resolution; injection is closed by the input validation instead.
- Verification passed locally: `npx tsc --noEmit` clean, `npm run lint`
  0 errors (67 pre-existing warnings only), `npm run build` exit 0, and a
  standalone SSRF predicate test passed all 25 block/allow cases (including
  allowing the production host `voxtts.online`).
- These security fixes remain local-only and were not deployed. C2's route-level
  regex is a new input contract: confirm real Modal token IDs/secrets only use
  `[A-Za-z0-9._:-]` before deploying, or relax the regex if a legitimate value
  is rejected.

## Recent V2 Generation Queue Work

Update on 2026-06-11:

- Started the V2 generation-system rebuild by making dashboard generation
  queue-first. `/api/generate` and `/api/generate-clone` no longer call Modal
  directly; they validate/auth/rate-limit the request, create a queued job,
  kick the worker, and return a job id for the existing dashboard poller.
- Added `lib/generation-queue.ts` as the shared dashboard enqueue gateway.
  It prepares text once, auto-splits long text into worker-safe segments, keeps
  each line under existing batch limits, and creates one dashboard job for the
  full request.
- Dashboard Clone Voice now accepts the same 50,000-character dashboard limit
  as Standard TTS; the worker still processes it as smaller validated segments.
- The existing dashboard UI is unchanged functionally: it already supports
  queued jobs, progress polling, merged MP3 loading, balance refresh, and
  partial-job warnings.
- Public `/api/v1/audio/speech` remains synchronous for compatibility. The
  existing batch API remains the async API path until a separate v2 public
  async endpoint is introduced.
- Verification passed locally: `npm run lint` with existing warnings only,
  `npx tsc --noEmit`, and `npm run build`.
- This V2 generation queue work remains local-only and was not deployed.

## Recent V2 Async API And Worker Operations Work

Update on 2026-06-12:

- Added public async customer API endpoints for queued MP3 jobs:
  `POST /api/v2/audio/jobs`, `POST /api/v2/audio/clone/jobs`,
  `GET /api/v2/audio/jobs/[id]`, and
  `GET /api/v2/audio/jobs/[id]/audio`.
- V2 standard jobs accept long `input`, auto-clean and split text into worker
  segments, enforce paid API-key access, enforce MP3-only output, apply queue
  and token limits, and return `202 Accepted` with `job_id`, `status_url`,
  `audio_url`, and `zip_url`.
- V2 clone jobs use the same queue/status/download contract and require voice
  consent plus a reference sample from multipart upload or JSON base64. Clone
  reference samples are cleared from the job record after terminal processing.
- Added `lib/v2-audio-jobs.ts` as the shared V2 input expansion and response
  serializer. V2 status payloads intentionally expose `has_audio` and download
  URLs, not audio base64.
- Webhook payloads now include V2 status/audio URLs plus zip URLs so API users
  can poll or download MP3 after completion without the admin dashboard.
- The admin Jobs page now shows Modal account pool health, endpoint cooldowns,
  request counts, success rate, and latency. Admins can reset Modal cooldowns
  and force-process a selected queued job.
- Modal failover now briefly cools down endpoints that return invalid or empty
  generated audio, so retries can route to another configured account.
- Added store-level audio lifecycle cleanup for both local JSON and Postgres:
  `cleanupOldAudioStorage` clears old stored audio payloads and clone samples
  after a retention window without deleting users, jobs, payments, API keys, or
  saved voices. The admin Jobs page has dry-run and confirmed cleanup actions.
- Added smoke helpers:
  `npm run smoke:v2-audio-api` for async API submit/status/download checks
  (requires an API key at runtime, never stored), and
  `npm run smoke:audio-quality -- --file <mp3>` for ffmpeg-based silent-audio
  detection.
- Verification passed locally: `npm run smoke:v2-audio-api` skipped because no
  API key was provided, `npm run smoke:audio-quality -- --file "D:\test result\download.mp3"`
  passed, `npm run lint` passed with existing warnings only,
  `npx tsc --noEmit` passed, and `npm run build` passed.
- This V2 async API and worker-operations work remains local-only and was not
  deployed.

## Recent Spaces Audio Storage Work

Update on 2026-06-12:

- Added optional DigitalOcean Spaces/S3-compatible object storage for generated
  MP3 audio. The app reads storage credentials only from environment variables;
  no access key or secret value is stored in this repository or this memory
  file.
- Added `lib/audio-storage.ts` with signed S3-compatible PUT/GET/DELETE
  helpers. It supports both regional endpoints such as
  `https://sgp1.digitaloceanspaces.com` and bucket endpoints such as
  `https://<bucket>.sgp1.digitaloceanspaces.com`.
- Added generated-audio pointer fields to both local JSON and Postgres-backed
  records: `audioObjectKey`/`audioObjectUrl` in app records and
  `audio_object_key`/`audio_object_url` in Postgres. Existing legacy
  `audioBase64` rows remain supported.
- New single-generation output uploads to object storage when Spaces env vars
  are configured, then persists the object key instead of large inline base64.
  The synchronous dashboard/API response still returns audio bytes immediately
  for compatibility.
- Batch item records reuse the generation object's storage key, so batch job
  details, ZIP downloads, merged previews, V1 downloads, V2 downloads, status
  payloads, dashboard history, and dashboard live events all treat either
  inline base64 or object storage as available audio.
- Added `npm run smoke:spaces-storage`, which uploads/downloads/verifies/deletes
  a tiny smoke object when Spaces env vars are present and skips cleanly when
  they are absent.
- Added `.env.example` placeholders for `SPACES_ENDPOINT`, `SPACES_BUCKET`,
  `SPACES_REGION`, `SPACES_PUBLIC_BASE_URL`, `SPACES_ACCESS_KEY_ID`, and
  `SPACES_SECRET_ACCESS_KEY`.
- Verification passed locally: `npm run smoke:spaces-storage` skipped because
  Spaces env vars were not configured in the shell, `npx tsc --noEmit` passed,
  `npm run lint` passed with existing warnings only, and `npm run build`
  passed.
- This Spaces audio storage work remains local-only and was not deployed. To
  test real uploads locally, set the Spaces env vars in the local runtime, then
  restart the dev server before generating audio.

## Recent Local Auth And Runtime Fix

Update on 2026-06-12:

- Fixed local sign-in on `http://localhost:3001` when running a production-built
  server with `next start`. The root cause was secure-only CSRF/session cookies
  being rejected on plain HTTP localhost.
- `proxy.ts` now keeps CSRF cookies secure for non-local production traffic but
  permits non-secure CSRF cookies for localhost or an explicit local cookie
  override.
- `lib/session.ts` now supports explicit local cookie security overrides for
  production-built local testing. Keep these overrides disabled on the VPS.
- `lib/store.ts` still requires Postgres in production by default, but can use
  the local JSON store only when an explicit local-only env flag is enabled.
- Added `.env.example` local-test placeholders for the JSON-store and cookie
  overrides. No real secret values were added.
- Restarted the local `3001` server with local-only flags, removed the stale
  JSON store lock, and verified:
  `curl http://localhost:3001/api/health` returned 200,
  `curl http://localhost:3001/app/signin` returned 200, and a fake sign-in with
  matching CSRF cookie returned 401 instead of 403/500.
- Verification passed locally: `npx tsc --noEmit`, `npm run lint` with existing
  warnings only, and `npm run build`.
- This fix is local-only and was not deployed.

## Recent Long Audio WAV Compatibility Fix

Update on 2026-06-12:

- Fixed a long-generation failure where a completed multi-segment job could
  fail during final merge/MP3 conversion with:
  `Upstream WAV format is not supported for MP3 conversion.`
- Root cause: the app parser accepted only classic PCM-16 WAV headers. FFmpeg
  and upstream services can emit valid WAVE_FORMAT_EXTENSIBLE PCM-16 WAV after
  cleanup/streaming, especially in long multi-segment flows. The old strict
  parser rejected that valid audio after chunk retries had already succeeded.
- `lib/tts-provider.ts` now accepts both classic PCM WAV and
  WAVE_FORMAT_EXTENSIBLE PCM-16 WAV with the PCM subformat GUID before merging
  chunks or encoding final MP3 output.
- Restarted the local `3001` server with the rebuilt code and verified:
  `curl http://localhost:3001/api/health` returned 200 and
  `curl http://localhost:3001/app/dashboard/history?mode=tts` returned 200.
- Verification passed locally: `npx tsc --noEmit`, `npm run lint` with existing
  warnings only, and `npm run build`.
- This fix is local-only and was not deployed. Deploying to VPS will require a
  Docker image rollout and will ship the current worktree state, not only this
  single-file fix.

## Recent Long Text Stability Fix

Update on 2026-06-12:

- Fixed another long-text dashboard failure path where 3,000-10,000 character
  requests could still fail with
  `Upstream WAV format is not supported for MP3 conversion.`
- Root cause: dashboard generation was split into roughly 700-character batch
  lines, then each line could split again inside the provider's 400-character
  synthesis path. That nested provider merge could still hit WAV container
  edge cases before the final MP3 conversion.
- Dashboard queued generation now defaults to 360-character worker lines and
  has a dashboard-only cap of 160 generated lines, allowing the existing
  50,000-character dashboard limit to stay under the provider's safer
  single-call size in normal use.
- Public batch API limits remain unchanged at 100 lines. V2 async API input
  expansion also defaults to 360-character generated segments for safer normal
  long-form requests.
- Generated-audio cleanup now forces one audio stream, no video, mono PCM-16,
  and a canonical 24 kHz sample rate before chunk quality checks and MP3
  conversion. It asks FFmpeg for raw `s16le` PCM and wraps that PCM with the
  app's own WAV header, so streamed FFmpeg WAV headers can no longer trigger
  `Upstream WAV format is not supported for MP3 conversion.`
- The local JSON store now invalidates its read cache before every locked
  mutation. This prevents a write from starting with a stale store snapshot and
  losing a just-created processing generation record during long batch
  finalization.
- Completed batch rollups now clear stale `errorMessage`, `deadLetterReason`,
  and `lastWorkerError` fields, and touching an already-terminal batch job
  refreshes its rollup before returning. This keeps successful retries from
  showing an old worker warning.
- Retried the stuck local dashboard Standard TTS job
  `31af3d1c-3217-488d-bed2-1cb982c9f3a1`: it completed with 10/10 successful
  segments, all items had `audio/mpeg` MP3 output stored by object key, and the
  final job had `errorMessage: null` and `lastWorkerError: null`.
- Restarted the local `3001` server with the local-only JSON/cookie flags and
  verified `http://localhost:3001/api/health` returned 200 and
  `http://localhost:3001/app/dashboard/history?mode=tts` returned 200.
- Verification passed locally: `npx tsc --noEmit`, `npm run lint` with
  existing warnings only, and `npm run build`.
- This fix is local-only and was not deployed.

## New Staging VPS Deployment

Update on 2026-06-12:

- Deployed the current fixed worktree to the new staging VPS at
  `http://178.128.103.120`.
- Production `https://voxtts.online` was not rolled out or changed.
- Installed K3s and added a 4 GiB swap file on the 2 vCPU / 4 GiB staging VPS.
- Staging runs one Postgres pod, one web pod, and one worker pod in the
  `khmer-vox` namespace with a hostless Traefik HTTP ingress.
- Built and pushed the isolated image tag
  `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260612-2`.
- GHCR rejected the copied pull credential for the staging tag with HTTP 403,
  so the same built image was imported directly into staging K3s containerd
  and both deployments use `imagePullPolicy: IfNotPresent`.
- Added an opt-in `DISABLE_HTTPS_REDIRECT` proxy setting for HTTP-only staging.
  It defaults to disabled, so production HTTPS behavior is unchanged.
- Staging web also sets `COOKIE_SECURE=false`,
  `SESSION_COOKIE_SECURE=false`, and `CSRF_COOKIE_SECURE=false` so login can
  work over the temporary HTTP IP endpoint.
- Corrected `deploy/k3s-deployment.yml` worker routing from the nonexistent
  `khmer-vox-web-svc` hostname to `http://web:3000`.
- Initialized the staging Postgres schema with `node scripts/db.mjs setup`.
- Verified staging:
  - `/api/health` returned 200 with `store: postgres`.
  - `/app/signin`, `/app/signup`, and `/app/dashboard/jobs` returned 200.
  - `khmer-vox-postgres`, `khmer-vox-web`, and `khmer-vox-worker` were all
    ready 1/1.
  - Worker started cleanly with no service-DNS fetch errors.
- Staging has a fresh database, but currently shares copied external service
  credentials with production. Use it carefully for Modal, Telegram, and
  payment tests until separate staging credentials are configured.
- The first staging user account was not initially an admin because the
  staging manifest still used the placeholder `owner@example.com`.
  `ADMIN_EMAILS` is now set on the staging web and worker deployments to the
  owner's staging account email. Production admin configuration was not
  changed.

## Recent Audio Join And Noise-Gate Fix

Update on 2026-06-12:

- Analyzed a reported bad MP3 output from `D:\ads testss\download.mp3`. The
  file was a valid MP3 and was not clipped, but it contained many long quiet
  gaps and one sustained non-speech/noise section. The issue was the generation
  and merge pipeline, not object storage.
- `lib/tts-provider.ts` now adds a stronger generated-audio quality gate:
  sustained high zero-crossing sections are treated as non-speech noise,
  rejected, and retried before they can be saved into a final MP3.
- Bad generated chunks now briefly cool down the Modal endpoint that returned
  them, allowing retries to route to another configured account when available.
- Each generated chunk is normalized to canonical mono PCM, edge-trimmed,
  faded at chunk boundaries, and joined with a short controlled pause before
  final MP3 mastering.
- The generated-audio silence filters now compact internal pauses longer than
  about 1.25 seconds while preserving a short natural pause, reducing the
  "one segment to the next is not smooth" behavior.
- Standard TTS now keeps the preset voice hint alongside the fixed
  reference sample instead of taking the generic clone branch that strips the
  speaker label. Chunk joins now use crossfade blending by default, with zero
  added join silence, so long-form audio should sound less cut and less radio-
  like.
- Added `mergePublicMp3SegmentsForDelivery()` and wired it into dashboard
  merged batch downloads and V2 async audio downloads. These paths now decode
  each successful segment, validate/trim/join it, and encode one final MP3
  instead of byte-concatenating MP3 segments.
- `scripts/audio-file-quality-check.mjs` now checks for sustained high
  zero-crossing noise, excessive silence, and low volume. It rejected the
  reported bad MP3 with a 2.75 second high-ZCR section and passed a known
  normal 204 second MP3.
- Deployed the fix to the fixer/staging VPS only as
  `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260612-4`. Production
  `https://voxtts.online` was not changed.
- Verification passed: `npx tsc --noEmit`, `npm run lint` with existing
  warnings only, `npm run build`, Docker build, staging rollout for web and
  worker, staging `/api/health` 200, and staging `/app/dashboard/jobs` 200.
- A real staging dashboard Standard TTS smoke with four queued segments
  completed 4/4. The downloaded merged MP3 passed the audio quality gate:
  duration about 29.98s, mean volume about -17.7 dB, high-ZCR 0.0%, longest
  high-ZCR 0.00s, longest low-level section 0.25s, and ffmpeg found no silence
  longer than 0.5s.
- During smoke testing, Modal returned empty audio for one chunk; the new
  cleanup retry/cooldown behavior rejected it, retried through the worker, and
  the final job still completed successfully.

Follow-up on 2026-06-12:

- Fixed Standard TTS preset routing so the provider keeps the fixed male/female
  speaker hint while still sending the preset reference WAV to VoxCPM2. This
  keeps Standard TTS, normal API Standard TTS, V2 Standard jobs, and Standard
  batch generation on the intended preset voice instead of falling into a
  generic clone-style request that strips the speaker label.
- Changed long-audio joins from per-chunk fade-out plus added silence to a
  short PCM crossfade join with no default inserted silence. This reduces the
  audible "cut cut" boundary between chunks and keeps long-form speech softer
  and more continuous.
- Added non-secret tuning knobs to `.env.example`:
  `TTS_CHUNK_CROSSFADE_MS`, `TTS_PRESET_TEMPERATURE`, and
  `TTS_PRESET_CFG_VALUE`. Default chunk edge fade and join silence are now `0`
  so crossfade is the default smoothing behavior.
- Verification passed locally: `npx tsc --noEmit`, `npm run lint` with existing
  warnings only, `npm run build`, and the old reported bad MP3 still failed the
  quality smoke as expected because it contains a sustained high-ZCR noise
  block.
- Deployed to the fixer/staging VPS only as
  `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260612-5`. Production
  `https://voxtts.online` was not changed.
- Staging verification passed: `/api/health` 200, `/app/dashboard/jobs` 200,
  and `khmer-vox-web`, `khmer-vox-worker`, and `khmer-vox-postgres` were all
  ready 1/1.
- Real staging V2 Standard TTS smoke with escaped Khmer long text completed
  9/9 queued segments. The downloaded MP3 passed the audio quality gate:
  duration about 110.81s, mean volume about -18.8 dB, max volume about -3.8 dB,
  high-ZCR 0.2%, longest high-ZCR 0.25s, and longest low-level section 1.50s.
- Disposable staging smoke users/API keys were deleted after the test.

Follow-up on 2026-06-12:

- Investigated the recurring `Upstream generated near-silent audio` failure.
  Local stored evidence showed long dashboard jobs with 579-833 character
  items where VoxCPM2 repeatedly returned near-silent or invalid WAV output.
- Reduced queued dashboard and V2 async split defaults from 360 to 280
  characters to make Khmer long-form generation less likely to hit upstream
  failure cases.
- Added provider-level chunk controls:
  `TTS_UPSTREAM_CHUNK_CHARS` defaults to 320, and
  `TTS_NEAR_SILENCE_FALLBACK_CHARS` defaults to 180.
- `splitTextIntoChunks()` now trims empty chunks and enforces a hard maximum
  character limit on every output chunk, including Khmer text with few spaces.
- If a chunk still fails audio validation after normal retries, the provider
  now retries that exact chunk as smaller fallback chunks before failing the
  item. Retryable failures include near-silent audio, empty cleaned audio,
  invalid WAV output, and failed PCM normalization.
- Verified locally with `npx tsc --noEmit`, `npm run lint` with existing
  warnings only, and `npm run build`.
- Built and pushed `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260612-6`,
  imported it into the fixer/staging VPS container runtime, and rolled out web
  and worker there only. Production `https://voxtts.online` was not changed.
- Staging verification passed: `http://178.128.103.120/api/health` returned
  200, `http://178.128.103.120/app/dashboard/jobs` returned 200, and
  `khmer-vox-web`, `khmer-vox-worker`, and `khmer-vox-postgres` were all ready
  1/1.

Follow-up on 2026-06-12:

- Investigated `D:\ads testss\download (1).mp3`. The file was a valid,
  non-silent MP3, but it contained loud sustained tonal/vowel artifacts around
  9.75-16.5s and 117.5-121.75s, which sounded like stuck speech instead of
  natural talking.
- Added generated-audio quality detection for sustained stuck tonal sections in
  `lib/tts-provider.ts`. Generated WAV chunks and final audio are now rejected
  if they contain a long steady tonal section or too much stuck-tonal audio, so
  the existing retry/fallback split path can regenerate the bad section instead
  of saving it to the final MP3.
- Added non-secret tuning knobs to `.env.example`:
  `TTS_AUDIO_TONAL_GROUP_SECONDS`, `TTS_AUDIO_TONAL_MIN_DB`,
  `TTS_AUDIO_TONAL_MAX_ENVELOPE_CV`, `TTS_AUDIO_TONAL_MIN_AVG_ZCR`,
  `TTS_AUDIO_TONAL_MIN_PEAK_ZCR`, `TTS_AUDIO_MAX_STEADY_TONAL_SECONDS`, and
  `TTS_AUDIO_MAX_STEADY_TONAL_RATIO`.
- Updated `scripts/audio-file-quality-check.mjs` to report stuck-tonal ratio
  and longest stuck-tonal section. The reported bad MP3 now fails with a 6.00s
  stuck-tonal section, while known cleaner comparison MP3s still pass.
- Verification passed locally: `npx tsc --noEmit`, `npm run lint` with existing
  warnings only, `npm run build`, and focused audio quality checks against the
  reported bad and known cleaner MP3 files.
- Built and pushed `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260612-7`,
  imported it into the fixer/staging VPS container runtime, and rolled out web
  and worker there only. Production `https://voxtts.online` was not changed.
- Staging verification passed: `http://178.128.103.120/api/health` returned
  200, `http://178.128.103.120/app/dashboard/jobs` returned 200, and the
  fixer/staging web and worker deployments were both running
  `staging-20260612-7`.

Follow-up on 2026-06-12:

- Investigated repeated staging history failures showing
  `Upstream generated near-silent audio`. The latest failed `generations`
  rows were not real text failures: they had `input_chars = 1` and
  `input_preview = "។"`, so the dashboard splitter had created standalone
  punctuation-only TTS items. VoxCPM2 returned no speech for those items.
- Added `hasSpeakableText()` in `lib/speech-text-sanitizer.ts`; text that
  contains only punctuation/symbols now normalizes to empty text before
  dashboard, batch, or API generation can queue it.
- Hardened `splitTextIntoChunks()` in `lib/tts-provider.ts` so final
  punctuation-only fragments are attached back to the previous spoken chunk
  when they are just a tiny overflow, or dropped instead of sent to VoxCPM2.
  The Khmer sentence splitter now uses explicit `\u17d4` matching for the
  Khmer full stop.
- Verified locally: Unicode-regex smoke for Khmer speakable text and Khmer
  full-stop splitting, `npx tsc --noEmit`, `npm run lint` with existing
  warnings only, and `npm run build`.
- Built and pushed `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260612-8`,
  imported it into the fixer/staging VPS container runtime, and rolled out web
  and worker there only. Production `https://voxtts.online` was not changed.
- Staging verification passed: `http://178.128.103.120/api/health` returned
  200, `http://178.128.103.120/app/dashboard/jobs` returned 200, and
  `khmer-vox-web` plus `khmer-vox-worker` were both running
  `staging-20260612-8`. The old red punctuation-only history rows remain in
  the staging database because they were created before this fix.

Follow-up on 2026-06-12:

- Investigated a new fixer/staging dashboard failure where a completed
  Standard TTS job failed at final delivery with
  `Audio segment 9 failed quality validation: contains a sustained stuck tonal
  section (4.0s)`.
- The latest staging job was already marked completed with all 15 items
  successful. Segment 9 in the error was the 1-based delivery index for
  `item_index = 8`, a 243-character, 16-second MP3 segment. A focused local
  quality check against the extracted MP3 still detected a 3.75-second stuck
  tonal section.
- Reduced provider-level default chunk sizes so long Khmer text is less likely
  to hit VoxCPM2 stuck-tone and near-silent failure modes:
  `TTS_UPSTREAM_CHUNK_CHARS` now defaults to 180 and
  `TTS_NEAR_SILENCE_FALLBACK_CHARS` now defaults to 120.
- New generated chunks now pass a public MP3 round-trip validation before they
  are accepted. This catches cases where the raw generated WAV looked usable
  but the public MP3 would later be rejected by delivery validation.
- Completed, already-stored audio segments with only a short stuck-tonal warning
  are now served as delivery warnings instead of turning a completed dashboard
  or V2 audio job into a 500 error. Severe issues such as empty audio, long
  silence, high-frequency noise, and longer stuck tonal sections still fail.
- Added non-secret tuning knobs to `.env.example`:
  `TTS_AUDIO_DELIVERY_MAX_STEADY_TONAL_SECONDS` and
  `TTS_VALIDATE_PUBLIC_MP3_ROUNDTRIP`.
- Verification passed locally: `npx tsc --noEmit`, `npm run lint` with existing
  warnings only, `npm run build`, Docker build, Docker push, and a focused
  provider merge test using the extracted failing segment. The strict
  standalone audio quality checker still fails the extracted segment as
  expected, while the delivery merge path now returns MP3 and logs a warning.
- Deployed to the fixer/staging VPS only as
  `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260612-9`. Production
  `https://voxtts.online` was not changed.
- Staging verification passed: `http://178.128.103.120/api/health` returned
  200, `http://178.128.103.120/app/dashboard/jobs` returned 200, and
  `khmer-vox-web` plus `khmer-vox-worker` were both running
  `staging-20260612-9`.

## Recent Near-Silent Retry And Delivery Trust Fix

Update on 2026-06-12:

- Addressed the recurring dashboard failure
  `Upstream generated near-silent audio...` and the download-time failure
  `Audio segment N failed quality validation: contains a sustained stuck
  tonal section`.
- Root cause 1 (sticky retries): near-silence retries re-sent the identical
  payload (same text, same fixed temperature, same endpoint) to a stochastic
  model, so a failing generation tended to reproduce the same near-silent
  result. `lib/tts-provider.ts` now raises sampling temperature on each
  quality retry (`TTS_RETRY_TEMPERATURE_STEP`, default 0.15 per attempt,
  capped by `TTS_RETRY_TEMPERATURE_MAX`, default 0.9) for both preset and
  clone modes so retries explore a different model trajectory.
- Root cause 2 (validate-twice): merged downloads re-validated stored
  MP3 segments after an MP3->PCM re-decode, which can flip a borderline
  verdict and block audio the user already paid for. Delivery paths
  (`mergePublicMp3SegmentsForDelivery`, `cleanPublicMp3ForDelivery`) now
  follow "validate at write time, trust at read time": stored segments are
  cleaned, joined, and mastered, with quality issues logged as warnings but
  never rejected. Quality gates remain fully enforced at synthesis time.
  Removed the now-unused `shouldIgnoreStoredSegmentQualityIssue` partial
  exception.
- Confirmed the local upstream pool currently contains only ONE Modal
  endpoint, so endpoint failover cannot help during upstream blips. Adding a
  second Modal account to the pool remains the biggest reliability lever.
- Added `.env.example` knobs: `TTS_RETRY_TEMPERATURE_STEP` and
  `TTS_RETRY_TEMPERATURE_MAX`.
- Verification passed locally: `npx tsc --noEmit`, `npm run lint` (0 errors,
  65 pre-existing warnings), and `npm run build`.
- This fix is local-only and was not deployed to staging or production.

## Recent Recursive Small-Chunk Repair Fix

Update on 2026-06-12:

- Added a recursive small-chunk fallback in `lib/tts-provider.ts` for the
  recurring `Upstream generated near-silent audio...` failure. If a chunk still
  fails quality validation after normal retries, it now splits smaller again
  instead of stopping when the chunk is already under
  `TTS_NEAR_SILENCE_FALLBACK_CHARS`.
- This directly targets the observed failure pattern where VoxCPM2 could still
  return near-silent, empty, or stuck-tonal output for small 80-120 character
  Khmer chunks. The fallback now keeps reducing stubborn chunks down to the
  `TTS_NEAR_SILENCE_MIN_FALLBACK_CHARS` floor, default `24`, before allowing
  the item-level worker retry to take over.
- Added non-secret `.env.example` knob
  `TTS_NEAR_SILENCE_MIN_FALLBACK_CHARS`. Smaller values are more aggressive
  and can sound choppier; larger values preserve smoother phrase context but
  may fail more often on bad upstream chunks.
- Verification passed locally: `npx tsc --noEmit`, `npm run lint` with existing
  warnings only, and `npm run build`. Focused quality-smoke checks still reject
  the known bad MP3 samples, as expected, so the generated-audio quality gate
  was not weakened.
- Built and pushed
  `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260612-10`, pulled it into the
  fixer/staging K3s runtime, and rolled out both `khmer-vox-web` and
  `khmer-vox-worker`.
- Staging verification passed: `http://178.128.103.120/api/health` returned
  200, `http://178.128.103.120/app/dashboard/jobs` returned 200, both
  deployments were ready 1/1 on tag `staging-20260612-10`, and the new pods
  had zero restarts with clean startup logs.
- Production `https://voxtts.online` was not changed. A real long-text
  generation should now be tested on the fixer/staging dashboard to confirm
  the recursive repair against live VoxCPM2 output.

## Recent Public MP3 Fidelity Fix

Update on 2026-06-13:

- Investigated a complaint that long-text generated audio sounds low quality
  compared to other TTS platforms. Analyzed `D:\ads testss\download (2).mp3`:
  it passed all quality gates (not silent, no noise, no stuck tones) but the
  fidelity was poor. Root causes were all in the public MP3 mastering/encode
  chain, not the model failing.
- Key bug: the delivered MP3 was `48000 Hz @ 96 kb/s` even though the VoxCPM2
  pipeline is canonical 24 kHz mono. `loudnorm`'s internal 192 kHz processing
  rate was leaking into the encoder, so FFmpeg resampled up to 48 kHz and spent
  the low 96k bitrate describing an empty 12-24 kHz band with no real audio.
- Fixes in `lib/tts-provider.ts` `encodeWavToMp3`:
  - Default MP3 bitrate raised 96k -> 160k (`TTS_PUBLIC_MP3_BITRATE`).
  - Output sample rate is now pinned to the source WAV rate with `-ar`, so the
    MP3 stays at the real 24 kHz instead of upsampling to 48 kHz.
  - Final mastering EQ is now configurable: `TTS_PUBLIC_HIGHPASS_HZ` (70) and
    `TTS_PUBLIC_LOWPASS_HZ` raised 13500 -> 16000 for less muffled output.
  - Loudness is now two-pass `loudnorm` by default (`TTS_TWO_PASS_LOUDNORM`):
    measure real loudness first, then apply clean linear gain, avoiding the
    single-pass pumping artifact. Targets are `TTS_LOUDNORM_I/TP/LRA`.
  - Setting the legacy `TTS_PUBLIC_AUDIO_FILTER` still fully overrides the new
    chain (single-pass behavior), so existing deployments are unchanged.
- `concatPcm16WavBuffers` now loudness-matches independently-generated chunks to
  the median segment RMS before joining (`TTS_CHUNK_LOUDNESS_MATCH`, capped by
  `TTS_CHUNK_LOUDNESS_MAX_GAIN_DB`, default 3 dB). This reduces the "uneven"
  drift between segments in long-form audio.
- Honest ceiling: VoxCPM2 appears to be ~24 kHz native, so the model itself
  caps fidelity below 44.1 kHz platforms like ElevenLabs. These changes stop the
  pipeline from degrading the audio further; they do not raise the model ceiling.
  The upstream `/info` probe returned HTTP 403 with the current pool token, so
  the exact native sample rate was inferred from the delivered audio (24 kHz
  pipeline) rather than confirmed from the model. Confirm before any future
  attempt to raise `TTS_CANONICAL_SAMPLE_RATE`.
- Verified locally: a re-encode test of the reported file produced
  `24000 Hz @ 160 kb/s` (was 48000 Hz @ 96 kb/s) and still passed the audio
  quality checker. `npx tsc --noEmit`, `npm run lint` (0 errors, 65 pre-existing
  warnings), and `npm run build` all passed. Temporary scratch probe/test
  scripts were removed after use.
- Added `.env.example` knobs: `TTS_PUBLIC_MP3_BITRATE`, `TTS_PUBLIC_HIGHPASS_HZ`,
  `TTS_PUBLIC_LOWPASS_HZ`, `TTS_LOUDNORM_I/TP/LRA`, `TTS_TWO_PASS_LOUDNORM`,
  `TTS_CHUNK_LOUDNESS_MATCH`, `TTS_CHUNK_LOUDNESS_MAX_GAIN_DB`.
- This fidelity fix is local-only and was not deployed.

## Recent Long-Audio Merge Smoothing Fix

Update on 2026-06-13:

- User reported merged long audio sounds "cut cut" / not smooth at chunk joins.
  Root causes: aggressive edge trimming (-46 dB cut natural speech decay), zero
  join silence (sentences glued together), and a confused merge path that both
  overlap-crossfaded AND inserted silence (the crossfade consumed the start of
  the next sentence, then a gap, then the sentence resumed mid-onset).
- Changes in `lib/tts-provider.ts`:
  - Edge trim threshold default `-46` -> `-52` dB (`TTS_AUDIO_EDGE_TRIM_DB`), so
    only deeper silence is trimmed and natural decay/breath is kept.
  - Chunk paddings raised: `TTS_CHUNK_START_PADDING_MS` 20 -> 35,
    `TTS_CHUNK_END_PADDING_MS` 60 -> 110.
  - `concatPcm16WavBuffers` join logic rewritten (`joinSegments`): two clean,
    mutually exclusive modes. Pause mode (default, `TTS_CHUNK_JOIN_SILENCE_MS`
    0 -> 130 ms) keeps each sentence whole, inserts a natural pause, and applies
    a tiny declick fade (`TTS_CHUNK_JOIN_DECLICK_MS`, 6 ms) at boundaries.
    Gapless mode (join silence set to 0) does the overlap equal-power crossfade,
    default length raised 28 -> 45 ms (`TTS_CHUNK_CROSSFADE_MS`).
- Verified: `npx tsc --noEmit` and `npm run build` pass. A scratch end-to-end
  test through the real exported `mergePublicMp3SegmentsForDelivery` path
  merged two tone MP3s into exactly seg1+seg2+130 ms (diff 0.07 s, within MP3
  framing slack) with no errors; scratch files were removed after use.
- `.env.example` updated with the new defaults and `TTS_CHUNK_JOIN_DECLICK_MS`.
- This smoothing fix is local-only and was not deployed.

## Recent Adaptive Seam Join Fix

Update on 2026-06-13:

- Refined the long-audio merge path again to reduce the "cut" feeling at
  chunk boundaries without reintroducing glued-together speech.
- `lib/tts-provider.ts` now chooses the join style from the audio itself:
  - quiet-to-quiet edges get a short natural pause with a directional fade
    only on the active seam;
  - audible edges are overlap-crossfaded instead of forcing silence.
- The previous pause-mode fade had been applied to both ends of the accumulated
  buffer on every append; that was too blunt for long-form narration. It now
  fades only the side currently entering the seam.
- New non-secret tuning knobs were added to `.env.example`:
  `TTS_CHUNK_JOIN_EDGE_WINDOW_MS` and `TTS_CHUNK_JOIN_QUIET_DB`.
- Join defaults were tightened for smoother speech:
  `TTS_CHUNK_JOIN_SILENCE_MS` now defaults to 70 ms and
  `TTS_CHUNK_JOIN_DECLICK_MS` to 10 ms.
- Verification passed locally: `npx tsc --noEmit`, `npm run lint` with the
  existing 65 warnings only, and `npm run build`.
- Built and pushed
  `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260613-3`, imported it into
  the fixer/staging K3s runtime, and rolled out both `khmer-vox-web` and
  `khmer-vox-worker`.
- Fixer verification passed: `http://178.128.103.120:30080/api/health` and
  `http://178.128.103.120:30080/app/dashboard/jobs` returned 200, both
  deployments were ready 1/1 on `staging-20260613-3`, pods had zero restarts,
  and the worker could reach `http://web:3000/api/health`.
- Production `https://voxtts.online` was not changed.

## Recent Cursor Fixer VPS Redeploy

Update on 2026-06-13:

- Redeployed the current local worktree, including the latest Cursor audio
  fidelity and long-audio merge smoothing changes, to the fixer/staging VPS
  only.
- Verification passed before deployment: `npm run lint` completed with 65
  existing warnings and no errors, `npx tsc --noEmit` passed, and
  `npm run build` passed.
- Built and pushed
  `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260613-1`, loaded it into the
  fixer K3s runtime, and rolled out both `khmer-vox-web` and
  `khmer-vox-worker`.
- Staging verification passed: `http://178.128.103.120/api/health` and
  `http://178.128.103.120/app/dashboard/jobs` returned 200, web and worker
  were ready 1/1 on the new image, all pods had zero restarts, and startup
  logs were clean.
- Production `https://voxtts.online` was not changed.

## Recent Stuck-Tonal Gate Fix (buzzing long audio)

Update on 2026-06-13:

- User reported `D:\ads testss\download (3).mp3` (generated on staging
  `staging-20260613-1`, which already includes the fidelity and smoothing
  fixes) still sounds bad. The file was 24 kHz @ 160 kbps with natural join
  pauses, so the encode/merge fixes were live and working. Spectrogram
  analysis showed the real problem: 15 short "stuck vowel" buzz sections
  (sustained flat harmonic bands, 1.0-1.75s each, ~19s total of 180s),
  heavily clustered in the first 26 seconds. This is the model generating
  degenerate audio, not a mastering problem.
- Root cause the gate missed them: two compounding issues in
  `getSteadyTonalStats` / `generatedAudioQualityIssue` in `lib/tts-provider.ts`:
  1. Duration under-count bug: `longestSeconds` counted consecutive group
     starts only, under-reporting every burst by ~0.75s (groupSeconds minus
     windowSeconds). A real ~3.25s buzz reported as 2.5s and passed.
  2. Thresholds too loose for this failure shape: bursts are 1-2s each, but
     rejection required >2.5s reported (so >3.25s real).
- Fixes (local-only, not deployed):
  - Corrected the burst duration math in `lib/tts-provider.ts` and mirrored it
    in `scripts/audio-file-quality-check.mjs` so reported seconds are real
    seconds.
  - Tightened defaults: `TTS_AUDIO_MAX_STEADY_TONAL_SECONDS` 2.5 -> 1.5,
    `TTS_AUDIO_MAX_STEADY_TONAL_RATIO` 0.25 -> 0.12. Chunks with buzz now get
    rejected and regenerated through the existing retry path (temperature
    escalation, endpoint cooldown, fallback split) instead of being saved.
- Verified: the bad `download (3).mp3` now FAILS the checker (1.75s
  stuck-tonal burst detected), known-bad `download.mp3` and
  `download (1).mp3` still fail for their original reasons, and the clean
  `download (2).reencoded.mp3` comparison still passes (longest burst exactly
  1.50s, at the limit). `npx tsc --noEmit` and `npm run build` pass.
- Watch after deploy: if retry rates or generation failures rise noticeably,
  the 1.5s threshold may be too tight for natural drawn Khmer vowels; raise
  `TTS_AUDIO_MAX_STEADY_TONAL_SECONDS` toward 2.0 via env instead of
  reverting the duration-math fix.

## Recent Stuck-Tonal Fixer VPS Redeploy

Update on 2026-06-13:

- Redeployed the current Cursor worktree, including the corrected stuck-tonal
  duration calculation and stricter buzzing-audio rejection defaults, to the
  fixer/staging VPS only.
- Verification passed before deployment: `npm run lint` completed with 65
  existing warnings and no errors, `npx tsc --noEmit` passed, and
  `npm run build` passed.
- Built and pushed
  `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260613-2`, loaded it into the
  fixer K3s runtime, and rolled out both `khmer-vox-web` and
  `khmer-vox-worker`.
- Staging verification passed: `http://178.128.103.120/api/health` and
  `http://178.128.103.120/app/dashboard/jobs` returned 200, both deployments
  were ready 1/1 on the new image, and all pods had zero restarts.
- The worker logged one connection refusal while the new web pod was still
  starting. A direct worker-pod request to `http://web:3000/api/health`
  subsequently returned 200, confirming internal connectivity recovered.
- Production `https://voxtts.online` was not changed.

## Recent Fixer VPS Production-Image Rollback

Update on 2026-06-13:

- User reported the fixer/staging audio quality was still worse than the
  production site and asked to redeploy the fixer VPS from the production
  source/image baseline.
- Production was inspected without printing secrets. The running production
  image was
  `ghcr.io/rosielreaksa/khmer-vox-tts@sha256:763044856ea0ad634bd6f6ae0ae4cbbeaa46296ac6a9f98e0fe2940a9185fc49`.
- Directly setting the fixer deployments to that digest initially failed with
  `ImagePullBackOff` because the fixer node could not pull that GHCR digest
  (`403 Forbidden` from GHCR token fetch).
- To keep the fixer on the exact production baseline, exported that image from
  the production node's local K3s/containerd image store, transferred it to the
  fixer node, imported it into the fixer K3s/containerd store, deleted the
  failed new pods, and let the rollout continue.
- Verification passed on fixer: `khmer-vox-web` and `khmer-vox-worker` rolled
  out successfully, both are ready 1/1 with zero restarts, web logs show
  Next.js ready, worker logs show the loop started, and the worker can reach
  `http://web:3000/api/health` with HTTP 200.
- Public fixer checks passed with HTTPS: `https://178.128.103.120/api/health`
  and `https://178.128.103.120/app/dashboard/jobs` returned 200 with `-k`.
  Plain HTTP dashboard routes redirect to HTTPS on this production image.
- Production `https://voxtts.online` was not changed.

## Recent Fixer VPS HTTP Test Proxy

Update on 2026-06-13:

- After rolling the fixer VPS back to the production image, the browser showed
  a certificate privacy error on `https://178.128.103.120/app/dashboard`.
  Root cause: the production image's older proxy code still forces external
  HTTP dashboard traffic to HTTPS, and the fixer IP does not have a trusted
  certificate.
- Added a fixer-only Kubernetes Nginx proxy named `fixer-http-proxy` on
  NodePort `30080`. It forwards to the existing `web` service, sends
  `X-Forwarded-Proto: https` to prevent the old app proxy from redirecting,
  hides HSTS, and strips `Secure` from cookies so browser login works over
  HTTP on the test IP.
- Removed the earlier raw `web-direct-http` NodePort service because direct
  traffic still redirected.
- Verification passed: `http://178.128.103.120:30080/api/health`,
  `http://178.128.103.120:30080/app/signin`, and
  `http://178.128.103.120:30080/app/dashboard` return 200 without HTTPS
  certificate warnings.
- Follow-up fix: dashboard generation POSTs initially failed with
  `CSRF validation failed: invalid origin` because the Nginx proxy passed
  `Host` using its internal port while the browser `Origin` used the external
  `:30080` port. Updated the proxy to preserve `$http_host` for `Host` and
  `X-Forwarded-Host`, restarted it, and verified a POST to `/api/generate`
  with `Origin: http://178.128.103.120:30080` no longer fails CSRF. The test
  returned `401 Unauthorized`, which is expected without a browser session.
- This proxy is for the fixer VPS only. Production `https://voxtts.online` was
  not changed.

## Recent Raw VoxCPM2 Audio Path Restore

Update on 2026-06-13:

- User reported that the added audio cleanup/mastering/silence-repair pipeline
  made generated audio sound worse than the original VoxCPM2 output.
- Restored the active generation path in `lib/tts-provider.ts` to preserve
  upstream VoxCPM2 audio: each segment is converted to MP3 only when the
  upstream returns WAV, and MP3 segments are joined without extra EQ,
  loud-normalization, silence trimming, recursive near-silence repair, or PCM
  remastering.
- Updated dashboard, v2 async API, and provider chunking defaults to target
  about 60 seconds of audio per generated segment instead of the previous
  tiny 180/280-character chunks. Legacy `*_CHUNK_CHARS` overrides below 600
  characters are ignored so old local or VPS env values do not force tiny
  chunks.
- Updated `.env.example` to document the raw MP3 delivery behavior and the new
  one-minute chunk target variables. No secrets were added.
- Verification passed before deployment: `npm run lint` completed with
  warnings only, `npx tsc --noEmit` passed, `npm run build` passed, Docker
  build passed, and the image was pushed as
  `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260613-4`.
- Deployed to the fixer/staging VPS only. `khmer-vox-web` and
  `khmer-vox-worker` are ready 1/1 on `staging-20260613-4`; public checks on
  `http://178.128.103.120:30080/api/health` and
  `http://178.128.103.120:30080/app/dashboard/jobs` returned 200; the worker
  can reach `http://web:3000/api/health` with HTTP 200.
- Production `https://voxtts.online` was not changed.

## Recent Silent Output Guard Restore

Update on 2026-06-13:

- After restoring raw VoxCPM2 output, a dashboard generation could complete
  successfully while the saved MP3 was silent because the active path bypassed
  the old near-silence retry guard.
- Added a narrow raw-output silence guard in `lib/tts-provider.ts`: generated
  chunks are decoded only for analysis, retried when they are near-silent or
  empty, and returned unchanged when they pass. This avoids saving silent MP3
  results while still avoiding EQ, loud-normalization, trimming, and mastering.
- The active long-form path now calls the silence-guarded chunk synthesizer
  before converting/joining MP3 segments.
- Verification passed: `npm run lint` completed with warnings only,
  `npx tsc --noEmit` passed, `npm run build` passed, Docker build passed, and
  the image was pushed as
  `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260613-5`.
- Deployed to the fixer/staging VPS only. `khmer-vox-web` and
  `khmer-vox-worker` are ready 1/1 on `staging-20260613-5`; public checks on
  `http://178.128.103.120:30080/api/health` and
  `http://178.128.103.120:30080/app/dashboard/jobs` returned 200; the worker
  can reach `http://web:3000/api/health` with HTTP 200.
- Production `https://voxtts.online` was not changed.

## Recent Loudnorm/EQ Dead-Code Cleanup

Update on 2026-06-13:

- After the raw VoxCPM2 path was restored (above), the two-pass loudnorm/EQ
  helpers in `lib/tts-provider.ts` were left defined but never called:
  `measureLoudnorm`, `readLoudnormTargets`, `readPublicEqFilter`,
  `runFfmpegCollectStderr` (only used by `measureLoudnorm`), the
  `LoudnormTargets` type, and the unused `DEFAULT_PUBLIC_AUDIO_FILTER`
  constant. `encodeWavToMp3` already does a plain WAV->MP3 encode at
  `TTS_PUBLIC_MP3_BITRATE` (160k) with no EQ, no loudnorm, and no resample, so
  delivered audio is the model's native 48 kHz at its natural (quiet ~-29 LUFS)
  level by design.
- Context: user confirmed they want the original VoxCPM2 audio with no
  mastering. `download (5).mp3` from staging :30080 measured 48 kHz / 160 kbps,
  0.0% stuck-tonal (buzzing gate working), -29.7 LUFS (raw model loudness).
  Quietness is expected raw-output behavior, not a bug.
- Removed only the confirmed-unused symbols; verified each had no remaining
  callers before deletion. Still-used helpers (`readPublicMp3Bitrate`,
  `readAudioFilter`, `audioFilterArgs`, `runFfmpeg`,
  `DEFAULT_REFERENCE_AUDIO_FILTER` for the reference-encode path) were kept.
- `.env.example` already documents raw delivery and no longer lists the
  loudnorm/highpass/lowpass knobs; no further env changes were needed.
- Verified: `npx tsc --noEmit` and `npm run build` pass, no lint errors in the
  edited file. This cleanup is local-only and not deployed; it is behavior-
  neutral (removes dead code only) so it can ride the next deploy.
- If louder output is ever wanted without changing tone, apply a single linear
  gain (volume only, no EQ/compression) rather than re-adding the loudnorm
  chain.

## Recent Loudnorm-Cleanup Fixer VPS Deploy

Update on 2026-06-13:

- Deployed the current Cursor worktree (raw VoxCPM2 path plus the loudnorm/EQ
  dead-code cleanup) to the fixer/staging VPS only as
  `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260613-6`. Production
  `https://voxtts.online` was not touched.
- Deploy method (Windows host, no Docker on VPS, password SSH):
  - `npx tsc --noEmit` and `npm run build` passed before building.
  - Built the amd64/linux image locally with Docker Desktop, `docker save` to a
    tar, uploaded via SFTP (paramiko), imported with `k3s ctr images import`,
    then `kubectl -n khmer-vox set image` on web and worker.
  - SSH uses `scripts/vps-ssh.py` (paramiko). It reads `VPS_HOST`/`VPS_USER`/
    `VPS_PASS` from env so no credentials are written into the repo. The VPS
    root password is NOT stored anywhere in the project; it is passed inline at
    invocation time only.
  - Both deployments already had `imagePullPolicy: IfNotPresent`, so the
    locally-imported tag is used without a registry pull (GHCR pull creds were
    rejected for staging tags in earlier sessions).
- Verified after rollout: `khmer-vox-web` and `khmer-vox-worker` ready 1/1 on
  `staging-20260613-6` with zero restarts, worker loop started clean,
  `http://178.128.103.120:30080/api/health` returned 200 with `store: postgres`,
  and `/app/dashboard/jobs` and `/app/signin` returned 200.
- Cleaned up the uploaded tar and rollout script on the VPS and the local tar
  after deploy.
- Staging now serves raw VoxCPM2 audio (48 kHz, 160 kbps MP3, no EQ/loudnorm)
  with the corrected stuck-tonal buzzing gate active. These changes remain
  uncommitted in the local worktree (git still at `a2bf891`).

## Recent Long-Audio Volume Drift Fix (chunk leveling)

Update on 2026-06-13:

- User reported long generated audio drifts in volume over time (e.g. first
  ~1 minute loud, later quieter) and wants one consistent volume across the
  whole file, short or long, while keeping raw VoxCPM2 sound (no mastering).
- Root cause: `synthesizeWithUpstream` in `lib/tts-provider.ts` splits text
  into ~60s chunks, generates each independently, then byte-concatenates the
  per-chunk MP3s with NO loudness alignment. VoxCPM2 returns each chunk at a
  slightly different level, so the level steps between chunks. The existing
  loudness-match code (`concatPcm16WavBuffers`, `TTS_CHUNK_LOUDNESS_MATCH`) was
  dead code never reached by the live path.
- Fix (volume-only, no EQ/tone change): added `estimateWavSpeechRms` and
  `levelWavChunksToCommonLoudness` in `lib/tts-provider.ts`. Before encoding,
  each raw WAV chunk's spoken RMS is measured (50 ms windows, pauses below
  `TTS_CHUNK_LEVEL_FLOOR_DB` excluded), then aligned to the median chunk level
  with a capped linear gain (`TTS_CHUNK_LEVEL_MAX_GAIN_DB`, default +/-6 dB).
  Wired into `synthesizeWithUpstream` so the live dashboard/API long-audio path
  uses it. Single-chunk and non-WAV audio pass through unchanged.
- New env knobs documented in `.env.example`: `TTS_CHUNK_LEVEL_MATCH` (default
  true), `TTS_CHUNK_LEVEL_MAX_GAIN_DB` (6), `TTS_CHUNK_LEVEL_FLOOR_DB` (-45).
- Verified: a standalone algorithm test with 3 chunks at -14.2/-20.3/-26.5 dB
  collapsed the spread from 12.24 dB to 0.24 dB after leveling. `npx tsc
  --noEmit` and `npm run build` pass; no lint errors. Scratch test removed.
- Note: this only equalizes volume between chunks; it does not raise overall
  loudness (still raw ~-29 LUFS by design). The V2/batch merged-download path
  joins separately-stored per-item MP3s and is unchanged; if those ever drift,
  the same leveling would need a PCM/MP3-decode step there too.
- Local-only; not yet built/deployed.

## Recent Volume-Leveling Fixer VPS Deploy

Update on 2026-06-13:

- Deployed the long-audio volume-drift fix (per-chunk linear-gain leveling) to
  the fixer/staging VPS as
  `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260613-7`. Production
  `https://voxtts.online` was not touched.
- Same method as staging-20260613-6: `tsc`+`build` passed, built amd64 image
  with Docker Desktop (had to start the daemon first), `docker save` to tar,
  SFTP upload via `scripts/vps-ssh.py`, `k3s ctr images import`, then
  `kubectl set image` on web and worker. Both `imagePullPolicy: IfNotPresent`.
- Connectivity note: SSH/SFTP to the VPS (port 22) was intermittently timing
  out during this session even though TCP 22 tested open and the app on :30080
  stayed up. Hardened `scripts/vps-ssh.py` with longer timeouts
  (timeout/banner/auth 45s) and up to 6 connect retries with backoff; the
  upload and rollout succeeded after automatic retries. Also fixed a Windows
  cp1252 console crash by writing remote output as UTF-8 bytes.
- Verified after rollout: web and worker ready 1/1 on `staging-20260613-7`,
  zero restarts, worker loop started clean, web pod logs show Next.js ready.
  `http://178.128.103.120:30080/api/health` returned 200. Page routes
  (`/app/signin`, `/app/dashboard/jobs`) returned 000 from the local machine
  (flaky external network path) but 200 when tested from INSIDE the VPS via
  localhost, confirming the app itself is healthy.
- Cleaned up the uploaded tar + rollout script on the VPS and the local tar.
- Changes remain uncommitted in the local worktree (git still at `a2bf891`).

## Recent Output Loudness Normalization (too-quiet fix)

Update on 2026-06-13:

- User reported delivered audio is too quiet and still fades quieter toward the
  end of long files. Measured `voxtts-tts-400c2098...mp3` (generated on
  staging-20260613-7): whole file -29.4 LUFS (raw VoxCPM2 level), and per-15s
  speech level was ~-26 to -28 dB for the first ~2 min then dropped to -33 to
  -36 dB in the final ~55s. The end-fade is a gradient INSIDE the final chunk,
  which per-chunk leveling cannot smooth.
- User explicitly chose full loudness normalization (over keep-raw). This is the
  one intentional volume stage; still volume-only (no EQ/tone shaping).
- Implemented `normalizeOutputLoudness` in `lib/tts-provider.ts`: two-pass
  ffmpeg `loudnorm` (measure, then apply with measured values + `linear=true`
  and a true-peak limiter) on the fully merged MP3, re-encoded at
  `TTS_PUBLIC_MP3_BITRATE`. Re-added `runFfmpegCollectStderr` for pass 1.
  Wired into both delivery paths: `synthesizeWithUpstream` (live) and
  `mergePublicMp3SegmentsForDelivery` (V2/batch download). Fails safe: any error
  returns the un-normalized audio rather than failing delivery.
- New env knobs (defaults): `TTS_OUTPUT_LOUDNORM=true`, `TTS_OUTPUT_LOUDNORM_I=-16`,
  `TTS_OUTPUT_LOUDNORM_TP=-1.5`, `TTS_OUTPUT_LOUDNORM_LRA=11`.
- Verified on the real problem file: -29.4 -> -16.5 LUFS, true peak -1.9 dBTP
  (no clipping); the quiet tail rose ~14 dB (from -33/-36 to -19/-20 dB) and the
  start-to-end spread tightened from ~10 dB to 7.75 dB. To flatten the end
  further, lower `TTS_OUTPUT_LOUDNORM_LRA` toward 6 (tradeoff: less natural
  dynamics). `npx tsc --noEmit` and `npm run build` pass; scratch tests removed.
- Local-only at time of writing; deploy as staging-20260613-8.

## Recent Buzz Gate Not Wired Into Retry Path (root-cause fix)

Update on 2026-06-13:

- User reported `download (6).mp3` (generated on staging-20260613-8) still
  buzzes. Measured: loudness is now great (-16.8 LUFS, LRA 4.4 - the output
  loudnorm fix works), 48 kHz/160 kbps, BUT the quality checker FAILS it with a
  12.25s longest stuck-tonal section. Located the buzz: ~11 stuck-tonal bursts
  (1-2.5s each) clustered in the final ~50s (104-151s), i.e. the last chunk
  degenerating.
- ROOT CAUSE (the real system bug): the in-generation retry loop
  `synthesizeChunkWithSilenceRetry` called `analyzeRawGeneratedAudioSilence`,
  which only ran `generatedAudioSilenceIssue` (silence checks). The buzzing /
  stuck-tonal / noise checks lived in a SEPARATE function
  `generatedAudioQualityIssue` that the retry path never called. So the buzz
  gate only ran AFTER delivery (post-hoc validation) and never triggered a
  regenerate. Buzzing chunks passed all 3 attempts and were delivered.
- FIX (`lib/tts-provider.ts`): extracted `generatedAudioStatsIssue(stats)` (the
  full gate: silence + sustained noise + stuck-tonal, stats-based) and made BOTH
  `generatedAudioQualityIssue` (post-decode) and the retry-path
  `analyzeRawGeneratedAudioSilence` call it. Now a buzzing chunk fails analysis
  during generation and is regenerated with temperature escalation
  (`retryAdjustedTemperature`), then fallback-split if still bad - using the
  existing retry machinery. Updated the stale "only analyzes silence" comment.
- Verified: `npx tsc --noEmit` and `npm run build` pass; no lint errors.
- Local-only; NOT yet deployed. NOTE: deploy is currently blocked - the VPS
  port 30080 is unreachable from the internet (DigitalOcean cloud firewall;
  app itself is healthy, SSH on 22 works). User is restoring the inbound 30080
  rule in the DO panel. Deploy this as staging-20260613-9 once 30080 is back.

## Buzz Gate Fix Deployed (staging-20260613-9)

Update on 2026-06-13:

- Deployed the buzz-gate retry fix (the `generatedAudioStatsIssue` refactor that
  wires stuck-tonal/noise detection into the in-generation retry path) to the
  fixer/staging VPS as `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260613-9`.
  Production `voxtts.online` not touched. The DigitalOcean firewall on port
  30080 was restored by the user, so external access works again.
- Connectivity was very flaky this session: a 200MB SFTP upload died mid-stream
  at 70% (EOFError). Hardened `scripts/vps-ssh.py` `put()` to be RESUMABLE -
  it reconnects on drops and continues appending from the remote file's current
  size (up to 40 attempts), and verifies final size == source size. The upload
  then completed by resuming from ~141MB. This resumable helper is the standard
  way to deploy now given the unstable link.
- Verified after rollout: web + worker ready 1/1 on staging-20260613-9, zero
  restarts; internal signin 200 and health ok; EXTERNAL
  `http://178.128.103.120:30080/api/health` returns 200 (store: postgres).
- Cleaned up local tar, remote tar, and remote rollout script.
- Changes remain uncommitted in the local worktree (git still at `a2bf891`).
- TEST NEEDED: generate a long Khmer audio on :30080 and confirm no buzzing
  (the gate should now regenerate buzzing chunks during synthesis).

## Choppy "cut cut" Pauses Fix (capLongPauses)

Update on 2026-06-13:

- User reported `download (7).mp3` (staging-20260613-9) sounds like "cut cut"
  speech with gaps at spaces/symbols. Loudness/buzz were fine (-16.5 LUFS, gate
  only flagged a 2.0s tonal). silencedetect revealed the real cause: VoxCPM2
  inserts 1.5-2s DEAD-AIR pauses every few seconds at spaces/punctuation. Normal
  pauses are 0.2-0.5s; these long ones = the choppy feel.
- Same dead-code pattern as before: the silence-removal filter
  (`DEFAULT_GENERATED_*_SILENCE_FILTER`, `cleanGeneratedAudioToWav`) existed but
  was ONLY used by the post-hoc validator, never applied to delivered audio.
- FIX: added `capLongPauses(bytes)` in `lib/tts-provider.ts`, wired into BOTH
  delivery paths (synthesizeWithUpstream + mergePublicMp3SegmentsForDelivery)
  right before `normalizeOutputLoudness`. First tried ffmpeg
  `silenceremove stop_silence` but it left inconsistent ~1.16s residual gaps
  (known ffmpeg quirk). Replaced with a DETERMINISTIC PCM capper: decode merged
  audio to mono PCM16, find quiet runs (20ms windows below
  TTS_OUTPUT_PAUSE_THRESHOLD_DB=-45) longer than TTS_OUTPUT_MAX_PAUSE_SECONDS
  (0.7s), keep only TTS_OUTPUT_KEEP_PAUSE_SECONDS (0.4s) of each, re-encode.
  Speech samples untouched; fails safe (returns original on any error).
- Verified on the real file: 41 pauses capped, 205.2s -> 164.4s, ZERO remaining
  gaps >0.7s. `npx tsc --noEmit` + `npm run build` pass; scratch tests removed.
- New env knobs in .env.example: TTS_OUTPUT_PAUSE_CAP=true,
  TTS_OUTPUT_MAX_PAUSE_SECONDS=0.7, TTS_OUTPUT_KEEP_PAUSE_SECONDS=0.4,
  TTS_OUTPUT_PAUSE_THRESHOLD_DB=-45.
- Local-only; deploy as staging-20260613-10. NOTE: VPS link is flaky - use the
  resumable `scripts/vps-ssh.py` upload.

## Voice Clone Broken: Consent Flag Not Forwarded (fix)

Update on 2026-06-14:

- User reported dashboard voice cloning not working; screenshot showed red
  banner "Voice clone consent is required before uploading a reference voice"
  even though the "I own this voice" box was checked and the checklist showed
  "Permission Confirmed".
- ROOT CAUSE: that exact error string lives only in `lib/batch-service.ts:309`,
  thrown when `cloneConsentAccepted` is falsy for clone mode. Dashboard clone
  now runs as a queued job: `app/api/generate-clone/route.ts` validated consent
  itself (isVoiceCloneConsentAccepted at the API layer) but then called
  `createQueuedDashboardGeneration(...)` WITHOUT passing `cloneConsentAccepted`.
  It arrived as `undefined` at createQueuedBatchJob -> batch-service, which
  always threw. So every dashboard clone failed regardless of the checkbox.
- FIX (`app/api/generate-clone/route.ts`): track `cloneConsentAccepted` (true
  for uploaded files that pass the consent check, and true for saved voices
  which captured consent at save time) and forward it into
  `createQueuedDashboardGeneration`. `generation-queue.ts` and batch-service
  already thread the flag through; other clone routes (v1/v2 batch, batch-clone,
  v2 clone jobs) already pass true. The TTS route `app/api/generate/route.ts`
  doesn't need it (consent only checked for clone mode).
- Separately noted in web logs: clone chunks often come back near-silent from
  upstream on attempt 1 and get regenerated (attempt 1/3) - they recover, no
  final rejections seen, so that's the retry path working, not a failure. Left
  as-is for now.
- Verified: `npx tsc --noEmit` + `npm run build` pass; no lint errors.
- Local-only; deploy as staging-20260613-11 (use resumable vps-ssh.py upload;
  VPS link still flaky).

## API Tested End-to-End + Final-Merged Buzz Safeguard

Update on 2026-06-14:

- Tested both public APIs for real on staging (:30080) by seeding two ISOLATED
  throwaway users directly in Postgres (ids prefixed `apitest-`, 500k tokens
  each): one with an approved paid order (normal/Standard API access) and one
  with an approved business_api_requests row (Business API + limits). Generated
  the API keys locally (sha256 hash inserted; raw keys never stored). ALL test
  fixtures were deleted afterward via cascade `delete from users where id like
  'apitest-%'` (verified 0 remaining); temp SQL/scripts removed from pod+host.
- RESULTS: Normal v1 sync `POST /api/v1/audio/speech` => 200, audio/mpeg, 14
  credits charged, balance decremented, clean audio (-17.1 LUFS, PASS, longest
  tonal 1.0s). Business v2 async `POST /api/v2/audio/jobs` => 202, split into 3
  items, worker(HTTP)->web pipeline completed 3/3, 41 credits, downloadable via
  audio_url. BUT merged output had a 4.25s BUZZ (stuck-tonal) that slipped the
  gate. Loudness/pauses fine.
- ROOT CAUSE of the escaped buzz: the per-chunk gate (`generatedAudioStatsIssue`
  / `getSteadyTonalStats`) analyzes RAW upstream audio. Its tonal RMS floor is
  TTS_AUDIO_TONAL_MIN_DB=-22dB, but VoxCPM2 raw output is ~-29 LUFS (quiet), so
  a low-level buzz sits below the floor and isn't classified as tonal -> passes.
  Then `normalizeOutputLoudness` lifts the delivered file to ~-16 LUFS (~+13dB),
  amplifying that buzz into an audible 4.25s tone. Detection loudness != delivery
  loudness, so the buzz hid in the gap. (Worker logs only showed SILENCE retries,
  no tonal rejections, confirming the tonal gate never fired for this audio.)
- FIX (`lib/tts-provider.ts`): split body into `synthesizeMergedAudio()` and
  wrapped it in `synthesizeWithUpstream()` with a bounded FINAL-QUALITY retry.
  New `analyzeDeliveredAudio()` decodes the final delivered MP3 back to PCM and
  runs the SAME `generatedAudioStatsIssue` gate at DELIVERY loudness. If the
  delivered audio still buzzes, regenerate the whole synthesis up to
  TTS_FINAL_QUALITY_RETRIES (default 1 => 2 total attempts), keeping the
  least-buzzy attempt on exhaustion (never hard-fails an otherwise-good request,
  never fails delivery over its own analysis). Verified the discriminator is
  safe: the clean normal file measured 1.0s tonal (< 1.5s threshold) so it would
  NOT trigger a needless regen, while the 4.25s buzz does.
- Verified: `npx tsc --noEmit` + `npm run build` pass, no lint errors.
- Local-only; NOT yet deployed. Next deploy tag staging-20260613-12 (resumable
  vps-ssh.py upload; VPS link still flaky). Still 6 uncommitted fixes in git
  (worktree at a2bf891) + this 7th.

## SIGNUP FIX 2026-06-14: bcrypt cost 12->10 (staging-tested)

Acted on the load-test finding that signup was the bottleneck. Careful,
backward-compatible fix.

Change (`lib/security.ts`): made the bcrypt work factor env-configurable via
`BCRYPT_COST` (clamped 4..15), default lowered 12 -> 10. Cost 10 is ~4x cheaper
CPU per hash than 12, still industry-standard. Only affects NEWLY created
hashes; `bcrypt.compare` reads cost from each stored hash, so existing users
(hashed at 12) keep working. Verified on staging: signup ok, signin with correct
pw ok, wrong pw -> 401.

Deliberately did NOT switch to native `bcrypt`/`argon2` yet: the Dockerfile
hand-copies `pg` + deps into the Next standalone runner, signalling native
runtime modules are risky to bundle here. Cost reduction is the low-risk win
first.

Deploy mechanics (staging only): built+pushed
`ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260614-1`
(digest sha256:f0feefbbccc8d294d13fd42ff5a5ffde19a6654ec8ea96dc7bfc382e71bb6882).
Staging K3s still gets GHCR 403 on pull, so saved image to tar, uploaded via
scripts/vps-ssh.py, imported with `ctr -n k8s.io images import`, set
`BCRYPT_COST=10` env, rollout restart. pullPolicy IfNotPresent. 0 restarts.

Load test before/after (same web ramp 10->150 VUs, staging NodePort, per-VU
spoofed XFF):
- BEFORE (cost 12): signup_ok 62.6%, signup median ~39.7s, p95 60s (timeouts).
- AFTER (cost 10): signup_ok 100% (2348/2348), signup median 9.64s, p95 30s,
  http_req_failed 0%, page_ok 100%. Big improvement, no failures/timeouts.
- Still elevated under sustained 150 VUS (median ~10s) because bcryptjs is
  pure-JS/event-loop-blocking on 2 cores. Further wins would need native bcrypt
  / argon2 / worker-thread hashing and/or more CPU + web replicas.

Staging fully cleaned up (NodePort removed, image tar deleted local+remote).
NOT deployed to production yet — awaiting user decision. Prod still on
prod-20260614-16. `lib/security.ts` change is uncommitted in git with the rest
of the day's work. New helper scripts: scripts/loadtest.js, smoke-staging.sh,
verify-auth.sh.

## LOAD TEST 2026-06-14: 100-user staging stress test

User asked whether the system breaks under ~100 simultaneous users creating
accounts + generating audio. Ran a controlled k6 load test against the ISOLATED
fixer/staging VPS (178.128.103.120, 2 vCPU / 4 GiB + 4 GiB swap, no real users)
to avoid risking production. k6 ran from the prod VPS (same SG region).

Setup notes (all reverted after):
- Temporarily pointed staging TTS at the production Modal pool (staging's pool
  was a placeholder `[]`). REVERTED to `[]` after the test.
- Created a temporary NodePort `web-loadtest` (32371) so per-VU
  `X-Forwarded-For` reached Next.js directly. Traefik strips spoofed XFF, so
  via the normal ingress the middleware limiter (proxy.ts isRateLimited, 120
  req/min/IP) counted all load-gen traffic as ONE IP. NodePort DELETED after.
- Test scripts: `scripts/loadtest.js` (k6), `scripts/smoke-staging.sh`. CSRF
  seeded from uncached `/app/signin` (the `/signup` path is 404; real route is
  `/app/signin`; `/api/health` skips CSRF; `/` is a cached prerender).

Results:
- Web/render tier (GET /app/signin, /app/dashboard, /app/dashboard/history):
  100% OK (page_ok 2066/2066) even ramping to 150 concurrent VUs. Scales fine.
- Signup (POST /api/auth/signup) is the BOTTLENECK. Web ramp: only 62.6% ok,
  median signup 39.7s, p90/p95 = 60s timeout. e2e 100-user burst: 86% ok,
  median 52s.
- ROOT CAUSE: `lib/security.ts` `hashPassword` uses `bcryptjs` (pure-JS,
  event-loop-blocking) at cost factor 12 (~300-500ms CPU/hash on this box).
  Concurrent signups serialize on 2 cores and blow past the 60s request
  timeout. NOT a crash — 0 pod restarts, memory steady ~170Mi, node CPU was
  not even maxed in the snapshot (work was bursty/serialized in-process).
- e2e generation: of 100 jobs, enqueue was 100% ok (queue accepts work fine),
  but only 10 completed within the ~6m window; 76 failed/timed out. job_e2e
  for the ones that finished: avg 209s, min 116s, max 307s. This is the Modal
  GPU pool (3 endpoints) being the throughput ceiling + cold starts, plus
  per-user dashboard concurrency limit (dashboardTts maxConcurrent 2) and a
  single worker replica. Single-job baseline earlier was ~108s (cold start).

Recommendations (not yet implemented):
1. Replace `bcryptjs` with native `bcrypt` OR `argon2`, and/or lower cost to
   10, and/or run hashing in a worker thread. Biggest single win for signup.
2. Add HorizontalPodAutoscaler / more web replicas; current prod is 2 web
   replicas on a 2-core node — CPU-bound auth will serialize.
3. Scale the worker + Modal capacity (more warm containers / keep_warm) if real
   concurrent generation demand approaches dozens; current realistic
   throughput is a few concurrent generations, others queue 2-5 min.
4. Consider raising the 60s request timeout for /api/auth/signup or making
   signup hashing non-blocking.

NOTE: This is local/ops testing only — no app code changed yet. Staging fully
reverted (NodePort removed, TTS pool back to placeholder, 0 restarts). Prod
untouched throughout. Earlier UI/OG/favicon prod deploys this day remain
uncommitted in git.

## PROD DEPLOY 2026-06-14: prod-20260614-16 (link-preview / Open Graph)

User asked why pasting the site link in Telegram/Facebook/X shows just the bare
URL while sites like itch.io show a rich card. Cause: the site exposed only
`<title>` + `<meta name=description>` and NO Open Graph / Twitter tags and no
preview image, so platforms had nothing to build a card from.

Fix:
- `app/layout.tsx` metadata: added `metadataBase`
  (`https://voxtts.online`), `applicationName`, full `openGraph` (type,
  siteName, url, title, description) and `twitter`
  (`card: summary_large_image`, title, description) blocks.
- `app/opengraph-image.tsx`: new auto-generated 1200x630 PNG via `next/og`
  `ImageResponse` (Next 16). Neo-brutalist brand card: yellow logo tile with the
  two-stroke "V" mark, "KHMER VOX TTS" + voxtts.online, big "KHMER TEXT TO
  SPEECH API" headline, yellow tagline chip, and a yellow/green equalizer bar.
  Next auto-attaches this as og:image + twitter:image site-wide.
- Satori gotcha hit + fixed: any element with >1 child needs explicit
  `display:flex`; the headline originally used a `<br/>` between text nodes and
  failed prerender. Split into two stacked `display:flex` divs.

Shipped as `ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260614-16`
(digest `sha256:87e0924b620807708b55aa634de0760976c39812b754d39001927260444988e8`),
rollback target `prod-20260614-15`. Verified: lint clean, build OK
(`/opengraph-image` static route), rollout healthy, `/api/health` 200,
`https://voxtts.online/opengraph-image` returns 200 `image/png`, and homepage
HTML contains og:image/og:title/og:description/og:url/twitter:card/twitter:image.
All 3 app pods on new tag.

NOTE for user: Telegram/Facebook/X cache link previews aggressively. Existing
pasted links may still show the old bare preview until the cache expires; use
each platform's debugger to force a refresh (FB Sharing Debugger; for Telegram,
message @WebpageBot with the URL). Still uncommitted in git (same batch).

## PROD DEPLOY 2026-06-14: prod-20260614-15 (brand favicon)

The site had NO favicon, so browsers showed the generic gray globe in the tab,
bookmarks, and search results. Added a brand favicon.

`app/layout.tsx` metadata only set title/description and there was no
`favicon.ico` / `app/icon.*` anywhere (public/ only had Next default svgs).

Fix: added `app/icon.svg` (Next.js App Router auto-detects it and injects
`<link rel="icon">` site-wide; build now emits the `/icon.svg` route). Design
matches the existing brand mark from `app/app/dashboard/shell.tsx` `LogoIcon`:
the stylized two-stroke "V" (dark `#1a1a1a` + green `#10b981`) on a brand-yellow
`#ffcc00` rounded tile with a thick dark border (neo-brutalist style).

Shipped as `ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260614-15`
(digest `sha256:9c91e7950ac178559a836028dd87bef1de93dd4eb62e65b788180cc8af2bc5d7`),
rollback target `prod-20260614-14`. Verified: lint clean, build OK (`/icon.svg`
route generated), rollout healthy, `/api/health` 200, `https://voxtts.online/icon.svg`
returns 200 `image/svg+xml`, all 3 app pods on new tag. Still uncommitted in git.

## PROD DEPLOY 2026-06-14: prod-20260614-14 (nested hard-shadow alignment)

Fixed the broken/doubled-border look in the Audio Result panel at the narrow
(~300px) sidebar width. Cause: deeply nested neo-brutalist hard-shadow boxes all
casting the same down-right offset shadow competed with each other — outer
`aside` (border-4 + 6px shadow) > green result box (border-4 + 4px shadow) >
`WaveformPlayer` (border-4 + 4px shadow) > download button (border-4). The
stacked offsets collided, producing the detached bottom line + double-border
artifacts at bottom/right.

Fix (`app/app/dashboard/speech-workspace.tsx`) — establish a clear shadow
hierarchy so only the outer card has the heavy shadow and inner boxes step down:
- Green result container: padding `p-5`->`p-4`, shadow `4px`->`2px`.
- `WaveformPlayer`: border `4`->`2`, padding `p-3 sm:p-4`->`p-3`, shadow
  `4px`->`2px`.
- Download button: border `4`->`2` (shadow already 2px).

Shipped as `ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260614-14`
(digest `sha256:0531c50b21a359be39318a2d4ab671205a75c2bd2c524e41cecb247f59e5b12c`),
rollback target `prod-20260614-13`. Verified: lint clean, build OK, rollout
healthy, `/api/health` 200, `/app/dashboard` 200, all 3 app pods on new tag
(old -13 web pod finished terminating shortly after). Still uncommitted in git.

## PROD DEPLOY 2026-06-14: prod-20260614-13 (time readout overlap fix)

The prod-20260614-12 absolute-centered time readout overlapped the restart
button in the narrow sidebar column (the `0:00` collided with the restart icon).

Fix (`app/app/dashboard/speech-workspace.tsx`, `WaveformPlayer` controls row):
reverted the absolute centering. Row is now a simple
`flex items-center justify-between gap-2` with four in-flow items: play (10x10),
restart (10x10, widened from w-9 for symmetry), the time readout as its own
non-overlapping flex item, and the speed chip (10x10). `justify-between`
distributes them evenly so nothing overlaps in the narrow column.

Shipped as `ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260614-13`
(digest `sha256:70aedaa8dec0054579aa0c3dfd484ebe670d05d36c82971601e3e60d2604482e`),
rollback target `prod-20260614-12`. Verified: lint clean, build OK, rollout
healthy, `/api/health` 200, `/app/dashboard` 200, all 3 app pods on new tag.
Still uncommitted in git (same batch).

## PROD DEPLOY 2026-06-14: prod-20260614-12 (centered time readout)

The `0:00 / 0:04` time readout in the player control row sat right-of-center.
Cause: it used `flex-1 justify-center`, which centers within the LEFTOVER space
between the left cluster (play + restart, ~80px wide) and the right cluster
(speed chip, ~40px). Since the left cluster is wider, the leftover-space center
is pushed right of the bar's true center.

Fix (`app/app/dashboard/speech-workspace.tsx`, `WaveformPlayer` controls row):
made the row `relative justify-between`, grouped play+restart in a left flex
div and the speed chip on the right, and positioned the time readout
`absolute left-1/2 -translate-x-1/2` (with `-translate-y-1/2 top-1/2`,
`pointer-events-none`) so it's dead-center relative to the whole bar regardless
of the differing left/right cluster widths.

Shipped as `ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260614-12`
(digest `sha256:0a16f2f703c8633be545701c647e960b1a77dd943c1d28f6b9d8dd5de05be804`),
rollback target `prod-20260614-11`. Verified: lint clean, build OK, rollout
healthy, `/api/health` 200, `/app/dashboard` 200, all 3 app pods on new tag.
Still uncommitted in git (same batch).

## PROD DEPLOY 2026-06-14: prod-20260614-11 (brighter idle waveform)

The waveform looked empty/dull at rest (0:00 before playing) because unplayed
bars used `#4a4a4a`, too close to the `#1a1a1a` panel background. Brightened
unplayed bars to `#8a8577` (warm gray) so the full waveform shape is clearly
visible before/while playing; played bars stay brand-yellow `#ffcc00`.

Single-line change in `app/app/dashboard/speech-workspace.tsx` (`WaveformPlayer`
unplayed bar color). Shipped as
`ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260614-11`
(digest `sha256:a589b5076acf26fbcfbc39be58510848edcd693e8a5dcb09eeeaaa441603316a`),
rollback target `prod-20260614-10`. Verified: lint clean, build OK, rollout
healthy, `/api/health` 200, `/app/dashboard` 200, all 3 app pods on new tag.
GHCR push hit one transient EOF and succeeded on retry. Still uncommitted in git.

## PROD DEPLOY 2026-06-14: prod-20260614-10 (playhead containment / clean panel)

Polish fix for the waveform panel: near the end of playback the white playhead
line + its single diamond cap pushed into the top-right corner and poked
outside the panel, making the Audio Result box look misaligned/"not centered".

Fix (`app/app/dashboard/speech-workspace.tsx`, `WaveformPlayer`):
- Playhead vertical span changed from `top-1 bottom-1` to `top-0 bottom-0` and
  the cap moved INSIDE the panel (a small diamond at top and bottom, `top-1` /
  `bottom-1`) instead of a single cap at `-top-1` (which sat above the border).
- Playhead horizontal position clamped to `1.5%..98.5%` (was `..99.5%`) so the
  line never collides with the rounded border corners.
- Bars: `self-center`, height factor 92% (was 100%) with min 8% so the
  waveform is vertically centered with clean top/bottom padding and never
  touches the panel edges.
- Panel horizontal padding `px-1.5` -> `px-2` for symmetric insets.

Shipped as `ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260614-10`
(digest `sha256:ac243a6057a36ce9bb04b17868dfa4bfc37702924ccefd6283f25c35df74a854`),
rollback target `prod-20260614-9`. Verified: lint clean, `npm run build` OK,
rollout healthy, `/api/health` 200, `/app/dashboard` 200, all 3 app pods
(web x2 + worker) confirmed on the new tag (the old -9 web pod finished
terminating shortly after). Still uncommitted in git (same batch).

## PROD DEPLOY 2026-06-14: prod-20260614-9 (smooth playhead motion)

Fixed: the waveform playhead/progress line moved in jerky ~0.25s steps and
looked "stuck" while playing. Cause: the player updated `currentTime` only from
the HTMLAudioElement `timeupdate` event, which browsers fire ~4 times/second.

Fix (`app/app/dashboard/speech-workspace.tsx`, `WaveformPlayer`): added a
`requestAnimationFrame` loop that runs while `playing` and reads
`audio.currentTime` each frame (~60fps), so the playhead/played-bars animate
smoothly. The rAF loop is cancelled on pause/unmount and skips updates while
the user is actively scrubbing (so seek stays authoritative). `timeupdate` is
still wired as a fallback.

Shipped as `ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260614-9`
(digest `sha256:5cb8171ef90b58b0717096aa775725b3af64f3516b548cc92cfe5928e160f8ac`),
rollback target `prod-20260614-8`. Verified: lint clean, `npm run build` OK,
rollout healthy (web x2 + worker on new tag), `/api/health` 200,
`/app/dashboard` 200. Still uncommitted in git (same batch).

NOTE: during this deploy Docker Desktop's Linux engine had stopped (npipe
dockerDesktopLinuxEngine not found); relaunched `Docker Desktop.exe` and waited
for `docker info` to succeed before building. No code impact.

## PROD DEPLOY 2026-06-14: prod-20260614-8 (resume generating after refresh)

Fixed: dashboard "generating audio" state was lost on page refresh/navigation
even though the background worker job kept running, so users saw an empty page
while work continued invisibly. Applies to both standard and clone pages.

Root cause (`app/app/dashboard/speech-workspace.tsx`): generation state lived
only in an in-memory module object (`workspaceSnapshots`) and the polling loop
ran inside `onGenerate`. A refresh tears down the React tree + module state, so
the in-flight `jobId` and the poll loop were lost; the queued job on the worker
was unaffected and finished in the background with nothing watching.

Fix:
- Persist the in-flight queued `jobId` to `localStorage`
  (`voxtts:activeJob:<mode>`) the moment a job is queued.
- Extracted the poll loop into a `pollQueuedJob(jobId)` `useCallback` shared by
  fresh generate and resume.
- Added a mount effect: if a stored jobId exists and there's no finished result,
  re-show the generating UI and resume polling to completion.
- Clear the stored jobId on completed/partial/failed/needs_review/404 and on
  poll errors. On client-side timeout the id is intentionally kept so a later
  refresh can still reconnect.

Shipped as `ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260614-8`
(digest `sha256:56fe95ff491978d10cb4fee108bfa23e6d4e2a36fb883b5e7248bd5411173bf8`),
rollback target `prod-20260614-7`. Verified: lint clean, `npm run build` OK,
rollout healthy (web x2 + worker on new tag), `/api/health` 200,
`/app/dashboard` 200. NOTE: only queued (background) generations persist across
refresh; a purely synchronous generation that hasn't been queued still can't be
resumed (no job id exists yet). Still uncommitted in git (same batch).

## PROD DEPLOY 2026-06-14: prod-20260614-6 (new generating/loading UI)

Redesigned the dashboard "generating audio" state (the old robot-mascot
`VoxLoader` block) into a modern TTS-style loader. Applies to both standard and
clone voice pages (shared `AudioResultPanel`).

Change (`app/app/dashboard/speech-workspace.tsx`):
- New `GeneratingState` component replaces the `VoxLoader` busy block.
- Animated 9-bar equalizer (CSS `@keyframes voxeq`, staggered delays) on a dark
  panel, brand-yellow bars.
- Parses the existing progress string ("Generating: Segment X of Y
  completed...") into a real progress bar + percentage + "Segment X of Y"
  label. Falls back to an indeterminate pulsing bar + "Warming up the voice
  engine..." when no segment data yet.
- Removed the now-unused `VoxLoader` import (component file left in place; not
  referenced here anymore).

Shipped as `ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260614-6`
(digest `sha256:ce0a26535ca10a8318b01641c0e6ca03343f14a894eda9db7e35aab75393d667`),
rollback target `prod-20260614-5`. Verified: lint clean, `npm run build` OK,
rollout healthy (web x2 + worker on new tag), `/api/health` 200,
`/app/dashboard` 200. Still uncommitted in git (same batch).

## PROD HOTFIX 2026-06-14: prod-20260614-5 (narrow-column waveform fix)

The prod-20260614-4 "responsive" attempt still looked broken in the dashboard's
narrow right sidebar (~230px): the waveform rendered as an empty black box and
the controls stacked across 3 rows.

Real root cause (not a breakpoint issue): the waveform used 120 bars each with
`w-full flex-1` plus 2px gaps. In a ~230px column the inter-bar gaps alone
(~240px) exceeded the container width, so every bar collapsed to ~0 width =
invisible. The control row also used `flex-wrap`, so it wrapped into 3 lines.

Fix (`app/app/dashboard/speech-workspace.tsx`):
- Bar count 120 -> 64; bars now `min-w-[1px] flex-1` with `gap-px` (1px) so they
  always have real width and fill any column.
- Waveform height simplified to `h-16 sm:h-20`.
- Controls are now a single non-wrapping row (removed `flex-wrap`): compact
  play (10x10), restart (h10/w9), inline plain-text time readout (no boxed
  pill), and a 10x10 speed chip. Fits the narrow sidebar without stacking.

Shipped as `ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260614-5`
(digest `sha256:95f94084ea2b2ca053e6d73d43ec41ef05d3ddd1d37400ebcc58eab4215753ec`),
rollback target `prod-20260614-4`. Verified: lint clean, `npm run build` OK,
rollout healthy (web x2 + worker on new tag), `/api/health` 200,
`/app/dashboard` 200. Applies to both standard and clone voice pages (shared
component). Still uncommitted in git (same batch).

## PROD HOTFIX 2026-06-14: prod-20260614-4 (responsive player fix)

Fixed the dashboard audio player layout break on narrow/mobile screens (affected
both standard voice and clone voice pages because both use
`AudioResultPanel` -> `WaveformPlayer` in
`app/app/dashboard/speech-workspace.tsx`).

Root issue: the redesigned player controls were too dense for small widths,
causing cramped/overflow-like behavior and poor readability.

Hotfix shipped as `ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260614-4`
(digest `sha256:27c676651be1603c8ba06acf7bf00a8171643a6d2ae84c5ed0c3d72ff0aac4a6`),
rollback target `prod-20260614-3`.

UI changes:
- Container padding scales by breakpoint (`p-3 sm:p-4`).
- Waveform height scales (`h-16 sm:h-20 md:h-24`) and tighter side padding on
  mobile.
- Controls row now wraps (`flex-wrap`) with better gaps.
- Play button scales down on small screens (`h/w 10` mobile, `12` desktop).
- Time readout moves to its own row on mobile (`basis-full`) and keeps inline
  on larger screens.
- Font/width tweaks for time and speed chip to prevent cramped layout.

Verification: local lint clean + `npm run build` success; production rollout
healthy (web + worker), `/api/health` 200 and `/app/dashboard` 200. Pods on
`prod-20260614-4` are running.

## PROD DEPLOY 2026-06-14: prod-20260614-3 (waveform player visual redesign)

Redesigned the dashboard `WaveformPlayer` (the prior prod-20260614-2 version
looked too plain/invisible: faint gray bars on cream). Deployed to prod as
`ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260614-3`
(digest sha256:4e9b39ad8a5f3c83d324ab8dbcb5e61f7751c2b0d8259167c28f5c87fa91cbb4).
Rollback target = `prod-20260614-2`.

Change (frontend only, `app/app/dashboard/speech-workspace.tsx`): dark
(`#1a1a1a`) waveform panel with 120 center-aligned bars, bright brand-yellow
(`#ffcc00`) played bars vs `#4a4a4a` unplayed (high contrast, clearly visible
at 0:00), a white glowing playhead with a diamond cap, an "Analyzing audio"
pulse state, a larger play/pause button, a new restart button, time pills
(current / total), and the speed toggle. Click/drag seek unchanged. No
backend/audio-pipeline change.

Verified: build OK (npm run build exit 0, no lint/TS errors), rollout healthy
(web x2 + worker), `/api/health` 200, `/app/dashboard` 200, all 3 app pods on
the new tag. Still uncommitted in git (same batch as before).

## PROD DEPLOY 2026-06-14: prod-20260614-2 (waveform audio player UI)

Deployed the rebuilt dashboard audio result player to prod (`voxtts.online`,
`152.42.203.77`, ns `khmer-vox`) as immutable tag
`ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260614-2`
(digest sha256:e839eb2591fba5f97c07f5c493bd72e1a4c09fa224979105aafb643903ec2542).
Rollback target = prior prod image `prod-20260614-1`.

Change (frontend only): `app/app/dashboard/speech-workspace.tsx` replaces the
plain `<audio controls>` with a custom `WaveformPlayer` (Web Audio API decode
-> 96 peak bars, click/drag seek, red playhead, play/pause, 0.75-1.5x speed,
time readout, synthetic-waveform fallback). No backend/audio-pipeline change.
The temperature env override (PRESET/CLONE 0.8) and 5k char limit from earlier
deploys are unaffected (env lives in the deployment spec; same code path).

Deploy steps: `docker build/push` the tag to GHCR, then over SSH
`kubectl -n khmer-vox set image` on web + worker and `rollout status` (both
healthy, zero downtime). Verified: `/api/health` 200, `/app/dashboard` 200,
all 3 app pods (web x2 + worker) running the new tag. Build passed locally
(`npm run build` exit 0, no lint/TS errors).

STILL UNCOMMITTED: git worktree carries this + the prior 7 fixes; the running
prod image is ahead of the committed tree. Recommend committing the batch.

## PROD FIX 2026-06-14: prod-20260614-1 (bearer failover + 5k char limit)

Two fixes deployed to prod (`voxtts.online`) as image
`ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260614-1` (digest 9c2161b5...).
Rollback target = prior prod image `prod-20260613-1`. Temp env (PRESET/CLONE
0.8) persists across the image change (it lives in the deployment spec).

1. Bearer-token failover (lib/tts-provider.ts synthesizeSingleChunk loop):
   - BUG: a 401/403 (and previously also 400/422) from ONE pool endpoint threw
     immediately with NO failover, so a single account's token hiccup surfaced
     to users as "FAILED: INVALID BEARER TOKEN" (seen in dashboard history img).
   - Root cause of the observed failure was transient (happened during the
     temp-fix rollout window; all 3 account tokens + single fallback verified
     200 afterward). But the no-failover behavior was a real weakness.
   - FIX: only 400/422 (payload errors) short-circuit now. 401/403/402/429/5xx
     disable that endpoint and fail over to the next pool account. Adjusted both
     the inner !response.ok block and the outer catch (avoid double-disable).

2. Dashboard TTS char limit 50,000 -> 5,000:
   - lib/usage-policy.ts: MAX_DASHBOARD_TTS_CHARS changed 50_000 -> 5_000.
     (MAX_TEXT_CHARS was already 5_000; MAX_BATCH_TOTAL_CHARS=50_000 is a
     separate batch-total cap, left unchanged.)
   - Affects dashboard generate route + speech-workspace UI counter + docs.

Verified live on voxtts.online: build OK, rollout OK (web x2 + worker healthy),
v1 sync generation 200 + clean audio (12 credits), docs now show "1 to 5,000
characters", and a 6,000-char request returns 400. Test user seeded + deleted,
all temp files removed (prod + local).

## PRODUCTION LAUNCH 2026-06-14: prod-20260613-1 deployed + temperature fix

Production (`voxtts.online`) is a SEPARATE server from staging:
- Prod: `152.42.203.77`, K3s ns `khmer-vox`, cert-manager TLS, web x2 + worker x1
  + postgres, pulls images from GHCR (`ghcr-secret`), ingress hosts
  `voxtts.online` + `www.voxtts.online`. Box: 2 vCPU / 4 GB (modest).
- Staging/fixer: `178.128.103.120`, NodePort 30080, imports images from local
  containerd. ALL earlier conversation work happened on STAGING only.
- NOTE: prod + staging currently share the same root password. Recommend
  rotating prod to a distinct secret post-launch.

What was deployed to prod:
- Built/verified image promoted to GHCR as immutable tag
  `ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260613-1` (digest 4e5fe590...),
  replacing the old floating `:latest`. Rollback target = prior live digest
  `sha256:763044856ea0...` (the old `:latest`).
- Rolled out to web + worker, zero downtime. Health/pages/auth/TLS all good.

CRITICAL prod-only bug found + fixed (temperature):
- After deploy, live audio generation FAILED: prod Modal returned near-silent
  audio (rms ~ -55 dB) and the delivery safeguard correctly rejected it
  (fail-closed -> user got UPSTREAM_ERROR).
- Root cause isolated by direct Modal probes (read-only, all 3 pool accounts
  reaksabbb3 / reaksa1234op / reaksaaaa4 return clean audio on basic requests):
  prod's VoxCPM model collapses toward SILENCE at low temperature. Bisect on
  the exact app payload: temp 0.45 -> ~-30 to -55 dB (silent), 0.7 -> -22 dB,
  1.0 -> -16 dB (clean). `max_generate_length` was innocent.
- Could NOT confirm why staging tolerates 0.45 but prod doesn't (all accounts'
  /info identical; model lib pinned nano-vllm-voxcpm==2.0.1). Did NOT redeploy
  Modal (would likely be a no-op + missing local token for reaksaaaa4).
- FIX (cheap, reversible, no rebuild): set prod env on web + worker
  `TTS_PRESET_TEMPERATURE=0.8` and `TTS_CLONE_TEMPERATURE=0.8` via
  `kubectl set env` + rollout. Previously unset (code defaults 0.45 / 0.55).
- VERIFIED end-to-end on live voxtts.online: v1 sync 200, 17 credits, audio
  PASS (-16.5 LUFS, no buzz, longest stuck-tonal 1.50s). Test user seeded +
  deleted, all temp files removed (prod box + local).

Launch status / still open:
- Prod audio now works for real users. Scaling/concurrency bumps were
  deliberately NOT applied (untested on the 2vCPU/4GB box). Payments were
  reported already live-tested; not re-tested (no real money spent).
- Consider: investigate the true staging-vs-prod Modal difference later;
  rotate prod root password; raise worker/batch/policy concurrency only after
  load-testing.

## staging-20260613-12 DEPLOYED + Buzz Safeguard VERIFIED via API

Update on 2026-06-14:

- Deployed the final-merged buzz safeguard as
  `ghmer... ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260613-12` to the
  fixer/staging VPS (web + worker, production untouched). Rollout healthy; the
  one-off SIGNIN 502 was just the new pod warming up (200 a few seconds later).
- RE-TESTED both public APIs end-to-end against :30080 with fresh isolated
  `apitest-` users (seeded in Postgres, deleted after via cascade; verified 0
  remaining; all temp SQL/scripts removed from pod/VPS/local):
  - Normal v1 sync `POST /api/v1/audio/speech`: 200, 23 credits charged, balance
    decremented, PASS (-16.5 LUFS, longest stuck-tonal 1.50s).
  - Business v2 async `POST /api/v2/audio/jobs`: queued -> 3 items -> completed
    3/3, 58 credits, 38s, downloaded merged MP3. PASS (-16.5 LUFS, longest
    stuck-tonal 1.50s, under the 1.5s gate). The 4.25s buzz from the previous
    build (staging-...-11) is GONE.
- PROOF the safeguard fired: web logs showed
  "[TTS] Delivered audio quality issue (contains a sustained stuck tonal section
  (2.0s)); regenerating whole synthesis attempt 1/2 ..." and another for
  "too much stuck tonal audio (17% of windows)". So the delivery-loudness
  re-check detected buzz on the merged output and regenerated, exactly as
  designed.
- Net: APIs work and buzz is fixed on the delivered audio. Tradeoff confirmed
  acceptable: buzzy generations cost ~1 extra full regen.
- STILL UNCOMMITTED: 7 fixes live as the staging image but git worktree remains
  at a2bf891. Recommend committing the batch.

## Next Priorities

1. Configure Spaces env vars locally and run a real upload/download smoke test.
2. Deploy and live-test the V2 async API endpoints with a real paid API key.
3. Add a scheduled webhook retry loop for failed API customer callbacks.
4. Finish and verify current uncommitted KHQRcc changes.
5. Improve batch history, per-line errors, downloads, and retries.
6. Add database and uploaded-audio backup/restore operations.
7. Polish business customer limits and launch review.
8. Expand clone/batch API examples with V2 async calls.
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
