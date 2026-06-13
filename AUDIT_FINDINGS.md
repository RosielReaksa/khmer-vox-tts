# Audit Findings — Khmer Vox TTS

Audit date: **2026-06-10**. Method: read actual source (not docs), `npm run build`, `tsc`, ESLint.
Purpose: load this in a new chat instead of re-running a full audit. **Re-verify before trusting** —
code changes after the date above invalidate specific file:line references. Findings still OPEN unless
this file says FIXED (with a commit/date).

## Verified baseline (2026-06-10)
- `npm run build` → PASS (exit 0, 78 routes, ~16s). `tsc --noEmit` → clean. ESLint → 0 errors, 67 warnings (unused-var noise, incl. `scratch/`).
- KHQRcc payment migration is functionally complete: real API integration in `lib/khqrcc.ts` (live fetch to 3 endpoints, SHA1 request hash, SHA256 timing-safe webhook verify), no stubs/TODOs. Safe to commit.
- At audit time: ~45 uncommitted files, 2 commits total. `.env` is gitignored (confirm it was never committed).

## OPEN findings, severity-ranked

### CRITICAL
**C1 — SSRF via batch `webhook_url`.** `lib/batch-service.ts:86-110` (`normalizeWebhookCallbackUrl`) validates only protocol + rejects credentials; **no IP/host filtering**. User-supplied URL reaches `fetch` in `postJsonWithTimeout` (`:568-581`), delivered at `:643-647`. Reachable internal targets: `http://web:3000`, `*.svc.cluster.local`, `169.254.169.254`, localhost. Response body captured into `responsePreview` (`:583`, called `:649`) and stored on job, readable by owner → blind SSRF becomes partial internal-response read. Prod HTTPS-only rule limits but doesn't close (TLS internal svcs + redirect downgrade). **Fix:** resolve host → reject RFC1918/link-local/loopback/metadata IPs before fetch; `redirect: "manual"` + re-validate hops.
  **FIXED 2026-06-11:** Added `lib/ssrf-guard.ts` (`safeFetch`) — resolves DNS, blocks metadata/RFC1918/loopback/CGNAT/multicast + IPv6 link-local/ULA/IPv4-mapped + internal hostnames (`localhost`, dotless svc names, `*.svc.cluster.local`, `.internal`, `.local`), and re-validates every redirect hop with `redirect:"manual"`. Wired into `batch-service.ts` and `business-webhook-test.ts` delivery. Guard on in prod, off in dev (override via `WEBHOOK_SSRF_GUARD`). Verified: tsc/lint/build clean + 25/25 predicate test cases. Local-only, not yet deployed.

**C2 — Command injection in Modal deployer.** `lib/modal-deployer.ts:263-267,354-357,401-405,433-437` spawn `modal` CLI with `{ shell: true }` and user args (`tokenId`, `tokenSecret`, `profile`, `label`, model file) validated only `z.string().min(1)` (`app/api/admin/modal/deploy/route.ts:11-19`) — no charset limit → RCE (e.g. `x; curl evil/$(cat /etc/passwd)`). **Admin-only** (route gated `:21-30`), so it's "compromised admin → host RCE". **Fix:** drop `shell: true` (args already array) or validate `^[A-Za-z0-9._-]+$`.
  **FIXED 2026-06-11:** Route now enforces strict charset regexes + length caps on `tokenId`/`tokenSecret`/`profile`/`modelFile`; `modal-deployer.ts` also runs `assertSafeModalArg` before every `spawn` (covers the unvalidated undeploy query-param path). `shell:true` kept for Windows `modal.cmd` resolution; injection closed by validation. Verified: tsc/lint/build clean. Local-only, not yet deployed. Note: route regex is a new input contract — confirm real token IDs/secrets fit `[A-Za-z0-9._:-]`.

### HIGH
**H1 — `isBusiness` client-controlled at key creation.** `app/api/keys/route.ts:14,70,78-82` reads `isBusiness` from request body with no server check that user holds business approval. Non-business user POSTs `{"isBusiness":true}` → business limits resolve `null` → **per-key concurrency/queue caps bypassed**. **Fix:** ignore/reject `isBusiness` unless `apiAccess.businessLimits` non-null.

### MEDIUM
- **M1 — Batch lease key omits jobId.** `lib/batch-service.ts:735` key = `batch:${userId}:${mode}:${source}`. Single job is safe (cap at `:857` = `min(BATCH_ITEM_CONCURRENCY||3, policy.maxConcurrent)`). But 2 jobs/same user (or a double-processed job) each try to consume full budget → `TOO_MANY_CONCURRENT_REQUESTS` → backoff 30s×10 (`:761-767`, max retries `:45`) → re-queue (`:884-894`). Stale leases after crash linger up to 1h (`rate-limit.ts:105-115`). **Fix:** scope key to `jobId`; acquire batch budget once and hold for the run.
- **M2 — Job double-*processing* (not double-charge).** `processBatchJob` claims only when `status==="queued"` (`:830-836`); an already-`running` job falls through and is processed again by another `kickBatchWorker` caller. Item claims are atomic CAS (`postgres-store.ts:2627` `UPDATE...WHERE id AND status='queued' RETURNING`) so **no double-charge** — just wasted runs amplifying M1. **Fix:** bail on non-terminal non-queued status unless caller owns it / heartbeat stale.
- **M3 — No overall TTS timeout.** `tts-provider.ts:765` = 90s **per chunk**; long text = sequential chunks (`:907-914`) → 90s × N can exceed platform function limit.
  **FIXED 2026-06-10:** Root cause was worse than "no overall timeout" — a per-request timeout/abort was treated as an endpoint-health failure and disabled the endpoint for a full 5 min (`tts-endpoints.ts:15`). One long-text job (many sequential chunks) cold-starting Modal disabled the **entire pool**, breaking generation for everyone for 5 min. Fix: timeouts now get a 15s cooldown (not 5 min) via a new `cooldownMs` arg to `disableEndpoint`; per-request timeout is configurable `TTS_UPSTREAM_TIMEOUT_MS` (default raised 90s→180s). Genuine network/5xx errors still get the full 5-min disable. Verified with a deterministic cooldown-logic test (7/7) — not yet verified against live Modal.
- **M4 — Admin modal page lacks server check.** `app/app/admin/modal/page.tsx` is `"use client"`, no server `isAdminEmail` gate — protected only by `proxy.ts:194-199` middleware (single layer). All 28 `/api/admin/**` routes DO enforce server-side. CSRF allowlist trusts `Host` header (`proxy.ts:162-165`); no-Origin+no-Referer requests pass (`:167,:174`); cookie `sameSite:"lax"` blunts it.

### LOW
- Partial/failure refund is best-effort, non-atomic, only `console.error` on failure → silent overcharge possible (`generation-service.ts:321-336,354-364`).
- Successful audio discarded (no delivery) when extra charge unaffordable / duration over cap (`generation-service.ts:263-269,283-290`).
- 7-day session token, no rotation/revocation list — leaked token valid until expiry.
- KHQRcc webhook signature fail-open only when secret unset AND non-prod (`khqrcc.ts:427`); prod 503s (fail-closed). Low because webhook re-verifies server-side anyway.

## Payment crediting — AUDITED CLEAN (no critical/high)
All credits funnel through 2 store fns, both `SELECT ... FOR UPDATE` + same-transaction status guard + credit insert (atomic, no check-then-act gap):
- `confirmPaymentOrderPaid` (`postgres-store.ts:3560-3681` / `json-store.ts:1661-1742`) — KHQRcc webhook, verify, Telegram auto-approve.
- `approvePaymentOrder` (`postgres-store.ts:3700-3757`) — admin + Telegram button.

Verified correct: idempotent (row lock + status guard `:3586`, unique index `provider_transaction_id` `:327-329`); amount/currency checked inside lock (`paymentAmountMatches` `:3540-3546`, order price server-set at creation `orders/route.ts:65-93`); webhooks **never trust payload** — re-call KHQRcc API server-side before crediting (`webhooks/khqrcc/route.ts:140` → `khqrcc.ts:320-364`); browser verify endpoint session+ownership gated, re-verifies server-side (`payments/orders/[id]/verify/route.ts:13-22,84`) — browser cannot self-credit. JSON store dev-only, serialized via `mutationQueue`.
By-design notes: admin/Telegram-button approve credits WITHOUT amount check (trusts human). Empty `KHQRCC_SECRET_KEY` in prod → webhooks 503 (verify + admin paths still credit; degraded, not money loss). Telegram bank-text auto-approve gated + `TELEGRAM_PAYMENT_AUTO_APPROVE` defaults false.

## Done correctly (don't re-flag)
Sessions httpOnly/sameSite, `SESSION_SECRET` required in prod (`session.ts:16-18` throws). API keys 192-bit random, SHA-256 stored, shown once, never logged (`security.ts:14-24`, `keys/route.ts:102`). Free-tier API access blocked at creation + every request (`api-access.ts`, `api-key-auth.ts:43-50`). Rate limiting fail-closed in prod, memory fallback dev-only (`rate-limit.ts:181-183,394,401`). Parameterized SQL throughout — no injection. No secret leakage in logs / admin test route.

## Suggested fix order
1. Commit working tree (de-risk uncommitted work). 2. C1 SSRF guard. 3. C2 drop `shell:true`. 4. H1 `isBusiness`. 5. M1+M2 batch worker.

## Not yet audited (gaps in this pass)
`modal/` and `sdk/` dirs; frontend `.tsx` clients; app not run live (logs only); detailed review of `generation-service.ts` chunking math.
