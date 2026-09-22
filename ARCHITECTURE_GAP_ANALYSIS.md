# Architecture Gap Analysis

> TFDevs Reference Diagram vs Khmer Vox TTS (voxtts.online)
>
> Created: 2026-06-23

This document compares the reference deployment architecture from the diagram with
your current production setup. Each gap is marked with a priority and notes on
what would be needed to close it.

---

## 1. Traffic Ingestion & CDN

| Component | Diagram | Your Current | Gap? |
|---|---|---|---|
| DNS | Cloudflare | External (not managed in repo) | **Unknown** |
| CDN | Cloudflare CDN | None visible | **YES** |
| DDoS Protection | Cloudflare DDoS | None visible | **YES** |
| WAF | Cloudflare WAF | None visible | **YES** |
| TLS Termination | Terminated at Cloudflare | Traefik Ingress (TLS on cluster) | **YES** |

### Priority: HIGH

**What you have:** Traefik handles TLS termination inside K3s. No external CDN
or DDoS protection layer is visible in the codebase or deployment manifests.

**What the diagram adds:**
- Cloudflare sits in front of everything
- TLS is terminated at the edge (Cloudflare), not on the cluster
- Cloudflare provides DDoS mitigation, WAF rules, and caching
- Outbound Cloudflare Tunnel sends encrypted traffic back to your homelab

**Impact:** Without a CDN/WAF, your origin server is directly exposed to
internet traffic. All TLS handshakes, static asset serving, and DDoS mitigation
must be handled by your VPS. Cloudflare would offload all of this.

**To fix:**
1. Sign up for Cloudflare and point your DNS there
2. Create a Cloudflare Tunnel (cloudflared) on your VPS pointing to localhost
3. Disable Traefik TLS and let Cloudflare handle HTTPS
4. Configure WAF rules and caching in Cloudflare dashboard

---

## 2. Reverse Proxy / Gateway

| Component | Diagram | Your Current | Gap? |
|---|---|---|---|
| Gateway VM | Nginx (HTTP only, no TLS) | Traefik (K3s built-in, handles TLS) | **YES** |
| Security Headers | Injected by Nginx | Injected by Next.js middleware | **Different** |
| Rate Limiting | Optional at gateway | PostgreSQL-based in-app rate limiting | **Different** |
| Reverse Proxy | Nginx to cluster | Traefik routes directly to K3s services | **Different** |

### Priority: MEDIUM

**What you have:** Traefik is the K3s built-in ingress controller. It handles
TLS, routing, and traffic forwarding in a single layer. Security headers are
injected by Next.js middleware (`next.config.ts`).

**What the diagram adds:**
- A separate Nginx VM sits between Cloudflare and K3s
- Nginx is HTTP-only (TLS already terminated at Cloudflare)
- Nginx provides an additional reverse-proxy layer, security header injection,
  and optional rate limiting before traffic hits the cluster
- This creates a clear separation between "edge" (Cloudflare) and "cluster" (K3s)

**Impact:** The diagram's approach is more defense-in-depth. Your current setup
is simpler (fewer hops = lower latency) but puts all proxy logic in one place
(Traefik).

**To fix:**
1. Deploy a small Nginx VM (or container) outside K3s
2. Configure it as a reverse proxy to the Traefik NodePort
3. Move security headers and rate limiting to Nginx
4. Connect Cloudflare Tunnel to this Nginx gateway

---

## 3. Ingress Controller

| Component | Diagram | Your Current | Gap? |
|---|---|---|---|
| Technology | K3s + Traefik | K3s + Traefik | **MATCH** |
| Host/Path Routing | Yes | Yes (Ingress resource) | **MATCH** |
| Service Discovery | Yes | Yes (K8s DNS) | **MATCH** |
| SSL Passthrough | Optional | Not configured | **Minor** |

### Priority: NONE (already matches)

Your K3s + Traefik ingress matches the diagram exactly. This is the one layer
that is fully aligned.

---

## 4. Application Services

| Component | Diagram | Your Current | Gap? |
|---|---|---|---|
| Web/SSR Service | NuxtJS Pod (SSR) | Next.js Pod (SSR) | **Different framework** |
| API Service | Separate API Pod | Part of Next.js app (/api/*) | **YES — monolith** |
| Static/Asset Service | Separate Nginx Pod | Served by Next.js (/_next/static) | **YES — monolith** |

### Priority: MEDIUM

**What you have:** A single Next.js monolith handles web pages, API routes, and
static assets. One Docker image, one deployment, one process. This is actually
a strength for your scale — fewer moving parts, simpler deployment.

**What the diagram shows:**
- Three separate pods: SSR (NuxtJS), API, and Static/Asset (Nginx)
- Each can scale independently
- Static assets are served by a dedicated Nginx pod (fast, no SSR overhead)

**Impact:** At your current traffic level, the monolith is fine. The diagram's
separation would only matter at high scale where you need independent scaling.
However, separating static assets to Nginx could reduce Next.js server load.

**Recommendation:** Keep the monolith for now. Split later when traffic demands it.

---

## 5. Database

| Component | Diagram | Your Current | Gap? |
|---|---|---|---|
| Technology | PostgreSQL / MySQL | PostgreSQL 16 | **MATCH** |
| Storage | PersistentVolume | PersistentVolumeClaim (10Gi) | **MATCH** |
| Replicas | Not specified | 1 replica | **Single point of failure** |

### Priority: LOW

**Match:** PostgreSQL is your production database, deployed as a K3s pod with a
PersistentVolumeClaim.

**Gap:** Only 1 replica. If the pod dies, the database is unavailable.

**To fix:**
1. Consider a managed PostgreSQL service (Supabase, DigitalOcean Managed DB)
2. Or set up PostgreSQL primary-replica with streaming replication
3. At minimum, ensure backup strategy is solid

---

## 6. Cache / Session Store

| Component | Diagram | Your Current | Gap? |
|---|---|---|---|
| Technology | Redis | JWT cookie + Upstash Redis (optional) | **Partially exists** |
| Session Storage | Redis | Stateless JWT (httpOnly cookie) | **Different approach** |
| Dashboard Cache | Not specified | Upstash Redis (optional, memory fallback) | **Partially exists** |

### Priority: LOW

**What you have:**
- Sessions are stateless JWTs (no server-side session store needed)
- Rate limiting uses PostgreSQL rate_limit_buckets table
- Dashboard count caching uses optional Upstash Redis (REST API)
- Falls back to in-memory cache if Redis unavailable

**Impact:** Your stateless JWT approach is more cloud-native than server-side
sessions. Upstash Redis integration already exists. Just needs env vars.

**To fix:** Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars.

---

## 7. Object Storage

| Component | Diagram | Your Current | Gap? |
|---|---|---|---|
| Technology | MinIO / S3 | DigitalOcean Spaces (S3-compatible) | **Similar** |
| Purpose | File/object storage | Audio file storage (WAV clips) | **MATCH** |

### Priority: NONE (already covered)

DigitalOcean Spaces is S3-compatible object storage. Same purpose as MinIO/S3.

---

## 8. Message Queue

| Component | Diagram | Your Current | Gap? |
|---|---|---|---|
| Technology | RabbitMQ / NATS | PostgreSQL-based job queue | **YES** |
| Purpose | Async job processing | Batch TTS job queue + worker | **Different implementation** |

### Priority: MEDIUM

**What you have:** Batch jobs use a PostgreSQL table as the queue. The worker
process polls the database for pending jobs.

**What the diagram shows:** Dedicated message queue (RabbitMQ or NATS) with
built-in retry, dead-letter queues, and message acknowledgment.

**Impact:** PostgreSQL-as-queue works at your current scale. Becomes a bottleneck
at high job volume (~100+ concurrent).

**Recommendation:** Keep PostgreSQL queue for now. Switch to RabbitMQ only if
batch job volume exceeds 100 concurrent jobs.

---

## 9. Monitoring & Logging

| Component | Diagram | Your Current | Gap? |
|---|---|---|---|
| Metrics | Prometheus | None | **YES — missing** |
| Dashboards | Grafana | None | **YES — missing** |
| Log Aggregation | Loki | None | **YES — missing** |
| Alerting | Prometheus AlertManager | Telegram bot alerts (manual) | **YES — basic only** |

### Priority: HIGH

**What you have:**
- /api/health endpoint returns basic status
- Telegram bot sends payment alerts
- Admin dashboard shows system status
- No metrics collection, no dashboards, no log aggregation

**What the diagram shows:**
- Prometheus scrapes metrics from all services
- Grafana provides visual dashboards
- Loki aggregates logs from all pods
- Full observability stack

**Impact:** Without monitoring, you are flying blind. You will not know about
performance degradation, error spikes, or resource exhaustion until users report.

**To fix:**
1. Deploy Prometheus (K3s Helm chart)
2. Deploy Grafana with pre-built dashboards
3. Deploy Loki + Promtail for log aggregation
4. Add Prometheus metrics endpoints to Next.js app
5. Configure alert rules (pod restarts, error rate, DB pool)

**Quick win:** At minimum, deploy Prometheus + Grafana. Add Loki later.

---

## 10. Supporting Services

| Component | Diagram | Your Current | Gap? |
|---|---|---|---|
| Backups | Mentioned | voxtts-backup script exists | **Partial** |
| Updates | Mentioned | Manual Docker build + kubectl | **YES — manual** |
| Security Scanning | Mentioned | None visible | **YES — missing** |
| Observability | Mentioned | Basic health check only | **YES — minimal** |

### Priority: MEDIUM

**To fix:**
1. Add K3s CronJob for daily PostgreSQL backups
2. Set up GitHub Actions CI/CD (build, scan, push, deploy)
3. Add trivy or snyk for container image scanning
4. Add npm audit to build pipeline

---

## Summary: Priority-Ordered Gaps

| # | Gap | Priority | Effort | Impact |
|---|---|---|---|---|
| 1 | **CDN + DDoS** (Cloudflare) | HIGH | Medium | Protects origin, global performance |
| 2 | **Monitoring** (Prometheus + Grafana) | HIGH | Medium | System health visibility |
| 3 | **Separate API + Static Pods** | MEDIUM | Low | Independent scaling |
| 4 | **Nginx Gateway Layer** | MEDIUM | Low | Defense-in-depth |
| 5 | **Message Queue** (RabbitMQ) | MEDIUM | High | Better batch throughput at scale |
| 6 | **CI/CD Pipeline** (GitHub Actions) | MEDIUM | Medium | Automated builds and deploys |
| 7 | **Automated Backups** (CronJob) | MEDIUM | Low | Reliable daily backups |
| 8 | **Security Scanning** | MEDIUM | Low | Catch vulnerabilities |
| 9 | **Redis for Caching** | LOW | Low | Already integrated, just env vars |
| 10 | **PostgreSQL Replicas** | LOW | High | DB failover (only at scale) |

---

## What You Already Have That the Diagram Does Not Show

These are strengths of your current architecture that the generic diagram
does not capture:

1. **GPU Pre-warming** — On-demand Modal GPU spin-up to reduce cold starts
2. **Multi-account Load Balancing** — Round-robin across 3+ Modal endpoints
3. **Telegram Payment Ops** — Real-time payment alerts and approval via Telegram
4. **Idempotent Token Crediting** — Exactly-once billing with webhook verification
5. **WAV Audio Delivery** — Lossless PCM-16 output (no generic diagram covers this)
6. **Batch Job Worker** — Background processing with retry and stuck-job recovery
7. **Admin Dashboard** — Customer management, payment review, Modal monitoring
8. **Auto-segmented Long Text** — Splits long input for parallel synthesis
9. **Speech Text Sanitizer** — Cleans input text before synthesis
10. **Voice Consent Tracking** — Records user consent for voice cloning

---

## Recommended Build Order

### Phase 1: Protection (Week 1)
- [ ] Set up Cloudflare (DNS, SSL, DDoS, WAF)
- [ ] Deploy Prometheus + Grafana basic monitoring

### Phase 2: Infrastructure (Week 2)
- [ ] Add Nginx gateway layer (optional, depends on Cloudflare setup)
- [ ] Set up automated PostgreSQL backups (K3s CronJob)
- [ ] Add container image scanning to build process

### Phase 3: Application (Week 3)
- [ ] Separate static assets to dedicated Nginx pod (optional)
- [ ] Add CI/CD pipeline (GitHub Actions)
- [ ] Enable Upstash Redis for dashboard caching

### Phase 4: Scale (When Needed)
- [ ] Deploy RabbitMQ for job queue (when batch volume > 100 concurrent)
- [ ] Add PostgreSQL replicas (when database becomes bottleneck)
- [ ] Add Loki + Promtail for log aggregation
