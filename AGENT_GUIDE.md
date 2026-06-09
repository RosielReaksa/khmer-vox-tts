# Khmer Vox TTS — Agent Handover & Project Guide

This document is designed to bring any new AI coding agent or developer up to speed on the **Khmer Vox TTS** repository. It outlines the codebase structure, tech stack, service architecture, recent security refactors, and commands to run/test the application.

---

## 1. Project Overview & Tech Stack
**Khmer Vox TTS** is a premium Next.js platform that provides text-to-speech (TTS) synthesis and custom voice cloning specifically designed for the Khmer language.

* **Core Stack**: Next.js 16.2.6 (using Turbopack & App Router), Node.js 22, TypeScript, TailwindCSS v4, PostgreSQL (`pg` native client).
* **AI/TTS Orchestration**: Interacts with backend GPU models deployed on the **Modal** cloud platform.
* **Conversion Engine**: Uses local system **FFmpeg** to transcode output speech streams (WAV to MP3) and merge multiple chunk files.
* **Payments/Billing**: Integrates Bakong KHQR and ABA PayWay webhooks for automated token purchasing and account credits.

---

## 2. Directory Structure & Key Files
* [`app/`](file:///d:/website%20api%20seller/app): Next.js App Router containing public pages, dashboard SPA screens, and API endpoints:
  * [`app/api/v1/audio/speech/route.ts`](file:///d:/website%20api%20seller/app/api/v1/audio/speech/route.ts): Endpoint for preset voice speech synthesis.
  * [`app/api/v1/audio/clone/route.ts`](file:///d:/website%20api%20seller/app/api/v1/audio/clone/route.ts): Endpoint for custom voice cloning.
  * [`app/api/admin/modal/route.ts`](file:///d:/website%20api%20seller/app/api/admin/modal/route.ts): Handles Modal profile listings and account configurations.
* [`lib/`](file:///d:/website%20api%20seller/lib): Core business logic modules:
  * [`lib/tts-provider.ts`](file:///d:/website%20api%20seller/lib/tts-provider.ts): Main speech generator wrapper. Handles round-robin load-balancing over Modal profiles, health checks, character chunking (splits text to 400-char blocks), parallel synthesis, and FFmpeg MP3 transcoding.
  * [`lib/modal-accounts.ts`](file:///d:/website%20api%20seller/lib/modal-accounts.ts): Connects to the Modal CLI to fetch profile lists, cost reports, credit updates, and alerts low-credit accounts over Telegram.
  * [`lib/modal-deployer.ts`](file:///d:/website%20api%20seller/lib/modal-deployer.ts): Deploys upstream models (`modal deploy`) and checks active deployment status.
* [`deploy/`](file:///d:/website%20api%20seller/deploy): K3s / Kubernetes deployment files (e.g., [`deploy/k3s/voxtts.yaml`](file:///d:/website%20api%20seller/deploy/k3s/voxtts.yaml)).
* [`modal/`](file:///d:/website%20api%20seller/modal): Upstream TTS Python definitions (`modal_voxcpm_api.py`).
* [`scratch/`](file:///d:/website%20api%20seller/scratch): Test suites, DB seeds, and playground scripts:
  * [`scratch/test-api-voices.mjs`](file:///d:/website%20api%20seller/scratch/test-api-voices.mjs): Live local API smoke test script.
  * [`scratch/seed-admin.mjs`](file:///d:/website%20api%20seller/scratch/seed-admin.mjs): Seeds initial administrator accounts.
* [`database/schema.sql`](file:///d:/website%20api%20seller/database/schema.sql): PostgreSQL SQL schema definition.
* [`scripts/db.mjs`](file:///d:/website%20api%20seller/scripts/db.mjs): Schema deployment and database check helper.

---

## 3. Database & Local Services Configuration
* **PostgreSQL Connection**: Configured using `DATABASE_URL` in `.env`.
* **Upstream Accounts config**: Set up via `TTS_UPSTREAM_POOL` array or single legacy `TTS_UPSTREAM_URL` endpoints.
* **Modal Config Path**: Specified via `MODAL_CONFIG_PATH` variable pointing to `data/.modal.toml` locally, containing Modal auth tokens.

---

## 4. Key Security & Build Fixes Implemented
The project has recently undergone rigorous security sanitation and compilation tuning. Here are the core results that must be maintained:

### A. Fallback Secrets and Credentials Removed
* **Modal Deployer**: [`lib/modal-deployer.ts`](file:///d:/website%20api%20seller/lib/modal-deployer.ts) no longer contains any hardcoded fallback tokens/keys. It attempts to load `process.env.VOXCPM_API_KEY`, falls back to local file checks, and fails cleanly without crashing the thread if missing.
* **Deleted Files**: Cleaned up active credentials from the version control index:
  - Deleted `deploy/k3s/voxtts-populated.yaml`
  - Deleted `modal/NEW_VOXCPM_API_KEY.txt`
  - Deleted `data/tts-upstream-pool.json`
* **Template Sanitation**: Replaced real keys in [`deploy/k3s-deployment.yml`](file:///d:/website%20api%20seller/deploy/k3s-deployment.yml) and [`deploy/k3s/voxtts.yaml`](file:///d:/website%20api%20seller/deploy/k3s/voxtts.yaml) with clean placeholder strings.
* **Recursive Modal Ignores**: Added `**/.modal.toml` to both [`.gitignore`](file:///d:/website%20api%20seller/.gitignore) and [`.dockerignore`](file:///d:/website%20api%20seller/.dockerignore) to guarantee Modal authorization secrets are never leaked into git history or compiled into production Docker images.

### B. Turbopack Warning Cleanup & ESM Compliance
* **ESM Compliance**: Restored native static imports (e.g. `import { existsSync } from 'fs'`) and standard calls. Verified lint pass (`npm run lint`) produces **0 errors** (satisfying the `@typescript-eslint/no-require-imports` rule).
* **Turbopack Trace Bypass**: Scoped runtime `process.cwd()` folder lookups using the exact path prefix style recognized by Next.js compilers:
  ```typescript
  path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "filename")
  ```
  This prevents Turbopack from tracing the root directory and bundling the whole workspace.
* **Build Excludes**: Configured `outputFileTracingExcludes` inside [`next.config.ts`](file:///d:/website%20api%20seller/next.config.ts) to explicitly filter out development logs (`*.log`), images (`*.jpg`), `artifacts/`, and `scratch/` folders from the standalone `.next/standalone` production bundle.

---

## 5. Development & Testing Workflow

### A. Verification Commands
```bash
# Check TypeScript and build correctness
npm run build

# Run project linter checks
npm run lint

# Verify database connection and schema
npm run db:check
```

### B. Running a Local Smoke Test
1. Make sure Docker is running on the host machine.
2. Spin up the local database container:
   ```bash
   docker start khmer-vox-postgres
   ```
3. Run the API voice test script:
   ```bash
   node scratch/test-api-voices.mjs
   ```
   *Expected Output*: Displays synthesis progress for preset `female` and `male` voices, outputs HTTP status 200, checks credits deduction, and prints `Success! Received XXXXX audio bytes.` before cleaning up.

---

## 6. VPS Deployment Architecture & Options

To deploy this project to a production VPS, the architecture requires running **two distinct processes**:
1. **Web Server (`web`)**: Runs the Next.js API & UI standalone server. Handles user requests, authenticates keys, tracks limits, and manages billing webhooks.
2. **Background Job Worker (`worker`)**: A long-running daemon (`node scripts/job-worker.mjs --loop`) that pulls from the Postgres queue to process batch synthesis requests and custom voice cloning pipelines.

There are three main options configured in the codebase to achieve this on a VPS:

### Option A: Docker Compose (Recommended)
This uses Docker Compose to manage both processes and ensures system packages like **FFmpeg** and **Python3/Modal** are pre-packaged.
* **Manifest**: [`docker-compose.production.example.yml`](file:///d:/website%20api%20seller/docker-compose.production.example.yml)
* **Setup Steps**:
  1. Copy the production environment file:
     ```bash
     cp deploy/production.env.example deploy/production.env
     ```
  2. Populate `deploy/production.env` with your secrets and connection tokens.
  3. Run database migrations:
     ```bash
     docker compose -f docker-compose.production.example.yml --env-file deploy/production.env run --rm web npm run db:setup
     ```
  4. Spin up the production containers:
     ```bash
     docker compose -f docker-compose.production.example.yml --env-file deploy/production.env up -d
     ```

### Option B: PM2 (Process Manager)
An alternative if you prefer to deploy directly on the host OS without containerization.
* **Manifest**: [`deploy/pm2.ecosystem.config.cjs`](file:///d:/website%20api%20seller/deploy/pm2.ecosystem.config.cjs)
* **Setup Steps**:
  1. Install host requirements: `sudo apt install ffmpeg python3 python3-pip`.
  2. Install dependencies and build:
     ```bash
     npm ci
     npm run build
     ```
  3. Run database migrations: `npm run db:setup`.
  4. Start the PM2 daemon:
     ```bash
     pm2 start deploy/pm2.ecosystem.config.cjs
     ```
  *Note*: Ensure `DISABLE_INLINE_JOB_WORKER=true` is set on the web server instance to offload job processing entirely to the worker process.

### Option C: K3s (Kubernetes)
For clustered container orchestration on a lightweight VPS Kubernetes engine.
* **Manifest**: [`deploy/k3s/voxtts.yaml`](file:///d:/website%20api%20seller/deploy/k3s/voxtts.yaml)
* **Details**: Contains unified resource templates (Namespace, Ingress with Traefik rules, Postgres PersistentVolumeClaims/Services/Deployments, ConfigMaps, and Pod specs for both `voxtts-web` and `voxtts-worker`).
* **Secrets Management**: Secrets are fed dynamically via the `khmer-vox-secrets` Kubernetes resource, decoupling active credentials from the template file.

