# Khmer Vox TTS Project Memory

Last updated: 2026-06-21

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
- Public audio format: WAV only (PCM-16, mono, 24 kHz). Switched from MP3 on
  2026-06-20; see "Public Audio Format Switched From MP3 To WAV" below.

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
```

IMPORTANT: production runs **date-versioned tags** (e.g. `prod-20260616-4`),
NOT `:latest`, and both deployments use `imagePullPolicy: Always`. A plain
`kubectl rollout restart` only re-pulls the SAME tag (a no-op for new code), and
a `k3s ctr images import` alone is NOT enough because `Always` makes the kubelet
pull from GHCR regardless of the local containerd store. So the new tag MUST be
pushed to GHCR before `set image`, or pods go `ImagePullBackOff`.

Pick the next tag in sequence (check the current one first with
`kubectl -n khmer-vox get deployment khmer-vox-web -o wide`), then:

```powershell
$TAG = "prod-YYYYMMDD-N"
docker tag  ghcr.io/rosielreaksa/khmer-vox-tts:latest ghcr.io/rosielreaksa/khmer-vox-tts:$TAG
docker push ghcr.io/rosielreaksa/khmer-vox-tts:$TAG
```

There is no local kubectl context on the Windows host and no `~/.ssh/config`;
all cluster commands run over password SSH via `scripts/vps-ssh.py` (reads
`VPS_HOST`/`VPS_USER`/`VPS_PASS` from env; prod host is `152.42.203.77`). The
`k3s ctr images import` of a `docker save` tar is OPTIONAL belt-and-suspenders;
the GHCR push above is what actually makes the rollout succeed. Then:

```text
py -3 scripts/vps-ssh.py "kubectl -n khmer-vox set image deployment/khmer-vox-web web=ghcr.io/rosielreaksa/khmer-vox-tts:$TAG"
py -3 scripts/vps-ssh.py "kubectl -n khmer-vox set image deployment/khmer-vox-worker worker=ghcr.io/rosielreaksa/khmer-vox-tts:$TAG"
py -3 scripts/vps-ssh.py "kubectl -n khmer-vox rollout status deployment/khmer-vox-web --timeout=180s"
py -3 scripts/vps-ssh.py "kubectl -n khmer-vox rollout status deployment/khmer-vox-worker --timeout=180s"
```

If a pod is stuck in `ImagePullBackOff` after the GHCR push, delete it to force
an immediate re-pull instead of waiting out the backoff:
`kubectl -n khmer-vox delete pod <name>`. Old replicas keep serving throughout,
so a failed pull does not cause downtime.

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
- Generated public audio must remain WAV (PCM-16, mono, 24 kHz).
- Consistent business voices must require reference audio.
- Run lint, typecheck, and build before deployment.

## Website v2 build (2026-06-20 overnight, autonomous session)

User asked me to autonomously build a "v2" upgrade in a new folder while they
slept, prioritizing the speed problem we'd been diagnosing (Modal cold starts).

- Created `website-v2/` as a clean copy of the project root via robocopy.
  EXCLUDED secrets/state: `.env.backup`, the Google OAuth client_secret JSON,
  `data/`, all `*.log`, `node_modules`, `.next`, `.git`, all `test-output*`,
  scratch/artifacts dirs. v2 needs its own `.env` before it can run.
- Isolated v2 from the parent build: parent `tsconfig.json` now excludes
  `website-v2`; parent `.gitignore` ignores `website-v2/node_modules`, `.next`,
  `*.tsbuildinfo`, `test-output`. Parent (live) site is untouched and still
  builds. (These two parent-file edits are the ONLY changes outside website-v2.)
- `npm install` in website-v2: 433 packages, exit 0.
- SHIPPED in v2: on-demand Modal GPU pre-warming (the verifiable high-value win).
  New `lib/prewarm.ts` (server-only, fire-and-forget, globally throttled, pings
  upstream `/health` with bearer token to trigger GPU spin-up), new auth-gated
  `app/api/prewarm/route.ts`, and a client hook in
  `app/app/dashboard/speech-workspace.tsx` firing on workspace mount + textarea
  focus (covers BOTH tts and clone modes - same component). New optional env:
  `TTS_PREWARM_THROTTLE_MS` (60s), `TTS_PREWARM_TIMEOUT_MS` (4s).
- Verified v2: tsc 0 errors, eslint 0 errors (7 pre-existing warnings only),
  full `next build` exit 0. NO live generations run -> zero GPU/token spend.
- DELIBERATELY DEFERRED (documented in `website-v2/V2_UPGRADES.md`): per-chunk
  quality retry and ffmpeg pass-merge. Both are audio-quality changes that
  can't be validated without spending generation budget on A/B listening;
  doing them blind risks worse output. Also documented prod-cost levers
  (`min_containers=1`, higher batch concurrency, streaming response).
- Nothing committed, pushed, or deployed. Full writeup in
  `website-v2/V2_UPGRADES.md`.

## Website v2 — Session 2 full improvement pass (2026-06-20 → 06-21)

Follow-up to the v2 build. User asked to keep improving v2 with remaining
budget. Mapped the codebase with parallel explore agents, then shipped 5 batches
of safe, build-verified improvements (ALL inside `website-v2/`, parent untouched).
Every batch verified with tsc + lint; ends with clean `next build` (exit 0) and
`eslint .` = 0 errors (67 pre-existing warnings left alone). NO GPU/token spend.

- Batch 1 (SEO): new `lib/site-url.ts` (centralized canonical URL), `app/sitemap.ts`,
  `app/robots.ts`; upgraded root `app/layout.tsx` metadata (title template,
  keywords, canonical, robots/googleBot, OG locale); added per-page `metadata`
  to the 9 public pages that lacked it (docs, support, privacy, terms, payments,
  payment-guide, refund-policy, review). Build confirms `/sitemap.xml` + `/robots.txt`.
- Batch 2 (a11y + dead code): saved-voice-library modal got role="dialog",
  aria-modal, aria-labelledby, backdrop+Escape close, close-button aria-label;
  voice <select> aria-label; new-voice input htmlFor/id associations; result panel
  wrapped in aria-live="polite". Removed dead audioSpeed/audioPitch/audioVolume
  state + GenerationErrorResponse type in speech-workspace.tsx.
- Batch 3 (UX, real bug fix): progress text was overloaded onto the `error`
  field (would render under red "Needs attention"). Added dedicated `progress`
  field to WorkspaceSnapshot, routed all in-flight polling status through it,
  reserved `error` for real failures. Touched every commit site in pollQueuedJob
  + onGenerate + AudioResultPanel/GeneratingState.
- Batch 4 (error handling): stopped leaking raw error.message on 500 paths of
  batch/jobs/[id]/merged + merged/audio + v2/audio/jobs/[id]/audio routes; added
  console.error logging to admin/modal route catch blocks (kept admin-facing
  diagnostic text since admin-gated).
- Batch 5 (code quality): removed dead imports/params in app/docs/page.tsx;
  fixed 3 pre-existing lint ERRORS (any usages) in copied
  scripts/test-website-batch-clone-call.mts by typing responses + null-guard.

Still deferred (need GPU budget / cost decision): per-chunk retry, ffmpeg merge,
min_containers, batch concurrency, streaming. Full writeup appended to
`website-v2/V2_UPGRADES.md` (Session 2 section). Nothing committed/pushed/deployed.

## Website v2 — Session 3 (2026-06-21): boundaries, PWA, structured data

Continued v2 improvements (same discipline: useful, build-verified, low-risk;
NO GPU/token spend). Checked existing files first — error.tsx/not-found.tsx/
loading.tsx already existed, did NOT duplicate. Ends clean: tsc 0 errors,
`eslint .` 0 errors (warnings 67→65), `next build` exit 0.

- Rebranded off-brand `app/not-found.tsx` + `app/error.tsx` from soft-rounded
  design to the site's neo-brutalist system (thick #1a1a1a borders, hard
  shadows, #ffcc00 yellow, uppercase headline fonts) using globals.css tokens.
- New `app/global-error.tsx`: top-level boundary (own html/body, inline styles
  since globals.css may not load), brand palette, logs digest.
- New `app/manifest.ts`: PWA manifest (theme_color #ffcc00, /icon.svg as SVG
  any-size). Added `viewport` export in layout.tsx (themeColor + colorScheme).
  Build confirms /manifest.webmanifest.
- New `app/components/structured-data.tsx`: JSON-LD @graph (Organization +
  WebSite + SoftwareApplication w/ Offer) on home page via SITE_URL. Static,
  safe dangerouslySetInnerHTML.
- Conservative dead-code cleanup: removed BATCH_ITEM_DELAY_MS (batch-service.ts)
  + unused parseErr catch binding (modal-accounts.ts). LEFT `source` param of
  exported resolveGenerationCloneCreditRate (live billing call site) and
  tokenOutput in modal-deployer.ts (sensitive deploy infra) — risk > reward.

Session 3 writeup appended to website-v2/V2_UPGRADES.md. Nothing committed/
pushed/deployed.

## Website v2 — Session 9 (2026-06-21): skip-to-content link (WCAG 2.4.1)

Continued v2 (same discipline; NO GPU/token spend). tsc 0 errors, `eslint .`
0 errors (64 warnings), `next build` exit 0.

- Added keyboard skip-to-content link. Verified safety first: NavigationShell
  wraps children for every route (single reliable target), and its global click
  handler ignores `#`-prefixed hrefs (line ~215) so the skip anchor isn't
  hijacked by SPA nav.
- navigation-shell.tsx: `<a href="#main-content" class="skip-to-content-link">`
  as first focusable element; wrapper got `id="main-content" tabIndex={-1}`.
- globals.css: `.skip-to-content-link` off-screen until focus, slides in,
  neo-brutalist styled (yellow/hard border+shadow). `#main-content:focus`
  outline removed to avoid stray ring.

Session 9 writeup appended to website-v2/V2_UPGRADES.md. Nothing committed/
pushed/deployed.

## Website v2 — Session 8 (2026-06-21): finish public-page a11y pass

Continued v2 (same discipline; NO GPU/token spend). tsc 0 errors, `eslint .`
0 errors (64 warnings), `next build` exit 0.

- Completed public decorative-icon pass: aria-hidden on 6 icons across
  page.tsx (arrow_forward, description), docs/page.tsx (arrow_forward, info),
  payments + payment-guide (qr_code_2). All paired with visible text → truly
  decorative. Read each context before marking.
- Now every PUBLIC surface (home, header, docs, payments, payment-guide + 4
  auth forms) has clean icon semantics. Authenticated dashboard still
  intentionally deferred (behind login, per-icon judgment needed).

Session 8 writeup appended to website-v2/V2_UPGRADES.md. Nothing committed/
pushed/deployed.

## Website v2 — Session 7 (2026-06-21): a11y in high-traffic public components

Continued v2 (same discipline; NO GPU/token spend). tsc 0 errors, `eslint .`
0 errors (64 warnings, down from 65), `next build` exit 0.

- Scoped decorative-icon gap (material-symbols-outlined in 23 files); targeted
  only highest-traffic PUBLIC components, not a blind sweep.
- Real defect: icon-only play/pause button in home-playground.tsx had no
  accessible name. Added state-aware aria-label + aria-hidden on glyph. Marked
  other decorative icons in that file aria-hidden. Removed unused `e` catch
  binding (65 → 64 warnings).
- public-header.tsx: added aria-label to icon-only open/close menu buttons +
  aria-hidden on glyphs.
- Deliberately did NOT sweep authenticated dashboard components (billing,
  checkout, analytics) — behind login, lower traffic, need per-icon judgment.

Session 7 writeup appended to website-v2/V2_UPGRADES.md. Nothing committed/
pushed/deployed.

## Website v2 — Session 6 (2026-06-21): security headers review

Continued v2 (same discipline; NO GPU/token spend). tsc 0 errors, `eslint .`
0 errors (65 pre-existing warnings), `next build` exit 0.

- Checked `next.config.ts` first. Security headers already comprehensive:
  full CSP, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy,
  HSTS preload. Made NO redundant additions.
- One best-practice fix: changed `X-XSS-Protection` from `1; mode=block` to `0`
  per current OWASP guidance (legacy XSS auditor removed from modern browsers,
  can cause XS-Leaks in old ones; CSP is the real defense). Documented inline.

Session 6 writeup appended to website-v2/V2_UPGRADES.md. Nothing committed/
pushed/deployed.

## Website v2 — Session 5 (2026-06-21): sitemap audit + payment-proof noindex

Continued v2 (same discipline: useful, build-verified, low-risk; NO GPU/token
spend). Ends clean: tsc 0 errors, `eslint .` 0 errors (65 pre-existing warnings),
`next build` exit 0.

- Audited `app/sitemap.ts` against the actual filesystem (globbed every
  page.tsx). Already lists all 10 public marketing routes; `app/app/*` +
  `/payment-proof` correctly excluded. Made NO change — no busywork.
- Real finding: `/payment-proof` is disallowed in robots.txt (crawl), but that
  doesn't prevent indexing if the signed-token URL leaks externally. Added
  `export const metadata: Metadata = { robots: { index: false, follow: false } }`
  to `app/payment-proof/page.tsx` as defense-in-depth (emits noindex,nofollow).

Session 5 writeup appended to website-v2/V2_UPGRADES.md. Nothing committed/
pushed/deployed.

## Website v2 — Session 4 (2026-06-21): auth a11y + SEO consistency

Continued v2 improvements (same discipline: useful, build-verified, low-risk;
NO GPU/token spend). Read all 4 auth forms first to find real gaps. Ends clean:
tsc 0 errors, `eslint .` 0 errors (65 warnings, pre-existing), `next build` exit 0.

- Accessibility pass on signin/signup/forgot-password/reset-password forms:
  added `autoComplete` (email/current-password/new-password/name) where missing
  so password managers work; `role="alert"` on all error containers + `role=
  "status"` on success containers so screen readers announce them; `aria-busy`
  on all submit buttons; `aria-hidden="true"` on all decorative Material Symbols
  icons so they aren't read aloud as ligature text.
- SEO: `app/business/page.tsx` was the only static route missing
  `alternates.canonical`. Added `canonical: "/business"` + typed metadata as
  `Metadata` to match the other 8 routes.

Session 4 writeup appended to website-v2/V2_UPGRADES.md. Nothing committed/
pushed/deployed.

## Website v2 MERGED into main (2026-06-21) — single source of truth

The `website-v2/` sibling worktree (a robocopy snapshot of `4d68aed` plus all
the uncommitted Session 1-12 improvements on top) has been merged back into the
main tree and the v2 folder deleted. There is now ONE source of truth. The
`website-v2/*` references in the v2 session notes above are historical; those
files now live at the parent paths (e.g. `lib/prewarm.ts`, `app/sitemap.ts`).

- Commit: `59657c7` "feat: merge v2 improvements into main (prewarm, SEO,
  a11y, PWA, structured data, hardening)" — 67 files changed, +6657 / -4575.
- What shipped in the merge (all previously v2-only, now in main):
  - 8 NEW files: `lib/prewarm.ts`, `lib/site-url.ts`, `app/api/prewarm/route.ts`,
    `app/sitemap.ts`, `app/robots.ts`, `app/manifest.ts`, `app/global-error.tsx`,
    `app/components/structured-data.tsx`.
  - ~59 MODIFIED files: speech-workspace (progress field + prewarm hook + modal
    a11y + dead audio state removed), API error-sanitization on batch merged /
    merged/audio / v2 audio routes + admin/modal logging, per-page metadata +
    canonical on public pages, aria-hidden/aria-label a11y across public + auth
    components, next.config.ts (X-XSS-Protection 0 per OWASP, turbopack.root),
    lib/batch-service.ts (removed dead BATCH_ITEM_DELAY_MS), auth forms
    autoComplete/role=alert/aria-busy, global-error/error/not-found neo-brutalist
    restyle, skip-to-content link (WCAG 2.4.1) in navigation-shell.
  - `V2_UPGRADES.md` moved to repo root (kept as project history).
- Method: robocopy `/E` of v2's app/lib/scripts + root configs into parent;
  v2's `.env` copied to parent as the working env (gitignored, not committed);
  v2 folder deleted after verification (~732 MB reclaimed).
- Pre-merge verification of v1's dead symbols (safe to delete, confirmed via
  grep): `audioSpeed`/`audioPitch`/`audioVolume` state, `GenerationErrorResponse`
  type, `BATCH_ITEM_DELAY_MS`, `CodeBlock` `dark` param — all declared but never
  referenced in v1.
- Post-merge verification: `npx tsc --noEmit` 0 errors; source-only
  `npx eslint app lib scripts` 0 errors / 0 warnings; `npm run build` exit 0,
  route manifest confirms new `/sitemap.xml`, `/robots.txt`,
  `/manifest.webmanifest` all build.
- Lint scope note (pre-existing, NOT merge-introduced): `npm run lint` (whole
  repo) flags generated `.next` caches and `scratch/` throwaway scripts because
  eslint.config.mjs `globalIgnores([".next/**"])` matches top-level `.next` only,
  not nested. Source itself is clean. With v2 deleted, the only remaining whole-
  repo lint noise is `scratch/` (gitignored).
- NOT pushed, NOT deployed. The next prod tag will include all of this: WAV
  switch + header fix (from `035b88e`/`4d68aed`) PLUS the v2 merge.
- PREWARM IS ON BY DEFAULT but only takes effect once deployed AND a user opens
  the dashboard. To keep it OFF in prod until validated, set
  `TTS_PREWARM_ENABLED=false` on the deployment env at deploy time. No env change
  is needed to keep current prod behavior — prod only changes when you deploy.
- Personal disk-utility scripts (`scripts/scan-*.ps1`, `check-vhdx.ps1`,
  `delete-vhdx.ps1`) were intentionally left untracked and are NOT in the commit.

## v2 merge deployed to STAGING VPS 178.128.103.120 (2026-06-21)

Deployed commit `59657c7` (the v2 merge) to the staging/fixer VPS as the first
live test of the merged code.

- Image: `ghcr.io/rosielreaksa/khmer-vox-tts:staging-20260621-v2merge-1`
  (digest `sha256:e00f5ad1...`, pushed to GHCR).
- Built locally via the standard multi-stage Dockerfile (standalone output,
  `scripts/sanitize-standalone.mjs` ran — the `pg-*` alias copies confirm it).
  `.dockerignore` correctly excluded `.env`/secrets/`data/store.json`.
- Staging VPS runtime = k3s (single node, Ubuntu 24.04, containerd), NOT plain
  docker. Cluster: 1 web replica + 1 worker + 1 postgres + a `fixer-http-proxy`
  (nginx NodePort 30080) that fronts the web ClusterIP. The internal DNS
  `web.khmer-vox.svc.cluster.local` did NOT resolve from the host curl test
  (000); use `http://localhost:30080` on-box to reach the app.
- Deploy method: built locally, `docker push` to GHCR, then
  `kubectl -n khmer-vox set image deployment/khmer-vox-{web,worker}`.
  `imagePullPolicy: Always` pulled the new tag from GHCR. Zero downtime — old
  pod stayed Running/Terminating until the new one was Ready 1/1.
- Previous staging image was `staging-20260619-mp3-direct-1` (June 19, MP3 era,
  pre-WAV-switch, pre-v2-merge). That tag is the ROLLBACK tag.
- Rollout: both deployments `successfully rolled out`. New pods
  `khmer-vox-web-5b85d49b6b-kbk7b` and `khmer-vox-worker-c78665dff-6nr67`,
  Running 1/1, image confirmed = `staging-20260621-v2merge-1`.
- Verified on-box via `http://localhost:30080`:
  - `/api/health` 200 → `{"status":"ok","store":"postgres","checks":{"server":{"status":"ok"}}}` (DB connectivity OK).
  - `/sitemap.xml` 200, `/robots.txt` 200 (correct allow/disallow), `/manifest.webmanifest` 200 — all three NEW routes that did NOT exist on the previous staging image, confirming the v2 merge landed.
  - `/` 200, `/docs` 200.
- PREWARM status on staging: code is in the image and defaults to enabled, but
  only fires when a user opens the dashboard. No env change was made, so it is
  active. If it misbehaves, disable with
  `kubectl -n khmer-vox set env deployment/khmer-vox-web TTS_PREWARM_ENABLED=false` (and same for worker) + rollout.
- PROD (voxtts.online, 152.42.203.77) is UNCHANGED — still on
  `prod-20260618-2`. This deploy was staging-only. Promoting to prod is a
  separate decision with its own `prod-*` tag.
- SSH credentials for the staging VPS are NOT stored in this file or anywhere
  on disk; they were used transiently via `VPS_HOST`/`VPS_USER`/`VPS_PASS` env
  passed to `scripts/vps-ssh.py`. (Note: the user provided the staging VPS
  password in chat; rotate it if that's a concern.)

## Batch voice-clone API e2e test (2026-06-20 evening)

Tested the business-style batch clone API end-to-end (10 clones in one job, same
reference voice) against the running dev server.

- `scripts/test-website-batch-clone-call.mts`: POST /api/v1/audio/batch/clone
  with reference_audio_base64 + 10 distinct Khmer lines + voice_consent, polls
  /api/v1/audio/batch/jobs/{id}, then downloads the zip. Reference sample:
  `D:\the api tts host\outputs_10_voices\duration_probe_15s.wav` (1635 KB).
- JOB RESULT: status=completed, 10/10 items success, 0 failed, 60 credits
  charged, ~30 output seconds total, elapsed ~567s. Note: items process roughly
  serially via the inline dev worker (kickBatchWorker runs in-process unless
  DISABLE_INLINE_JOB_WORKER=true), so 10 clones take ~9 min locally; this is a
  local-dev artifact, prod uses the real job worker. Transient per-item failures
  were auto-retried by the batch worker and all 10 eventually succeeded.
- IMPORTANT FINDING (not a code bug): the first zip download returned HTTP 404
  with an HTML body (the app shell), meaning Next never reached the download
  route handler. ROOT CAUSE: the `.next` dev build state was corrupted because
  earlier dev servers were force-killed (taskkill) mid-compile — same cause as
  the corrupted `.next/dev/types/routes.d.ts` tsc errors. FIX/verify: stopped
  dev, deleted `.next`, restarted fresh — the SAME job's download then returned
  200 application/zip, 1,276,384 bytes, 10 files. All 10 WAVs valid RIFF/WAVE
  mono 24 kHz 16-bit. LESSON: prefer a graceful dev-server stop, or `rm -rf
  .next` after a force-kill, before trusting route 404s in dev.
- Batch clone items store audio in DigitalOcean Spaces (audioObjectKey/
  audioObjectUrl), NOT inline base64; the download route fetches via
  resolveAudioBytes -> getAudioObjectBytes. SPACES_* env is present in
  .env.backup so this worked locally.
- Added helper `scripts/download-batch-zip.mts` (download-only by JOB_ID).
  Note: PowerShell Invoke-WebRequest hung on the binary zip stream even though
  the server returned 200 in ~24s; use Node/tsx fetch for binary downloads, not
  Invoke-WebRequest.
- All e2e scripts tsc-clean. Local-only (JSON store, no prod DB), test tokens
  only. Saved: test-output/batch-clone-api.zip. These new scripts are
  uncommitted.

## WAV Header Fix: delivered WAV had placeholder (0xFFFFFFFF) sizes

Update on 2026-06-20 (evening, after commit 035b88e):

- Ran a real 10s male Khmer generation through the website pipeline
  (`synthesizeWithUpstream`) via `scripts/test-website-pipeline-male-10s.mts`.
  Generation SUCCEEDED (audio/wav, ~12s, valid mono 24 kHz PCM-16 audio), but
  inspecting the output header exposed a real correctness bug in the WAV switch.
- BUG: the delivered WAV's RIFF size field AND `data` chunk size field were both
  `0xFFFFFFFF`. ROOT CAUSE: the final delivery filters (`capLongPauses`,
  `reduceOutputNoise`, `normalizeOutputLoudness`, `applyOutputTempo`) stream WAV
  out of ffmpeg to a non-seekable stdout pipe, so ffmpeg cannot seek back to
  backfill the size fields and writes placeholders. The app's own WAV readers
  clamp this (so in-app playback/duration worked), but EXTERNAL consumers (audio
  editors, browser duration readouts, ASR pipelines) trust the header and see a
  malformed/wrongly-sized file — which defeats the whole point of shipping clean
  WAV. Symptom in the test: local WAV parser reported a garbage 89478s duration.
- FIX (`lib/tts-provider.ts`): added `finalizeDeliveredWav(bytes)` which, for a
  PCM-16 WAV, rebuilds a clean canonical 44-byte header with correct RIFF/data
  sizes via the existing `createPcm16Wav` (already-correct WAVs are returned
  untouched via a fast-path check). Wired it into BOTH delivery choke points:
  `synthesizeMergedAudio` (single/standard + clone generation) and
  `mergePublicMp3SegmentsForDelivery` (batch merged download).
- ALSO fixed the test harness env loader in
  `scripts/test-website-pipeline-male-10s.mts`: `.env.backup` stores
  `TTS_UPSTREAM_POOL` wrapped in SINGLE quotes, but the loader only stripped
  double quotes, so `JSON.parse` failed and the test fell back to the single
  `TTS_UPSTREAM_URL`. Loader now strips both quote styles (used `[\s\S]` not the
  `s` regex flag, since tsconfig targets ES2017). Harness-only; production env
  is not quoted, so this was never a prod issue.
- VERIFIED after fix: re-ran the generation — local WAV parser now reports
  11.94s, exactly matching the provider-reported duration. Direct byte check:
  RIFF size 573156 (= bytes-8) and data size 573120 (= bytes-44) both correct,
  fmt mono / 24000 Hz / 16-bit. `npx tsc --noEmit` clean, `npm run lint` 0
  errors / 82 pre-existing warnings, `npm run build` compiled (89 static pages).
- STATUS: code fix is local-only, NOT yet committed and NOT deployed (commit
  035b88e was just before this). The delivered-WAV bug affects every generation
  on the WAV path, so this should ship WITH the WAV switch — do not deploy
  035b88e without this fix on top.

### Real end-to-end website API verification (2026-06-20 evening)

Earlier the only "generation" test was an IN-PROCESS call to
`synthesizeWithUpstream` (provider layer only). It skipped the website route
layer (API-key auth, token billing, rate limit, generations row). Ran a TRUE
end-to-end test through the running dev server's public API:

- No `DATABASE_URL` in `.env.backup`, so local dev uses the JSON file store
  (NOT production Postgres) — safe to seed and test locally. Loaded the Modal
  upstream pool env into the shell session only (no secrets written to disk).
- Added `scripts/seed-paid-api-user.mts`: creates a paid user (approved Creator
  order → `hasPaidApiAccess`), 10,100 tokens, and a fresh API key. The store
  only keeps the key HASH, so the raw key is captured to
  `test-output/seed-key.txt` (gitignored).
- Added `scripts/test-website-api-call.mts`: real HTTP `POST
  /api/v1/audio/speech` with `Authorization: Bearer <key>`, male voice, ~10s
  Khmer text, then validates the response + WAV header.
- RESULT (against `npm run dev` on localhost:3000): HTTP 200, `audio/wav`,
  559.7 KB, `X-Output-Format: wav`, `X-Credits-Charged: 18`,
  `X-Remaining-Tokens: 10082` (billing worked: 10100→10082), generation id
  returned, and the WAV header was CORRECT through the real route too
  (riffSize 573156 OK, dataSize 573120 OK, mono 24 kHz 16-bit, ~11.94s). This
  confirms the `finalizeDeliveredWav` fix holds on the actual delivery path,
  not just the in-process provider call.
- tsc clean, lint 0 errors / 82 warnings after adding both scripts. Dev server
  was stopped after the test. The two new scripts + the WAV fix remain
  uncommitted (commit 035b88e predates them).

## Verification Fix: stray test script broke tsc + build

Update on 2026-06-20 (evening):

- Ran the full verification suite on the uncommitted WAV-switch worktree.
  `next build` reported `✓ Compiled successfully` for the whole app/lib tree,
  so the application code is clean. The only failures were `npx tsc --noEmit`
  (exit 2) and `npm run build` (TypeScript step) plus 1 lint error, all from a
  single untracked dev script left by the previous agent:
  `scripts/test-website-pipeline-male-10s.mts`.
- ROOT CAUSE: `tsconfig.json` `include` has `**/*.mts`, so that script is type-
  checked by both `tsc` and the `next build` typecheck. Two issues in it:
  1. Line 49 dynamic-imported `"../lib/tts-provider.ts"` with a `.ts` extension
     (TS5097: needs `allowImportingTsExtensions`, which is off).
  2. Line 75 used `catch (error: any)` (the lone `@typescript-eslint/no-explicit-any`
     error).
- FIX (script-only, no app code touched): dropped the `.ts` extension on the
  dynamic import (`"../lib/tts-provider"`), and replaced `catch (error: any)`
  with `catch (error)` + a narrow local type cast. The script still runs the
  same way under `npx tsx`.
- Verified after the fix: `npx tsc --noEmit` clean (exit 0), `npm run lint`
  0 errors / 82 pre-existing warnings, `npm run build` compiled successfully
  (89 static pages, standalone sanitize step ran). The WAV switch, password
  reset flow, and batch merged-audio download all build/lint/typecheck clean.
- COMMITTED on 2026-06-20 (evening) as `035b88e` ("feat: switch public audio to
  WAV, add password reset and batch merged audio"), 50 files changed. Staged the
  WAV switch, password reset flow, batch merged-audio download, the verification
  fix, deploy helper scripts, and WAV test scripts. Intentionally EXCLUDED the
  user's personal disk-utility scripts (`scripts/scan-*.ps1`,
  `scripts/check-vhdx.ps1`, `scripts/delete-vhdx.ps1`) — they remain untracked.
- NOT pushed and NOT deployed. Commit is local on `main` only.
- HOUSEKEEPING (done 2026-06-20 evening):
  - Removed the stray `nul` file. It was a Windows reserved device name, so
    normal PowerShell `Remove-Item` could not see it; deleted it with
    `cmd /c 'del "\\?\D:\website api seller\nul"'`. Confirmed gone from
    `git status`.
  - Added `test-output/` to `.gitignore` (local generated artifacts section).
    It holds local WAV test renders from the `scripts/test-*-10s` scripts.
  - LEFT ALONE intentionally: the user's `scripts/scan-*.ps1`,
    `scripts/check-vhdx.ps1`, `scripts/delete-vhdx.ps1` disk-housekeeping
    utilities and the `scripts/configure-smtp.sh` /
    `scripts/configure-google-apps-script-email.sh` helpers. These are personal
    tooling / setup helpers, not deletion candidates without the user's say-so.

## Pre-Deploy Audit Fixes For The WAV Switch

Update on 2026-06-20 (later same day):

A full system audit caught three issues in the WAV-switch worktree that would
have hurt either fidelity or correctness on rollout. All three are now fixed,
local-only, build/typecheck/lint clean.

1. `deploy/production.env.example` still defaulted to MP3. Flipped:
   `TTS_UPSTREAM_RESPONSE_FORMAT="wav"`, comment rewritten to match the new
   delivery contract. `TTS_OUTPUT_REWRITE_MP3_HEADER` is now labelled as legacy
   (ignored on the WAV path; left for backward compat with old deployments).
   Without this fix, a fresh prod env from this template would have made every
   generation pay an MP3 -> WAV decode hop on the website.

2. Long-form merge audio quality regression. `mergePublicMp3SegmentsForDelivery`
   and `synthesizeMergedAudio` were calling `concatWavBuffers` (a plain
   data-segment splice with no crossfade and no chunk-join silence padding),
   while the richer `concatPcm16WavBuffers` (which applies
   `TTS_CHUNK_CROSSFADE_MS`, `TTS_CHUNK_JOIN_SILENCE_MS`, `TTS_CHUNK_JOIN_QUIET_DB`,
   `TTS_CHUNK_JOIN_DECLICK_MS`, and loudness-matching) was defined but never
   called. Effect: hard clicks/cuts at chunk seams in long audio. Fix: both
   call sites now use `concatPcm16WavBuffers`. The MP3 path's join smoothing
   behavior is restored on the WAV side.

3. `modal/modal_voxcpm_api.py` still defaulted `response_format="mp3"` in three
   places (the modal method, the FastAPI request schema, and the local test
   entrypoint), plus the docstring/example response. Flipped all to `"wav"`,
   updated docs/example accordingly. The website's pool config can still
   override per-endpoint with the existing `TTS_UPSTREAM_RESPONSE_FORMAT` env,
   but new Modal deployments will now serve WAV by default and avoid the
   round-trip described in fix 1.

Verification after the three fixes:
- `npx tsc --noEmit`: clean.
- `npm run lint`: 0 errors, 82 warnings (pre-existing + new "unused" warnings
  on now-dormant MP3 helpers, plus `concatWavBuffers` itself which is now
  superseded by `concatPcm16WavBuffers`; safe to prune later).
- `npm run build`: compiled successfully.

Still NOT deployed. Modal-side change (#3) requires a new Modal deploy if you
want the upstream default to actually flip; existing live endpoints are still
running the old code and will keep returning MP3 unless the request payload
explicitly sets `response_format=wav`. The website normalizes either way, so
this is a no-op for delivery correctness, just a fidelity/perf optimization.

## Public Audio Format Switched From MP3 To WAV

Update on 2026-06-20:

- Switched the public delivery format from MP3 to WAV (PCM-16, mono, 24 kHz).
  All generated public audio now ships as `audio/wav`. The old MP3 path is gone
  from new generation; legacy MP3 inputs (e.g. old stored audio from before this
  switch) are decoded back to PCM-16 WAV through `normalizeToPublicFormat`.
- Why: the upstream Modal endpoint already returns WAV. Re-encoding to MP3
  added a lossy step (and a known buzz/noise lift after loudnorm) for no
  benefit. Shipping the upstream WAV bytes preserves the full PCM-16 fidelity
  that callers actually want for editing, post-processing, and ASR pipelines.
  WAV files are larger but are still a single contiguous container, and the
  per-second token rate is unchanged.
- Code changes (this commit, all local-only, not yet deployed):
  - `lib/audio-api.ts`: `PUBLIC_AUDIO_OUTPUT_FORMAT="wav"`,
    `PUBLIC_AUDIO_CONTENT_TYPE="audio/wav"`, and
    `isUnsupportedPublicAudioOutputFormat()` is now a no-op (the public output
    format request field is accepted for compatibility and ignored — the API
    always returns WAV regardless of what the caller sends).
  - `lib/tts-provider.ts`: renamed `normalizeToPublicMp3` ->
    `normalizeToPublicFormat` (WAV pass-through, MP3 decoded back to WAV);
    added a `concatPcm16WavBuffers` helper for joining PCM-16 segments without
    re-encoding; `mergePublicMp3SegmentsForDelivery` and `synthesizeMergedAudio`
    now concat WAV PCM directly instead of MP3-merging.
  - Storage object keys: `audio-storage`, `batch-service`, and
    `generation-service` now write `.wav` keys with `audio/wav` content type.
  - Routes: `/api/v2/audio/jobs/[id]/audio`, `/api/batch/jobs/[id]/merged`, and
    the batch download/zip routes return `audio/wav` and updated error strings.
  - `lib/business-webhook-test.ts`: webhook test fixture now references WAV.
  - UI/docs: `speech-workspace`, `batch-jobs-panel`, `app/docs/page.tsx`, and
    `app/page.tsx` were updated to advertise WAV public output. Voice library
    upload still accepts MP3 and WAV reference samples (input only — that path
    is unaffected by the public output switch).
  - `.env.example`: comments updated. `TTS_UPSTREAM_RESPONSE_FORMAT` defaults
    to `wav`. `TTS_OUTPUT_REWRITE_MP3_HEADER`, `TTS_PUBLIC_MP3_BITRATE`, and
    `TTS_VALIDATE_PUBLIC_MP3_ROUNDTRIP` are flagged as legacy/ignored on the
    WAV path (they remain defined for backward compatibility with old
    deployments that may still produce MP3).
  - Smoke/test scripts: `scripts/v2-audio-api-smoke.mjs` now requests
    `output_format: "wav"` and asserts `audio/wav`.
    `app/app/dashboard/workspace-persistence.test.ts` fixtures use
    `audio/wav`.
- The `voice` reference upload path still accepts MP3 inputs (saved voice
  library and clone reference samples). Only the public OUTPUT format changed.
- Verification (local, on this branch): `npx tsc --noEmit` clean,
  `npm run lint` 0 errors (existing warnings only — including a few new
  unused-symbol warnings on now-dormant MP3 helpers in `lib/tts-provider.ts`
  like `concatMp3Buffers`, `publicMp3RoundTripQualityIssue`,
  `rewriteMp3WithSeekableHeader`, and `concatPcm16WavBuffers` until the WAV
  helper is wired in everywhere; these are kept for reuse and can be pruned
  later), and `npm run build` compiled successfully.
- Not yet deployed. Before deploying:
  - Spot-check upstream Modal endpoints really do return WAV (not MP3) on the
    current model. Modal's `modal/modal_voxcpm_api.py` still has an MP3 default
    in its docstring and `response_format`. The website normalizes either way,
    but if upstream actually serves MP3 by default, every delivery will pay an
    MP3->WAV decode hop. Either set `TTS_UPSTREAM_RESPONSE_FORMAT=wav` on the
    Modal pool entries or update the Modal code to default to WAV first.
  - Storage migration: NEW objects are `.wav`. EXISTING `.mp3` keys in Spaces
    and any inline base64 still work because the read path treats either as
    audio (the routes set the content type from the stored format, not from
    the key). No backfill is required, but old downloads will keep their MP3
    extension until the row is regenerated.
  - File size: a 1-minute WAV (24 kHz, mono, PCM-16) is ~2.7 MB vs ~1.2 MB at
    160 kbps MP3. Confirm the bandwidth budget on the API tier and any
    customer-facing size docs before announcing.

## REVERTED buzz-aware chunk gate (TTS_AUDIO_TONAL_DELIVERY_BOOST_DB=0)

Update on 2026-06-17 (~19:20):

- After enabling the buzz gate at 13 (~18:20), user hit "All batch items
  exhausted their retry limit" on the voice-cloning dashboard.
- DB diagnosis (last 90 min): 3 batches completed, 2 needs_review; ~40 failed
  items/generations ALL with "Upstream generated near-silent audio."
- ROOT CAUSE: boost=13 lowers the per-chunk tonal RMS floor from -22 dB to
  -35 dB (chunkTonalMinDbOverride = baseMinDb - boostDb). On the noisy
  reference this made the tonal gate reject far more chunks; each rejection
  retries with escalated temperature, and those escalated retries produced
  NEAR-SILENT output -> retries exhausted -> whole batch fails. The gate was
  too aggressive for this reference; it made things worse, not better.
- ACTION: reverted `TTS_AUDIO_TONAL_DELIVERY_BOOST_DB=0` on web + worker
  (env-only). Verified: BOTH deployments env=0, pods Running 1/1,
  /api/health=200. The gate code remains in the image (dormant) but is OFF.
- LESSON: do not raise the tonal delivery boost on noisy references. The buzz
  gate is not a viable fix here. The real fix remains a CLEAN reference clip.
  If revisiting, test the boost at a much lower value (e.g. 3-5) AND only
  alongside a clean reference, measuring near-silent failure rate.

## prod-20260617-4 Deploy (fix API key reveal closing before copy)

Update on 2026-06-17:

- User reported: creating a new API key auto-closes the one-time key reveal
  before they can copy it.
- ROOT CAUSE: `ApiDashboardClient` passed a `key` prop to `<ApiTabs>` that
  included `${normalKeys.length}`. Creating a key called
  `clearDashboardCache("dashboard:api")` -> react-query refetch -> key list
  length increments -> the changing `key` prop forced React to UNMOUNT and
  REMOUNT ApiTabs + its child KeyManager. The remount reset all KeyManager
  state including `rawKey`, so the reveal panel (meant to last 5 min) vanished
  within ~1s. The 5-minute timer never got a chance.
- FIX (3 files, web-only):
  1. app/app/dashboard/api/api-dashboard-client.tsx — removed the destructive
     `key={...}` prop from <ApiTabs>.
  2. app/app/dashboard/api/api-tabs.tsx — added `useEffect(() =>
     setApiKeys(initialKeys), [initialKeys])` to sync server data without a
     remount.
  3. app/app/dashboard/key-manager.tsx — added matching
     `useEffect(() => setKeys(initialKeys), [initialKeys])` so the key list
     still updates on polls/invalidation while the separate `rawKey` reveal
     state (and its timer) survive.
- `initialKeys` is useMemo'd in the parent, so the sync effects do not loop.
- Commit `175b961`. Build + typecheck + lint pass. Built/pushed
  prod-20260617-4, deployed web + worker. Verified: image prod-20260617-4,
  pods Running 1/1, /api/health=200, buzz gate still 13.

## Enabled buzz-aware chunk gate in prod (TTS_AUDIO_TONAL_DELIVERY_BOOST_DB=13)

Update on 2026-06-17:

- User reported clone output sounds like "robot noise". Measured the file
  `voxtts-clone-05b7db32...mp3`: 30 buzz runs (vs 10-11 earlier), 4.0s
  stuck-tonal, worst yet. All using the same noisy reference
  duration_probe_15s_d.wav.
- Conclusion: server-side tuning (timesteps=20, temp=0.45, retries=2) has hit
  its ceiling; the dominant cause is the noisy reference sample. VoxCPM2 clones
  the reference noise/instability.
- Attempted a local "best config" pipeline test (denoise + buzz-gate) but the
  local tsx harness kept crashing with ENVIRONMENTAL Windows errors
  (0xC0000409 stack overflow, 0xC0000142 DLL init, write EOF) — NOT code bugs
  (same harness succeeded earlier today at 176s). Likely antivirus/OS
  interference with node spawning ffmpeg repeatedly. Also learned denoise is a
  per-request flag (cannot be forced via env), so it is not a deployable config.
- ACTION: enabled the previously-dormant buzz-aware chunk gate in prod via
  `TTS_AUDIO_TONAL_DELIVERY_BOOST_DB=13` (env-only, code already in
  prod-20260617-3). This lowers the per-chunk tonal RMS floor by 13 dB so buzz
  that only becomes audible after the delivery loudnorm boost is caught at the
  chunk level (cheap targeted retry + temperature escalation) instead of only
  the expensive whole-synthesis delivery retry.
- Verified live: BUZZGATE=13, CLONE_TEMP=0.45, pods Running 1/1,
  /api/health=200. Revert: `kubectl set env deployment/...
  TTS_AUDIO_TONAL_DELIVERY_BOOST_DB-` (or set to 0).
- NEXT: user to generate a clone through the live site; measure result. If buzz
  drops, keep; else revert. HONEST CAVEAT: a clean reference clip remains the
  single biggest lever — no gate can make a noisy reference produce clean audio.

## prod-20260617-3 Deploy (voice library lookup fix + buzz-aware gate code)

Update on 2026-06-17:

- Deployed commit `010992a` (skip voice library lookup when cloneSample already
  provided) + `8e9f7d9` (dormant buzz-aware chunk gate) as `prod-20260617-3`.
- Root cause of 188x 404 "Voice not found in library" errors: callers sending a
  `voice` field (e.g. `male_800e`) alongside a reference audio to
  `/api/v1/audio/clone`. The generation-service treated unrecognized voice
  strings as user voice library IDs and tried a DB lookup, which failed 404.
- Fix: one-line change in `lib/generation-service.ts` — skip the library lookup
  if `cloneSample` is already provided in the request. The `voice` field becomes
  a display name only. Backward compatible, no caller changes needed.
- Also includes the dormant buzz-aware chunk gate code (env-gated off by default
  via TTS_AUDIO_TONAL_DELIVERY_BOOST_DB=0).
- Build + typecheck + lint all pass. Pushed to GHCR, deployed to both web +
  worker. Verified: image prod-20260617-3, pods Running 1/1, /api/health=200,
  env vars intact (TTS_INFERENCE_TIMESTEPS=20, TTS_CLONE_TEMPERATURE=0.45,
  TTS_FINAL_QUALITY_RETRIES=2).

## Clone path tuned toward preset path + dormant buzz-aware chunk gate

Update on 2026-06-17:

- User noted standard/preset-voice generations sound cleaner than page clone
  uploads, and correctly observed both paths use a reference sample. Confirmed
  in code (lib/tts-provider.ts ~2058-2097): the preset and clone paths differ in
  three ways:
  1. Reference: preset uses a curated clean clip; clone uses the user upload
     (the test ref duration_probe_15s_d.wav is measurably noisy).
  2. Temperature: preset TTS_PRESET_TEMPERATURE=0.45 vs clone
     TTS_CLONE_TEMPERATURE=0.55 (higher = more variation = more buzz-prone).
  3. Voice hint: preset keeps payload.voice; clone deletes it.
  Measured the user's standard-voice file: better (shorter, scattered buzz) but
  still not perfect (2.25s stuck-tonal, still FAILs standalone gate).
- ACTION (user asked to "do everything like standard voice"): the only safely
  env-tunable lever of the three is temperature (reference is the user's upload;
  forcing the voice hint on clones is riskier). Set `TTS_CLONE_TEMPERATURE=0.45`
  on worker + web to match the preset path. Verified live via printenv (=0.45,
  timesteps=20, final-retries=2), pods Running 1/1, /api/health=200.
  - Tradeoff: lower temperature can reduce voice likeness/expressiveness on
    clones (0.55 was likely chosen for better source match). Revert:
    `kubectl set env deployment/... TTS_CLONE_TEMPERATURE-`.
  - Honest note: temperature alone will not fully remove buzz; a cleaner
    reference upload remains the highest-impact lever (the preset path proves
    a clean reference is most of the difference).
- CODE CHANGE committed but DORMANT (off by default): buzz-aware per-chunk gate.
  `getSteadyTonalStats`/`getWavPcm16Stats` now accept an optional tonal-floor
  override; `analyzeRawGeneratedAudioSilence` lowers the per-chunk tonal RMS
  floor by `TTS_AUDIO_TONAL_DELIVERY_BOOST_DB` (default 0 = disabled) so a buzz
  that is quiet in the raw chunk but becomes audible after the ~13 dB delivery
  loudnorm boost is caught at the chunk level (cheap targeted retry) instead of
  only by the expensive whole-synthesis delivery retry. Built + typecheck +
  lint + build all pass. NOT yet deployed (prod image still prod-20260617-2) and
  NOT yet end-to-end tested; enable later with
  TTS_AUDIO_TONAL_DELIVERY_BOOST_DB=13 after a real-pipeline verification.

## TTS_FINAL_QUALITY_RETRIES=2 + stuck-tonal gate diagnosis

Update on 2026-06-17:

- Investigated why a delivered file still had sustained buzz (16-66s, 70-182s;
  FAILs standalone gate at 4s) despite the in-pipeline stuck-tonal defenses.
  Read the full path in lib/tts-provider.ts. Three existing layers:
  1. Per-chunk gate `synthesizeChunkWithSilenceRetry` (TTS_NEAR_SILENCE_RETRIES,
     default 2 retries + temperature escalation) -> runs
     `analyzeRawGeneratedAudioSilence` -> `generatedAudioStatsIssue`
     (stuck-tonal reject >1.5s). Algorithm/thresholds MATCH the standalone
     scripts/audio-file-quality-check.mjs.
  2. Fallback split into smaller chunks on repeated failure.
  3. Delivery-level retry `synthesizeWithUpstream` (TTS_FINAL_QUALITY_RETRIES,
     default 1) re-checks the FINAL delivered (loudness-boosted) audio via
     `analyzeDeliveredAudio` and regenerates the whole synthesis if buzzing.
- ROOT-CAUSE GAPS found:
  - Gap 1: the per-chunk gate analyzes RAW ~-29 LUFS audio, so a buzz sitting
    below TTS_AUDIO_TONAL_MIN_DB (-22 dB) is not flagged; loudnorm then boosts
    it ~13 dB into an audible tone. (Code comments already acknowledge this.)
  - Gap 2: the delivery retry only does 1 extra attempt, then ships the
    "least-buzzy" attempt ANYWAY (line ~2522 returns best?.result). A
    consistently-buzzing reference/text combo gets delivered every time.
  - Whole-synthesis retry is the wrong tool: re-rolls the entire multi-minute
    audio for a per-chunk problem (slow + random).
- ACTION (user chose option 2, cheap immediate mitigation): set
  `TTS_FINAL_QUALITY_RETRIES=2` (env-only) on worker + web. Verified live via
  printenv (=2, timesteps still =20), pods Running 1/1, /api/health=200.
- PLANNED REAL FIX (option 1, code change, not done yet): make the per-chunk
  gate buzz-aware at DELIVERY loudness (normalize/boost before the tonal
  analysis) so audible buzz is caught at the chunk level where the cheap
  targeted retry + temperature escalation already live. Optional bigger follow-
  up: per-chunk delivery-loudness re-check + targeted single-chunk regen
  instead of whole-synthesis retry.

## REVERTED TTS_OUTPUT_LOUDNORM_I back to default -16

Update on 2026-06-17:

- The earlier `TTS_OUTPUT_LOUDNORM_I=-18` change did NOT help. User reported the
  next generation sounded worse, and measurement confirmed it was ~2 dB quieter
  overall (mean -18.5 dB) without fixing the underlying noise/buzz. Quieter
  output just pushes users to raise volume, re-exposing the noise.
- Reverted by REMOVING the override (`kubectl set env ... TTS_OUTPUT_LOUDNORM_I-`)
  on both worker + web so the code default (-16) is restored. Verified via
  printenv: TTS_OUTPUT_LOUDNORM_I is unset (printenv exits 1), and
  TTS_INFERENCE_TIMESTEPS=20 remains intact. Pods Running 1/1, /api/health=200.
- NOTE: a `kubectl exec ... sh -c 'echo $VAR'` check is unreliable through the
  vps-ssh -> kubectl layering ($VARs expand in an intermediate shell). Always
  verify pod env with `printenv VAR` (no shell interpolation).
- CURRENT PROD STATE: image prod-20260617-2, TTS_INFERENCE_TIMESTEPS=20,
  loudnorm back at default -16. The genuine remaining issue is the sustained
  stuck-tonal/buzz (this file had buzz runs incl. 16-66s and 70-182s, and FAILs
  the standalone quality gate at 4.0s). Env tuning is exhausted; the real next
  step is fixing the in-pipeline stuck-tonal detection/retry in
  lib/tts-provider.ts so buzzy chunks are regenerated before delivery.

## TTS_OUTPUT_LOUDNORM_I=-18 in prod (reduce residual background noise)

Update on 2026-06-17:

- After `TTS_INFERENCE_TIMESTEPS=20` went live, user confirmed audio is better
  but reported a remaining "small background noise" in quiet sections. Measured
  a real full ~4:39 generation: loudness normal (-16.4 dB RMS, -2.4 dB peak),
  but a residual noise floor remained (5th-pct ~-41 dB) plus a ~4s stuck-tonal
  region (still FAILs the standalone quality gate).
- Applied the remaining output-side lever: lowered the loudnorm target from -16
  to -18 LUFS via `kubectl set env TTS_OUTPUT_LOUDNORM_I=-18` on BOTH
  `khmer-vox-worker` and `khmer-vox-web`. Less boost = less lift of the quiet-
  section noise floor. Env-only (no rebuild); both rolled out cleanly. Verified
  live via printenv (worker: TTS_OUTPUT_LOUDNORM_I=-18, TTS_INFERENCE_TIMESTEPS
  =20), all pods Running 1/1, /api/health = 200.
- Tradeoff: slightly quieter output overall (~2 dB). Revert:
  `kubectl -n khmer-vox set env deployment/... TTS_OUTPUT_LOUDNORM_I-`.
- OPEN ITEM (not yet addressed): a ~4s stuck-tonal/buzz region was delivered
  despite the in-pipeline stuck-tonal gate + per-chunk retry. Suspect the
  in-pipeline threshold is looser than `scripts/audio-file-quality-check.mjs`
  or the retry is not catching this artifact. Worth investigating the
  stuck-tonal detection/retry path in lib/tts-provider.ts next if buzz persists.

## prod-20260617-2 Deploy (denoise-stage code + earlier knobs)

Update on 2026-06-17:

- Deployed commit `8e5d1fc` (env-gated output denoise stage + parallel chunks +
  VoxCPM knobs, all from the 2026-06-17 work) to production as
  `prod-20260617-2`. Previous live image was `prod-20260617-1`.
- Flow: Docker engine already up; built + tagged `prod-20260617-2`, pushed to
  GHCR, then `kubectl set image` on both `khmer-vox-web` and
  `khmer-vox-worker`. Tag pushed before set-image (no ImagePullBackOff).
- Rollout clean, zero downtime. Verified: both deployments report image
  `prod-20260617-2`, all pods Running 1/1, `/api/health` = 200, and the
  separately-set `TTS_INFERENCE_TIMESTEPS=20` env SURVIVED the image change
  (it lives on the deployment spec, confirmed via printenv = 20).
- IMPORTANT: the new denoise stage ships OFF by default (`TTS_OUTPUT_DENOISE`
  unset). Real A/B testing showed it does not help at default settings, so this
  deploy is inert for audio output — it only gets the code into prod. The live
  audio-quality improvement is still driven by `TTS_INFERENCE_TIMESTEPS=20`.

## TTS_INFERENCE_TIMESTEPS=20 in prod (real A/B-proven noise fix)

Update on 2026-06-17:

- Ran a REAL upstream A/B test (not post-processing): called the Modal endpoint
  directly with the same reference sample + Khmer text, varying ONLY
  `inference_timesteps` (10 vs 20). Faithfully replicated the clone payload from
  `lib/tts-provider.ts` (mono 16kHz s16 wav ref base64, temperature 0.55,
  cfg_value 2.0, voice field deleted for clone).
- Measured result (this is the real generation-side noise fix):
  - Quiet-section noise floor (5th percentile): ts=10 = -48 dB -> ts=20 =
    -70 dB. ~22 dB quieter pauses, i.e. the reported "small background noise"
    largely gone.
  - Project quality gate high-ZCR (noise) ratio: ts=10 = 4.2% -> ts=20 = 0.0%.
  - Speech level unchanged (median ~-32 dB both). Both PASS the gate.
- Confirmed the earlier afftdn output-denoise stage did NOT help at defaults
  (5th-pct floor went -47 -> -44.5 dB, stuck-tonal got slightly longer), so it
  stays OFF by default. The real lever is generation-side timesteps.
- Action taken: `kubectl -n khmer-vox set env` added
  `TTS_INFERENCE_TIMESTEPS=20` to BOTH `khmer-vox-worker` (where generation
  actually runs; web has DISABLE_INLINE_JOB_WORKER=true) and `khmer-vox-web`.
  No image rebuild needed (env-only). Both rolled out cleanly; verified live via
  `printenv` in both pods (=20), all pods Running 1/1, `/api/health` = 200.
- Tradeoff: slightly slower per-chunk generation, largely absorbed by the
  already-live parallel chunking across the 3-endpoint Modal pool. Revert is
  trivial: `kubectl -n khmer-vox set env deployment/... TTS_INFERENCE_TIMESTEPS-`.

## Background Noise Investigation + Output Denoise (env-gated)

Update on 2026-06-17:

- User reported small background noise in generated long-form clone audio.
  Analyzed two real delivered files plus the reference sample with the bundled
  ffmpeg (`node_modules/ffmpeg-static/ffmpeg.exe`, astats per-window scans).
- Findings (measured, not assumed):
  - Delivered files: speech ~-13 dB RMS, peak ~-2.3 dB (no clipping). Fine
    0.4s-window scan showed true silent gaps DO exist (min -70 dB), so it is not
    a constant wall of noise. The audible noise is low-level model texture under
    speech and in short inter-word gaps (~-45 dB), ~30 dB below speech.
  - Reference sample `duration_probe_15s_d.wav` is itself somewhat noisy
    (pause floor only -34 to -44 dB), BUT toggling the app's "CLEAN UP NOISY
    REFERENCE AUDIO" (denoise_reference / ZipEnhancer) ON vs OFF produced
    essentially identical output floors. So the reference is NOT the dominant
    cause.
  - ROOT CAUSE: intrinsic VoxCPM2 generation noise, amplified by the output
    loudnorm boost (~13 dB up to the -16 LUFS target) which lifts the quiet-
    section floor into audibility. Post filters cannot fully remove it without
    risking speech quality.
- Filter experiments on the real file (all measured): `afftdn` moved the floor
  only ~0.3 dB at safe strength but preserved speech almost perfectly (speech
  RMS -15.5 -> -15.7 dB at nr=24) and deepened true silences (min -70 -> -140
  dB); a hard `agate`/expander either did not engage (pauses sit above any safe
  threshold) or risked chopping quiet speech (the known "cut-cut" choppiness).
- Implemented (in `lib/tts-provider.ts`): new env-gated `reduceOutputNoise`
  stage using `afftdn`, inserted in BOTH master chains
  (`mergePublicMp3SegmentsForDelivery` and `synthesizeMergedAudio`) between
  `capLongPauses` and `normalizeOutputLoudness`, so the floor is lowered before
  amplification. Off by default; never fails delivery (falls back to input on
  error). New env vars: `TTS_OUTPUT_DENOISE` (default false), and once enabled
  `TTS_OUTPUT_DENOISE_NR` (dB reduction, default 12) and `TTS_OUTPUT_DENOISE_NF`
  (noise floor dB, default -30).
- HONEST conclusion communicated to user: the only place this noise can be
  truly reduced is at generation. Highest-impact lever is raising
  `TTS_INFERENCE_TIMESTEPS` (e.g. 16-24; added in the earlier 2026-06-17
  change, currently unset = upstream default 10) to make VoxCPM2 produce
  cleaner audio. Secondary lever: lower `TTS_OUTPUT_LOUDNORM_I` from -16 toward
  -18 to reduce noise lift (already env-tunable, no code change made). The
  afftdn stage is a speech-safe finishing touch, not a magic fix.
- Verified: tsc clean, eslint 0 errors (only pre-existing unused-var warnings),
  `npm run build` passes. Temp test audio files cleaned up. NOT yet deployed.

## prod-20260617-1 Deploy (parallel chunks + VoxCPM knobs)

Update on 2026-06-17:

- Deployed commit `81881f0` to production as `prod-20260617-1` (previous live
  tag was `prod-20260616-4`). Live and verified on `https://voxtts.online`.
- Followed the tag-based GHCR flow: Docker Desktop had to be started first (it
  was left stopped after the C: disk cleanup), built + tagged
  `prod-20260617-1`, `docker push` to GHCR, then `kubectl set image` on both
  `khmer-vox-web` and `khmer-vox-worker`. No `ImagePullBackOff` this time
  because the tag was pushed before `set image`.
- Rollout was clean with zero downtime; afterwards all pods Running 1/1 with 0
  restarts (2x web, 1x worker, 1x postgres) and `/api/health` + `/app/signin`
  both returned 200.
- Behavior change now live: parallel chunk generation is ACTIVE (auto-sized to
  the endpoint pool). The other three knobs (`TTS_INFERENCE_TIMESTEPS`,
  `TTS_UPSTREAM_NORMALIZE`, `TTS_RETRY_CFG_STEP`) remain off by default. Instant
  revert path if GPU load or audio quality regresses: set
  `TTS_CHUNK_CONCURRENCY=1` and redeploy.

## VoxCPM Pipeline Performance + Quality Tuning (env-gated)

Update on 2026-06-17:

- Reviewed the full VoxCPM2 docs (voxcpm.readthedocs.io) against the generation
  pipeline and made four refinements in `lib/tts-provider.ts`. ALL are gated by
  env vars and default to the previous behavior, so production is unchanged
  until each is explicitly enabled. Typecheck, eslint (0 errors; only
  pre-existing unused-var warnings), and `npm run build` all pass.
- Changes:
  1. **Parallel chunk generation.** `synthesizeMergedAudio` previously generated
     long-form chunks strictly one-at-a-time. Now uses a new
     `mapWithConcurrency` helper that preserves output order while running
     several chunks against the endpoint pool at once. Concurrency defaults to
     the number of configured upstream endpoints (so we never pile requests on
     one GPU), capped by `TTS_CHUNK_CONCURRENCY_MAX` (default 6). Override with
     `TTS_CHUNK_CONCURRENCY`; set it to `1` to restore the exact old sequential
     loop. This is the biggest latency win for multi-minute audio.
  2. **`inference_timesteps` knob.** New `TTS_INFERENCE_TIMESTEPS` env (only sent
     to upstream when >= 4, range 4-30). Unset = upstream default (10) preserved.
     Lower = faster, higher = more detail.
  3. **Upstream text normalization knob.** New `TTS_UPSTREAM_NORMALIZE` (default
     false). When true, forwards `normalize: true` so numbers/dates are spoken as
     words. Off by default because the app already runs `prepareTextForSpeech`.
  4. **CFG reduction on retries.** New `retryAdjustedCfg` lowers `cfg_value` on
     each silence/buzz retry toward `TTS_RETRY_CFG_MIN` (default 1.5) by
     `TTS_RETRY_CFG_STEP` per attempt. Default step is 0 (disabled), so CFG stays
     at the hard-capped 2.0 unless opted in. This complements the existing
     temperature escalation and follows the VoxCPM docs' guidance that lowering
     CFG toward ~1.5-1.6 stabilizes noisy/buzzy long-form output.
- New env vars (all optional, safe defaults): `TTS_CHUNK_CONCURRENCY`,
  `TTS_CHUNK_CONCURRENCY_MAX`, `TTS_INFERENCE_TIMESTEPS`, `TTS_UPSTREAM_NORMALIZE`,
  `TTS_RETRY_CFG_STEP`, `TTS_RETRY_CFG_MIN`.
- Not yet implemented (discussed, deferred): targeted single-chunk regen on the
  delivered-audio buzz retry (currently regenerates the whole synthesis), a
  result cache keyed on text+voice+params, public API idempotency keys, and
  streaming delivery. These are larger changes for a follow-up.

## Admin API Error Log + Activity Log Production Deploy

Update on 2026-06-16:

- Built and deployed two admin-only pages plus full system error logging to
  production `https://voxtts.online` as `prod-20260616-4`.
- Feature work (commit `b9537ec`):
  - `/app/admin/errors` (API Error Log) and `/app/admin/activity` (Activity Log),
    both admin-only with deep pagination and UTC date-range filters. The error
    log captures errors that never create a generation row: auth 401/402/403,
    rate-limit 429, validation 400, server 500.
  - New `api_errors` table added to BOTH `lib/postgres-store.ts` `SCHEMA_SQL`
    and `database/schema.sql`; it auto-creates on boot via the idempotent schema
    run, so no manual migration was needed (new pods created it on startup).
  - New `lib/api-error-log.ts` logs fire-and-forget (never throws, never blocks
    the response), redacts sensitive keys (authorization/password/token/secret/
    cookie), and truncates large payloads.
  - Auth failures are captured centrally in `authenticateApiKeyFromRequest`
    (covers all public routes); 4xx/5xx are captured in the speech, clone,
    batch, and batch-clone route handlers. Inline 400 validation `return`s in
    the clone route are NOT all logged yet (would need a typed ValidationError
    caught in one place) - documented as a known follow-up.
  - Store helpers `createApiError` + `listApiErrorsPageForAdmin` (plus the
    earlier `listGenerationsPageForAdmin`) added across postgres, json, and the
    store facade.
- Also fixed a PRE-EXISTING lint error (commit `052c392`) that was blocking the
  deploy gate: `app/app/dashboard/speech-workspace.tsx` `WaveformPlayer` called
  setState synchronously in an effect; moved the resets into the async
  `buildPeaks` body. It came from the prior `c2927f6` ZipEnhancer commit, not
  this feature.
- Deploy gotcha (the reason the deploy steps above were rewritten): the first
  rollout went `ImagePullBackOff`. Production pods use `imagePullPolicy: Always`
  and date-versioned tags, so importing the tar via `k3s ctr images import` was
  not enough - the kubelet still tried to PULL `prod-20260616-4` from GHCR,
  which 404'd because only `:latest` had been pushed. Fixed by
  `docker push ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260616-4`, then
  deleting the stuck pods to force an immediate re-pull. Old replicas served the
  whole time, so there was zero production downtime.
- Verified after rollout: all pods Running 1/1 with 0 restarts on
  `prod-20260616-4`; `https://voxtts.online/api/health`, `/app/dashboard/jobs`,
  and `/app/signin` all returned 200. Uploaded tar removed from the VPS and
  locally; temp build/upload logs deleted; worktree clean at `052c392`.

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

## THROUGHPUT FIX 2026-06-14: worker concurrency 1->4 (config only)

Follow-up to the load test: tackled audio-generation throughput (the second
bottleneck). Investigation showed the worker was the limiter, NOT the app or
Modal:
- `scripts/job-worker.mjs` runs `JOB_WORKER_CONCURRENCY` poll loops (default 1),
  so prod drained jobs serially (~108s each, cold start) -> only ~10/100 done in
  6 min during the earlier e2e test.
- Job claiming is race-safe for parallel loops: postgres-store.ts
  `claimNextQueuedBatchJob` uses `for update ... skip locked`.
- Per-user item cap (`dashboardTts.maxConcurrent=2`) is PER-USER, so 100 distinct
  users don't throttle each other.
- Modal side scales: `modal/modal_voxcpm_api.py` MAX_NUM_SEQS=16 per container,
  3 endpoints in the pool, SCALEDOWN_WINDOW=600 keeps containers warm.
=> Fix is a deployment env var, no code change.

Chose JOB_WORKER_CONCURRENCY=4 (conservative; safe on the 2-core worker box).
Validated on staging first (re-pointed staging TTS at prod Modal pool + temp
NodePort, set concurrency 4, ran the 100-user e2e test):
- BEFORE (concurrency 1): 10/100 jobs completed in 6 min.
- AFTER (concurrency 4): 79/100 completed; the other 21 were still draining at
  the 6-min test cap (hit 91% right at cutoff), not real failures. signup 100%,
  job_e2e median ~189s.

Applied to PRODUCTION worker: `kubectl -n khmer-vox set env
deploy/khmer-vox-worker JOB_WORKER_CONCURRENCY=4`. Confirmed worker log shows
"concurrency level: 4" with 4 loops, pod Running 0 restarts, /api/health 200.
This is an env-only change (no new image); rollback = set back to 1 or unset.
Staging fully reverted (NodePort removed, TTS pool back to `[]`; concurrency 4
left on staging worker but harmless with empty pool).

Remaining future levers if demand grows: raise concurrency further (watch GPU
cost + worker CPU), add worker replicas, more warm Modal containers. Not done.

### Manifest sync 2026-06-14 (persisted both fixes into /root/voxtts-populated.yaml)
The live `JOB_WORKER_CONCURRENCY=4` was only set via `kubectl set env` (lived on
cluster, not in the manifest template). Persisted it into
`/root/voxtts-populated.yaml` so a future `kubectl apply` keeps it. Also updated
both `image:` tags in that file from `:latest` to `:prod-20260614-17` so a
future apply does NOT revert the running image. Backups on host:
`voxtts-populated.yaml.bak-20260614` and `.bak2-20260614`. Edits were done with
a small remote python script (NOT a PowerShell `>` redirect — that corrupted the
file with UTF-16 control chars on the first attempt; caught via
`kubectl apply --dry-run=client` and restored from backup). Manifest now passes
dry-run. NOTE: manifest was NOT applied; live cluster already correct. The
manifest is still a partial template (secrets are placeholder values in-file),
so review before ever doing a full apply.

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

## CLONE QUALITY 2026-06-16 (part 2): opt-in ZipEnhancer reference denoise

Follow-up after the clone-temperature fix (0.8 -> 0.55) made clone quality good.
User wanted to further close the gap vs the official voxcpm2.org demo, which has
a "Reference audio enhancement" denoise step we lacked.

KEY ARCHITECTURE FINDING: our Modal model does NOT use the standard open-source
`voxcpm` package. It uses the speed fork `nano-vllm-voxcpm==2.0.1` (imported as
`nanovllm_voxcpm`), which has NO built-in denoiser (no load_denoiser flag). The
official demo's denoise lives in the standard package. So we bolted ZipEnhancer
on ourselves via modelscope (the same iic/speech_zipenhancer_ans_multiloss_16k_base
model the standard package uses under the hood).

Design decision: OPT-IN per request, default OFF. Upstream docs warn the denoiser
runs at 16kHz and can slightly alter a clean voice; it only helps NOISY reference
uploads. So it is gated behind an explicit UI toggle / API flag.

Changes:
- `modal/modal_voxcpm_api.py`: add `modelscope` to image; `ZIPENHANCER_MODEL_ID`
  const; lazy `_get_denoiser()` (loads pipeline on first denoise=True, best-effort
  - never fails a clone); `_denoise_wav_bytes()` (temp-file round-trip, returns
  original bytes on any failure); `synthesize(..., denoise=False)` runs denoise on
  prompt/ref WAV before `encode_latents`; `SpeechRequest.denoise` field wired to
  synthesize.
- `lib/tts-provider.ts`: added `denoiseReference?: boolean` to all 5 nested synth
  param types (threaded via existing `...params` spread); in clone branch only
  (not preset), sets `payload.denoise = true` when flag is true.
- `lib/generation-service.ts`: `runGenerationForUser` accepts `denoiseReference`,
  forwards to `synthesizeWithUpstream`.
- `lib/batch-merge-marker.ts`: extended `dashboardMergeMetadataJson(options?)` to
  optionally encode `denoiseReference`; added `readDashboardMergeOptions()`. This
  is how the flag survives the dashboard QUEUE (clone is a queued batch job, run
  later by the worker - the flag had to persist on job metadata).
- `lib/generation-queue.ts`: `createQueuedDashboardGeneration` accepts the flag,
  encodes it into the merge metadata.
- `lib/batch-service.ts`: worker reads `readDashboardMergeOptions(job)` and passes
  `denoiseReference` into `runGenerationForUser`.
- `app/api/generate-clone/route.ts`: parses `denoise_reference` form field.
- `app/app/dashboard/speech-workspace.tsx`: "Clean up noisy reference audio"
  checkbox (default off) in the upload-reference block; sends `denoise_reference`.

NOTE: only wired into the dashboard clone path + the shared provider. The v1/v2
business clone API routes do NOT yet expose denoise (could add a `denoise` form
field -> createQueuedBatchJob metadata later if a customer needs it).

Verified: tsc + build clean, marker unit tests pass, no lint errors. Shipping in
prod-20260616-3 (app) + Modal redeploy of all 7 accounts (modelscope download
happens lazily on first denoise=True call, adds one-time delay for that request).

## CFG HARD-CAP 2026-06-16 (prevent broken audio from CFG > 2)

User reported CFG (guidance scale) above 2 (e.g. 3) produces broken/distorted
audio, and wanted it locked to 2 across the WHOLE system (website standard
voice, clone, API call, business).

Root cause / where CFG lives: every generation path (standard TTS, clone,
API v1/v2, business) funnels through `synthesizeSingleChunk` in
`lib/tts-provider.ts`. CFG was read from env (`TTS_CLONE_CFG_VALUE` /
`TTS_PRESET_CFG_VALUE`, both default 2.0) via `readNumericEnv(..., min, max)`.
The max ceiling was 5.0, so a misconfigured env could push CFG to 3-5 and break
audio. API/business routes do NOT accept a caller-supplied cfg_value (grepped
all of app/ - no matches), so the only risk vector was env.

Fix (defense-in-depth, default behavior unchanged at 2.0):
- `lib/tts-provider.ts`: both clamps changed `max` 5.0 -> 2.0
  (`readNumericEnv("TTS_CLONE_CFG_VALUE", 2.0, 0.1, 2.0)` and the preset one).
  Any env value above 2 is now clamped down to 2.0.
- `modal/modal_voxcpm_api.py`: `SpeechRequest.cfg_value` Field `le=5.0 -> le=2.0`
  so a direct upstream call with cfg > 2 is rejected at the API boundary.
- `.env.example`: documented the 2.0 hard cap.

Verified: `npx tsc --noEmit` + `npm run build` clean, no lint errors. Prod had
NO CFG env override (already effectively 2.0). Shipping in prod-20260616-2.

## PROD DEPLOY 2026-06-16: prod-20260616-1 (pitch-preserving clone tempo control)

Shipped the clone tempo fix to production and enabled it live.

Changes (committed as `c881487` on main, local-only before this deploy):
- `lib/tts-provider.ts`: new finishing-stage `applyOutputTempo` (ffmpeg
  `atempo`, pitch-preserving). Clone output reads `TTS_OUTPUT_CLONE_TEMPO`,
  standard TTS reads `TTS_OUTPUT_TEMPO`; 1.0 is a no-op. Wired into the sync
  pipeline and the exported merge path; `job.mode` passed at all delivery sites.
- Also carried the already-deployed perf tuning (inference timesteps 8,
  dashboard concurrency 4 / clone 2) and the polling-spinner UX fix.

Verified before deploy: local clone E2E (refreshed `reasksaxz` dev Modal
token), `npx tsc --noEmit` + `npm run build` clean. Controlled A/B confirmed
0.92 stretches ~8.6% and widens pauses with pitch intact.

Deploy: built+pushed `ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260616-1`
(digest sha256:e99b8fdf71fb54d852789c5cb89eae682a149d8deff887e17d1f0d5a11d7060a).
`kubectl set image` web+worker, `kubectl set env TTS_OUTPUT_CLONE_TEMPO=0.92`
web+worker. Both rolled out zero-downtime (web 2/2, worker 1/1, 0 restarts).
Verified: `/api/health` 200 (`store: postgres`), `/`, `/app/signin`,
`/app/dashboard/jobs` all 200; both deploys on prod-20260616-1 with
TTS_OUTPUT_CLONE_TEMPO=0.92 confirmed via `set env --list`.

Rollback target = `prod-20260615-8`. NOTE: clone tempo is now an env-only
lever too -- to revert pacing without an image rollback, set
TTS_OUTPUT_CLONE_TEMPO=1.0 on web+worker and the change is immediate on next
generation (no code revert needed). The manifest template
`/root/voxtts-populated.yaml` was NOT updated with the new tag/env, so persist
there before any future full `kubectl apply`.

## PROD DEPLOY 2026-06-15: prod-20260615-8 (faster generation via INFERENCE_TIMESTEPS 10->8)

Follow-up to the concurrency fix. After confirming parallelism worked (both
chunks of a test job started at the same instant), measured that the remaining
slowness is raw Modal GPU decode (~3x realtime). User chose to lower the
diffusion decode steps.

Changes:
- `modal/modal_voxcpm_api.py`: `INFERENCE_TIMESTEPS` default 10 -> 8.
- `lib/modal-deployer.ts`: inject `VOXCPM_INFERENCE_TIMESTEPS=8` into every
  Modal deploy (same pattern as VOXCPM_SCALEDOWN_WINDOW) so all accounts stay
  consistent; tunable via env. Added `DEPLOY_INFERENCE_TIMESTEPS` const.
- `.env.example` already documents related knobs.

Deploy steps (IMPORTANT for future timesteps/scaledown changes):
1. Build/push app image (carries the new modal_voxcpm_api.py + deployer).
2. Roll out web+worker.
3. The GPU reads INFERENCE_TIMESTEPS at container load, so a MODAL REDEPLOY is
   required for it to take effect. Redeploy every account from inside the web
   pod (it has the modal CLI + /app/data/.modal.toml + /app/modal):
   `for P in number1 khmer-ai-research number2 number3 number4 number5 voxtts; do
      MODAL_PROFILE=$P VOXCPM_INFERENCE_TIMESTEPS=8 modal deploy modal_voxcpm_api.py; done`
   NOTE: pod image is slim -> use `sh`, NOT `bash` (no bash in container).
   All 7 accounts redeployed OK (~4s each; upstream model image already built).

Result (warm single chunk, timesteps=8): 318 chars -> 28s audio in 73.7s Modal
call = ~2.6x realtime. Before (timesteps=10): ~3.0-3.2x realtime. So ~15-20%
faster decode per second of audio - modest but real (timesteps only speeds the
diffusion/acoustic stage, not the autoregressive token gen). Cold start (~60s)
unchanged; right after a redeploy the first call per account pays it.

INFRA NOTE: Local C: drive hit 0 bytes mid-session from accumulated Docker
build cache. `docker builder prune -a -f` reclaimed 48GB; `docker image prune`
+ removing old tags left only 2 images. Auto-prune build cache after each build
going forward (user request). Windows Docker WSL2 vdisk does not shrink the
host automatically, so host free space stayed ~10GB even after internal prune.

Verified `prod-20260615-8` (digest
sha256:126b136bff5ad3102ce80b47d3914b0a3ef7fcdfcdcce118a6d8a5335644e893):
typecheck+build clean, pushed, rolled out web+worker zero downtime. Rollback
target = `prod-20260615-7` (note: rolling back the app image does NOT revert the
Modal timesteps; to revert speed, redeploy accounts with
VOXCPM_INFERENCE_TIMESTEPS=10).

## PROD DEPLOY 2026-06-15: prod-20260615-7 (faster multi-chunk generation)

User reported long-text generation was slow (~6-7 min wall time for ~5 min of
audio). Investigated chunking + concurrency end-to-end.

Root cause (artificial concurrency cap):
- A long dashboard text splits into ~60s chunks (`splitDashboardTextForJob`).
- Per-generation parallelism = `min(BATCH_ITEM_CONCURRENCY, dashboardTts
  .maxConcurrent)`. Defaults were `min(3, 2) = 2`, so a 5-chunk job ran in 3
  sequential waves (~100s each) even though the Modal account autoscales to
  many containers. Measured prod jobs: 4-5 chunks took 357-405s wall.
- Secondary: cold start adds ~60s on the first chunk (a 4s clip took 56-71s)
  because Modal `scaledown_window=120s`. Left as-is (cost lever, user's call).

Fix (app-side only, no Modal redeploy, fully env-tunable):
- `lib/usage-policy.ts`: `dashboardTts.maxConcurrent` 2 -> 4;
  `dashboardClone.maxConcurrent` 1 -> 2.
- `lib/batch-service.ts`: postgres `batchItemConcurrency` default 3 -> 4 so the
  per-mode policy is the binding limit.
- `.env.example`: documented new defaults + `TTS_DASHBOARD_CONCURRENT_LIMIT`
  and `BATCH_ITEM_CONCURRENCY` knobs to dial back live without a redeploy.
- Rationale: the worker is network-bound while awaiting Modal (only a light
  per-chunk ffmpeg pass runs on the 2vCPU/4GB box), so 4-wide is safe and
  roughly halves wall time for a ~5-chunk job. Clone kept lower (heavier
  reference-audio encode per call).

Expected: ~5-chunk TTS drops from ~3 waves to ~2 waves (~halved, minus the
one-time cold start). If Modal limits are hit, set
`TTS_DASHBOARD_CONCURRENT_LIMIT=2` (web+worker) and rollout.

Verified `prod-20260615-7` (digest
sha256:14a65eec327a91b79d5c173324276077eb4c6725dcec2f4d0a7e9ca421bdb1f1):
typecheck + build clean, pushed to GHCR, rolled out web + worker (zero
downtime), `/api/health` 200 (`store: postgres`). Rollback target =
`prod-20260615-6`. No concurrency env override set, so code defaults apply.

## PROD DEPLOY 2026-06-15: prod-20260615-6 (generate panel stuck "Needs attention" fix)

Fixed a UI bug on the dashboard generate panel (Generate Speech + Voice Clone).
Symptom (user screenshot): while a multi-chunk job ran, the Audio Result panel
showed a red "NEEDS ATTENTION / Generating: Segment 0 of 5 completed..." box
instead of the animated generating state, and the in-progress generation was
not yet in History (History only shows the merged record after completion,
which is expected).

Root cause: in `pollQueuedJob` (`app/app/dashboard/speech-workspace.tsx`), the
mid-progress snapshot update set only `error` (the progress string) without
re-asserting `busy: true`. If `busy` had been flipped to `false` by an earlier
transient poll error, the render fell through to the `error` branch
("Needs attention") because the progress string was treated as an error.
Also the catch block gave up (busy:false) on any poll exception, including
transient network/5xx blips.

Fix: progress updates now always set `busy: true`; transient poll errors
(network/fetch/5xx "Waiting for background") keep the spinner alive and retry
instead of surfacing "Needs attention". Fatal errors and explicit
failed/needs_review still stop with a real message.

Verified `prod-20260615-6` was built (digest
sha256:5057986eb524f94e498c73d5c9a885c21dd73ae49c16624c0bcd868c1c4e8b90),
typecheck + build clean, pushed to GHCR, rolled out to web + worker
(zero downtime, 0 restarts). Rollback target = `prod-20260615-5`.

Note: confirmed the merged-history feature itself works on prod — a completed
5-chunk dashboard_merge job had its merged record (id = job id, has audio,
segment_of_job_id null) plus 5 hidden segment rows. The earlier screenshot was
taken mid-run before completion.

## PROD DEPLOY 2026-06-15: prod-20260615-5 (merged history + refresh persistence)

Deployed to production (`voxtts.online`, `152.42.203.77`, ns `khmer-vox`) as
immutable tag `ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260615-5`
(digest sha256:c38374225ea65cfd916b3700abc32094dffd7f7cdf1b6ba2609ed87327032d99).
Rollback target = `prod-20260615-4`.

Changes shipped:

1. **Merged dashboard history** — long multi-chunk TTS/clone generations now
   save one full merged audio row in History (play + download). Per-chunk rows
   are tagged with `segment_of_job_id` and hidden from history/list/stats.
   Runtime migration adds `generations.segment_of_job_id` + index on startup.
2. **Refresh persistence** — Generate Speech and Voice Cloning panels restore
   completed audio (or reconnect to an in-flight job) after page reload via
   `workspace-persistence.ts`.

Staging verification (fixer VPS `178.128.103.120`) passed first on
`staging-20260615-1613`: 2219-char text split into 2 chunks, merged record
saved (192s audio), history query returned exactly 1 row.

Deploy steps: re-tagged the verified staging image as prod, `docker push` to
GHCR, then `kubectl -n khmer-vox set image` on web + worker with zero-downtime
rollout. Verified: `/api/health` 200 (`store: postgres`), both web pods and
worker on `prod-20260615-5`, `segment_of_job_id` column + index present in
prod Postgres.

## Clone Pacing: Pitch-Preserving Output Tempo (2026-06-15, LOCAL-ONLY)

User reported clone voice talks too fast (sentences run together, almost no
breathing pauses). Objective ffmpeg analysis of a real clone MP3
(`voxtts-clone-...db.mp3`, 201.8s) confirmed it: clean noise floor (mean -75 dB,
no hiss), healthy loudness (-16.5 LUFS), but only 5 pauses > 0.6s in 201s with a
44s continuous run (~30-74s) and no real breath. Noise was NOT a problem; speed
was. Root cause: VoxCPM2 clones inherit the reference sample's rhythm, and the
app clone payload (`lib/tts-provider.ts` synthesizeSingleChunk) sends NO
speed/pacing param (only ref_audio + temperature + cfg_value; `voice` is deleted
for real clones). The upstream `speed` param is weak (it just prepends a text
hint like `(speaking slower...)` to input via voice_description; unreliable and
collides with the deleted-voice channel for clone). So pacing was 100% inherited
from the reference.

Fix (deterministic, pitch-preserving, env-gated, default OFF):
- Added `applyOutputTempo(bytes, mode)` + `readOutputTempo(mode)` in
  `lib/tts-provider.ts`. Uses ffmpeg `atempo=<n>` which changes talking speed
  WITHOUT changing pitch (voice identity preserved). <1.0 slows, >1.0 speeds up.
  1.0 (or within 0.005) is a no-op returning original bytes (no re-encode).
  Fails open (returns input on error) like the other finishing steps.
- Runs LAST in the finishing chain, after capLongPauses + normalizeOutputLoudness,
  so the time-based pause/loudness logic stays predictable. Wired into both
  pipelines: internal `synthesizeMergedAudio` (uses params.mode) and the exported
  `mergePublicMp3SegmentsForDelivery(buffers, outputSeconds, mode="tts")`.
- Passed `job.mode` at all 3 merge call sites: `lib/batch-service.ts:509`,
  `app/api/v2/audio/jobs/[id]/audio/route.ts`, `app/api/batch/jobs/[id]/merged/route.ts`.
- Env knobs (`.env.example`): `TTS_OUTPUT_TEMPO_ENABLED` (default true),
  `TTS_OUTPUT_TEMPO` (global, default 1.0), `TTS_OUTPUT_CLONE_TEMPO` (clone-only
  override, falls back to global when unset). Clone reads clone-override first;
  standard TTS reads global only. Defaults 1.0 = behavior unchanged until set.
- Verified: lint clean (no new errors), `npx tsc --noEmit` clean, `npm run build`
  exit 0. Functional ffmpeg proof on the real clone file: atempo=0.92 -> 201.8s
  becomes 219.3s (exactly 1/0.92, pitch unchanged), pauses widened ~0.64s->0.69s
  for more breathing room. Temp test file removed.
- LOCAL-ONLY, not deployed. To slow clones in prod without a rebuild, set
  `TTS_OUTPUT_CLONE_TEMPO=0.90`..`0.93` on web+worker via `kubectl set env` +
  rollout (suggest starting at 0.92). Standard voices stay untouched (leave
  TTS_OUTPUT_TEMPO=1.0).

## Batch Retry Improvements (2026-06-18)

Voice cloning batch jobs sometimes failed with "Generated 4 of 5 segments.
Retry failed" due to transient upstream errors (Modal GPU timeouts, empty audio
responses, rate limits). The retry mechanism was too conservative.

### Changes Made

**`lib/batch-service.ts`:**
- Increased `BATCH_ITEM_MAX_ATTEMPTS` default: 3 → 5 (more retry chances)
- Decreased `BATCH_ITEM_RETRY_BASE_MS` default: 30,000ms → 10,000ms (faster retries)
  - New backoff: 10s, 20s, 40s, 80s, 160s (was 30s, 60s, 120s, 240s, 300s)
- Added `isTransientBatchError()` function for smart error classification:
  - **Transient** (retry up to 5x): timeout, empty audio, near-silent, upstream/Modal errors, network issues, HTTP 502/503/504, rate limits
  - **Permanent** (stop immediately): account suspended, insufficient tokens, voice consent required, invalid API key
- Error messages now show failure type: `"error (retries exhausted)"` or `"error (permanent error)"`

**`app/app/dashboard/speech-workspace.tsx`:**
- Improved partial job error message: shows count of failed segments
- Before: `"Generated 4 of 5 segments. Retry failed lines from Batch Jobs."`
- After: `"Generated 4 of 5 segments. 1 failed — retry from Batch Jobs."`

**`.env.example`:**
- Updated default values for `BATCH_ITEM_MAX_ATTEMPTS` and `BATCH_ITEM_RETRY_BASE_MS`

### Configuration

Override via environment variables:
```
BATCH_ITEM_MAX_ATTEMPTS="5"        # Max retry attempts per segment (default: 5)
BATCH_ITEM_RETRY_BASE_MS="10000"   # Base retry delay in ms (default: 10000)
BATCH_ITEM_RETRY_MAX_MS="300000"   # Max retry delay in ms (default: 300000)
```

### Deployment Status

DEPLOYED to **production VPS** `152.42.203.77` on 2026-06-18.
Image: `ghcr.io/rosielreaksa/khmer-vox-tts:prod-20260618-2`.
All pods running: 2 web replicas + 1 worker + postgres.
Health check: `{"status":"ok","store":"postgres"}`.
Also deployed to staging VPS `178.128.103.120` (image: `latest`).
SSH keys set up for both VPS servers (passwordless access).

### Voice Consistency Fix (2026-06-18)

Fixed voice inconsistency across segments in batch/long-text generation.

**Problem**: When generating multiple segments with the same voice reference,
each segment had different speed, pitch, volume, and tone characteristics,
making the merged audio sound unnatural.

**Root Cause**:
- VoxCPM2 diffusion-based generation has inherent randomness
- Temperature 1.0 caused too much variation between segments
- No post-processing normalization across segments

**Solution**:
1. Lowered clone temperature from 1.0 to 0.8 for more consistent voice
2. Updated default voice instruction to include "consistent tone, smooth pace"
3. Added volume normalization across segments before merging:
   - Measures RMS (loudness) of each segment
   - Calculates target level (median of all segments)
   - Adjusts each segment to match target (±6dB limit)

**Files Changed**:
- `lib/tts-provider.ts`: Added `normalizeSegmentVolumes()`, `measureMp3Rms()`, `applyMp3Gain()`
- `lib/voice-defaults.ts`: Updated `DEFAULT_CLONE_VOICE_INSTRUCTION`

**Configuration**:
```
TTS_CLONE_TEMPERATURE=0.8  # Lower = more consistent (default: 0.8, was 1.0)
```

## Local Typecheck Fix 2026-06-20

- Fixed the blocking TypeScript error in `lib/tts-provider.ts` by making
  `contentTypeForResponseFormat` compare against `PUBLIC_AUDIO_OUTPUT_FORMAT`
  instead of the impossible literal `"mp3"` while the local public audio format
  is configured as WAV.
- Status: local-only, not deployed.
- Validation run:
  - `npx tsc --noEmit` passed.
  - `npm run lint` passed with 0 errors and 82 pre-existing warnings.
  - `npm run build` passed.
  - `npm run db:check` did not run successfully because local `DATABASE_URL`
    is not a Supabase/Postgres URL.
- Important: source still currently conflicts with older memory/product rules
  about public audio format (`PROJECT_MEMORY.md` says MP3-only, current source
  is WAV). Resolve MP3 vs WAV before deployment.

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
