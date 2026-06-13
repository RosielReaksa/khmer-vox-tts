"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useAdminCachedJson } from "@/app/app/admin/admin-data-cache";
import {
  AdminPanelSkeleton,
  formatDate,
  InlineAdminError,
  MetricCard,
} from "@/app/app/admin/admin-shared";
import type { BatchJobWebhookAttemptWithUser, BatchJobWithUser, BatchQueueHealth } from "@/lib/store";
import type { BatchJobStatus, WorkerHeartbeatRecord, BatchJobItemRecord } from "@/lib/types";

type AdminJobsData = {
  jobs: BatchJobWithUser[];
  webhookAttempts: BatchJobWebhookAttemptWithUser[];
  queueHealth: BatchQueueHealth;
  workerHeartbeats: WorkerHeartbeatRecord[];
  modalPool: ModalPoolHealth;
  generatedAt: string;
};

type ModalPoolHealth = {
  total: number;
  available: number;
  blocked: number;
  endpoints: Array<{
    label: string;
    host: string;
    blocked: boolean;
    cooldown_reason: string | null;
    cooldown_expires_at: string | null;
    total_requests: number;
    success_rate: number | null;
    average_latency_ms: number | null;
    failed_requests: number;
  }>;
};

type AudioCleanupResult = {
  cutoffAt: string;
  retentionDays: number;
  dryRun: boolean;
  limit: number;
  batchItemsCleared: number;
  generationsCleared: number;
  cloneSamplesCleared: number;
  estimatedBytesReleased: number;
};

const statusOptions: Array<BatchJobStatus | "all"> = [
  "all",
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "needs_review",
];

export function AdminJobsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = statusOptions.includes(searchParams.get("status") as BatchJobStatus | "all")
    ? (searchParams.get("status") as BatchJobStatus | "all")
    : "all";
  const q = searchParams.get("q")?.trim() ?? "";
  const workerNotice = searchParams.get("worker") ?? "";
  const url = useMemo(
    () => `/api/admin/jobs?status=${encodeURIComponent(status)}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    [q, status],
  );
  const [message, setMessage] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const { data, error, loading, refreshing, refresh } = useAdminCachedJson<AdminJobsData>(
    `admin:jobs:${status}:${q}`,
    url,
    { pollMs: 8_000, staleMs: 8_000 },
  );

  if (loading && !data) return <AdminPanelSkeleton label="Loading worker queue" />;

  const jobs = data?.jobs ?? [];
  const webhookAttempts = data?.webhookAttempts ?? [];
  const queueHealth = data?.queueHealth ?? emptyHealth();
  const workerHeartbeats = data?.workerHeartbeats ?? [];
  const modalPool = data?.modalPool ?? emptyModalPool();
  const queued = jobs.filter((job) => job.status === "queued").length;
  const active = jobs.filter((job) => job.status === "running").length;
  const completed = jobs.filter((job) => job.status === "completed").length;
  const partial = jobs.filter((job) => job.status === "partial").length;
  const failed = jobs.filter((job) => job.status === "failed").length;
  const needsReview = jobs.filter((job) => job.status === "needs_review").length;
  const retryableJobs = jobs.filter(
    (job) => job.status === "failed" || job.status === "partial" || job.status === "needs_review",
  );
  const files = jobs.reduce((sum, job) => sum + job.completedItems, 0);

  async function runAction(action: string, payload: Record<string, unknown> = {}) {
    setActionLoading(action);
    setMessage("");
    try {
      const response = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = (await response.json()) as {
        error?: string;
        worker?: string;
        retried?: number;
        cleanup?: AudioCleanupResult;
      };
      if (!response.ok) {
        setMessage(result.error ?? "Worker action failed.");
        return;
      }
      setMessage(formatWorkerNotice(result.worker, result.cleanup));
      await refresh();
    } catch {
      setMessage("Network error while running worker action.");
    } finally {
      setActionLoading("");
    }
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextStatus = String(form.get("status") ?? "all");
    const nextQ = String(form.get("q") ?? "").trim();
    router.push(`/app/admin/jobs?status=${encodeURIComponent(nextStatus)}${nextQ ? `&q=${encodeURIComponent(nextQ)}` : ""}`);
  }

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[34px] font-headline font-black uppercase text-primary">Batch Jobs</h1>
          <p className="mt-1 text-sm font-body text-primary/70">
            Cached worker queue monitor with manual GPU queue controls.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-none border-2 border-primary bg-white px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
        >
          {refreshing ? "Refreshing..." : `Cached ${data ? formatDate(data.generatedAt) : ""}`}
        </button>
      </div>

      {error ? <InlineAdminError message={error} /> : null}
      {message || workerNotice ? (
        <p className="rounded-none border-2 border-primary bg-emerald-50 px-4 py-3 text-sm font-headline font-bold uppercase text-emerald-950">
          {message || formatWorkerNotice(workerNotice)}
        </p>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-8">
        <MetricCard label="Shown" value={jobs.length.toLocaleString()} note="Latest 200 max" />
        <MetricCard label="Queued" value={queued.toLocaleString()} note={`${queueHealth.readyQueuedJobs.toLocaleString()} ready now`} />
        <MetricCard label="Running" value={active.toLocaleString()} note="Worker active" />
        <MetricCard label="Stuck" value={queueHealth.stuckJobs.toLocaleString()} note="Past timeout" />
        <MetricCard label="Completed" value={completed.toLocaleString()} note="All lines done" />
        <MetricCard label="Partial" value={partial.toLocaleString()} note="Some lines failed" />
        <MetricCard label="Failed" value={failed.toLocaleString()} note="No lines completed" />
        <MetricCard label="Needs Review" value={needsReview.toLocaleString()} note="Dead letter queue" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
        <WorkerHealthCard health={queueHealth} />
        <WorkerHeartbeatTable heartbeats={workerHeartbeats} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <ModalPoolCard pool={modalPool} />
        <div className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
          <h2 className="text-2xl font-headline font-black uppercase text-primary">Modal Pool Control</h2>
          <p className="mt-1 max-w-[360px] text-sm font-body text-primary/70">
            Clear temporary endpoint cooldowns after fixing a Modal account or adding credits.
          </p>
          <div className="mt-4">
            <ActionButton
              loading={actionLoading === "reset_modal_pool"}
              variant="secondary"
              onClick={() => void runAction("reset_modal_pool")}
            >
              Reset Modal Cooldowns
            </ActionButton>
          </div>
        </div>
      </section>

      <section className="grid gap-3 rounded-none border-3 border-primary bg-[#faf7f2] p-5 lg:grid-cols-[1fr_auto] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <div>
          <h2 className="text-2xl font-headline font-black uppercase text-primary">Worker Queue Controls</h2>
          <p className="mt-1 text-sm font-body text-primary/70">
            Trigger one job, recover stuck jobs, or retry failed visible jobs without leaving the cached admin panel.
          </p>
          <p className="mt-2 text-sm font-body font-semibold text-primary">
            {queued.toLocaleString()} queued, {active.toLocaleString()} running, {files.toLocaleString()} files completed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <ActionButton loading={actionLoading === "process_next"} onClick={() => void runAction("process_next")}>
            Process Next Queued Job
          </ActionButton>
          <ActionButton loading={actionLoading === "recover_stuck"} variant="secondary" onClick={() => void runAction("recover_stuck")}>
            Recover Stuck Jobs
          </ActionButton>
          <ActionButton
            disabled={retryableJobs.length === 0}
            loading={actionLoading === "retry_jobs"}
            variant="secondary"
            onClick={() => void runAction("retry_jobs", { jobIds: retryableJobs.slice(0, 50).map((job) => job.id) })}
          >
            Retry Failed Visible
          </ActionButton>
          <ActionButton
            loading={actionLoading === "cleanup_audio_storage"}
            variant="secondary"
            onClick={() => void runAction("cleanup_audio_storage", { dryRun: true, retentionDays: 30, limit: 500 })}
          >
            Audit Old Audio
          </ActionButton>
          <ActionButton
            loading={actionLoading === "cleanup_audio_storage"}
            variant="danger"
            onClick={() => {
              if (window.confirm("Clear stored audio payloads older than 30 days? Job records stay, but old audio downloads will be removed.")) {
                void runAction("cleanup_audio_storage", { retentionDays: 30, limit: 500 });
              }
            }}
          >
            Clean Old Audio
          </ActionButton>
          <ActionButton
            disabled={queued === 0 && active === 0}
            loading={actionLoading === "purge_queue"}
            variant="danger"
            onClick={() => {
              if (window.confirm("ARE YOU SURE? This will cancel all queued and running batch jobs!")) {
                void runAction("purge_queue");
              }
            }}
          >
            Purge Queued Queue
          </ActionButton>
        </div>
      </section>

      <section className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <form onSubmit={applyFilters} className="grid gap-3 md:grid-cols-[200px_1fr_auto] font-headline font-bold uppercase text-sm text-primary">
          <label className="grid gap-1">
            Status
            <select name="status" defaultValue={status} className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none focus:bg-surface-container-low font-body text-primary">
              {statusOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            Search
            <input name="q" defaultValue={q} placeholder="Email, job title, model, voice, id" className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none focus:bg-surface-container-low font-body text-primary" />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="rounded-none border-2 border-primary bg-[#ffcc00] px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer">
              Filter
            </button>
            <Link href="/app/admin/jobs" className="rounded-none border-2 border-primary bg-white px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none">
              Clear
            </Link>
          </div>
        </form>
      </section>

      <section className="min-w-0 rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <h2 className="text-2xl font-headline font-black uppercase text-primary">Recent Batch Jobs</h2>
        <div className="mt-4 max-w-full overflow-x-auto rounded-none border-2 border-primary bg-white">
          <JobsTable
            jobs={jobs}
            onRetry={(jobId) => void runAction("retry_job", { jobId })}
            onWebhookRetry={(jobId) => void runAction("retry_webhook", { jobId })}
            onForceProcess={(jobId) => void runAction("process_job", { jobId })}
            onSelectJob={setSelectedJobId}
            actionLoading={actionLoading}
          />
        </div>
      </section>

      <section className="min-w-0 rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <h2 className="text-2xl font-headline font-black uppercase text-primary">Webhook Delivery Attempts</h2>
        <div className="mt-4 max-w-full overflow-x-auto rounded-none border-2 border-primary bg-white">
          <WebhookAttemptsTable attempts={webhookAttempts} />
        </div>
      </section>

      {selectedJobId && (
        <JobDetailModal jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />
      )}
    </section>
  );
}

function ActionButton({
  children,
  disabled = false,
  loading = false,
  onClick,
  variant = "primary",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={`rounded-none border-2 border-primary px-4 py-2 text-sm font-headline font-bold uppercase shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-50 cursor-pointer ${
        variant === "primary"
          ? "bg-[#ffcc00] text-primary"
          : variant === "danger"
            ? "bg-[#ff6666] text-primary"
            : "bg-white text-primary"
      }`}
    >
      {loading ? "Working..." : children}
    </button>
  );
}

function WorkerHealthCard({ health }: { health: BatchQueueHealth }) {
  const status = health.stuckJobs > 0 ? "stuck" : health.lastWorkerSeenAt ? (health.lastWorkerStatus ?? "idle") : "idle";
  return (
    <article className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-headline font-bold uppercase tracking-[0.12em] text-primary/70">Worker Heartbeat</p>
          <h2 className="mt-2 text-2xl font-headline font-black uppercase text-primary">
            {health.lastWorkerSeenAt ? "Worker heartbeat recorded" : "No worker heartbeat yet"}
          </h2>
          <p className="mt-1 text-xs font-body text-primary/60">
            Last seen {health.lastWorkerSeenAt ? formatDate(health.lastWorkerSeenAt) : "never"}.
          </p>
        </div>
        <StatusPill status={status} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MiniStat label="Ready queued" value={health.readyQueuedJobs.toLocaleString()} />
        <MiniStat label="Running" value={health.runningJobs.toLocaleString()} />
        <MiniStat label="Stuck" value={health.stuckJobs.toLocaleString()} />
        <MiniStat label="Needs review" value={health.needsReviewJobs.toLocaleString()} />
        <MiniStat label="Upstream latency" value={health.latestUpstreamLatencyMs === null ? "-" : `${health.latestUpstreamLatencyMs.toLocaleString()}ms`} />
        <MiniStat label="Upstream status" value={health.latestUpstreamOk === null ? "-" : health.latestUpstreamOk ? "ok" : "error"} />
      </div>
      {health.lastWorkerError ? (
        <p className="mt-4 rounded-none border-2 border-primary bg-amber-50 px-4 py-3 text-sm font-body text-amber-950">
          {health.lastWorkerError}
        </p>
      ) : null}
    </article>
  );
}

function WorkerHeartbeatTable({ heartbeats }: { heartbeats: WorkerHeartbeatRecord[] }) {
  return (
    <article className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <h2 className="text-2xl font-headline font-black uppercase text-primary">Worker Nodes</h2>
      <div className="mt-4 overflow-x-auto rounded-none border-2 border-primary bg-white">
        <table className="w-full min-w-[760px] text-sm text-primary">
          <thead className="bg-[#f2ede5] text-left text-primary border-b-2 border-primary font-headline">
            <tr>
              <th className="px-3 py-2 font-bold uppercase">Worker</th>
              <th className="px-3 py-2 font-bold uppercase">Status</th>
              <th className="px-3 py-2 font-bold uppercase">Last Seen</th>
              <th className="px-3 py-2 font-bold uppercase">Current Job</th>
              <th className="px-3 py-2 font-bold uppercase">Processed</th>
              <th className="px-3 py-2 font-bold uppercase">Upstream</th>
            </tr>
          </thead>
          <tbody>
            {heartbeats.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-primary/60 font-body">No worker heartbeat recorded yet.</td></tr>
            ) : (
              heartbeats.map((heartbeat) => (
                <tr key={heartbeat.id} className="border-t border-primary/20 hover:bg-[#fafbfe] text-primary">
                  <td className="px-3 py-2 font-mono text-xs">{heartbeat.workerId}</td>
                  <td className="px-3 py-2"><StatusPill status={heartbeat.status} /></td>
                  <td className="px-3 py-2 font-body">{formatDate(heartbeat.lastSeenAt)}</td>
                  <td className="max-w-[160px] truncate px-3 py-2 font-mono text-xs">{heartbeat.currentJobId ?? "-"}</td>
                  <td className="px-3 py-2 font-body">{heartbeat.processedItemCount.toLocaleString()} item(s)</td>
                  <td className="px-3 py-2 font-body">
                    {heartbeat.upstreamLatencyMs === null ? "-" : `${heartbeat.upstreamLatencyMs.toLocaleString()}ms`}
                    {heartbeat.upstreamOk === false ? " / error" : heartbeat.upstreamOk === true ? " / ok" : ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function ModalPoolCard({ pool }: { pool: ModalPoolHealth }) {
  return (
    <article className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-headline font-bold uppercase tracking-[0.12em] text-primary/70">Modal Account Pool</p>
          <h2 className="mt-2 text-2xl font-headline font-black uppercase text-primary">
            {pool.available.toLocaleString()} / {pool.total.toLocaleString()} endpoints available
          </h2>
          <p className="mt-1 text-xs font-body text-primary/60">
            Round-robin routing skips endpoints in cooldown and prefers accounts with usable credits.
          </p>
        </div>
        <StatusPill status={pool.blocked > 0 ? "cooldown" : pool.total > 0 ? "ok" : "missing"} />
      </div>
      <div className="mt-4 overflow-x-auto rounded-none border-2 border-primary bg-white">
        <table className="w-full min-w-[860px] text-sm text-primary">
          <thead className="bg-[#f2ede5] text-left text-primary border-b-2 border-primary font-headline">
            <tr>
              <th className="px-3 py-2 font-bold uppercase">Endpoint</th>
              <th className="px-3 py-2 font-bold uppercase">Status</th>
              <th className="px-3 py-2 font-bold uppercase">Requests</th>
              <th className="px-3 py-2 font-bold uppercase">Success</th>
              <th className="px-3 py-2 font-bold uppercase">Latency</th>
              <th className="px-3 py-2 font-bold uppercase">Cooldown</th>
            </tr>
          </thead>
          <tbody>
            {pool.endpoints.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-primary/60 font-body">No Modal endpoints configured.</td></tr>
            ) : (
              pool.endpoints.map((endpoint) => (
                <tr key={`${endpoint.label}:${endpoint.host}`} className="border-t border-primary/20 hover:bg-[#fafbfe] text-primary">
                  <td className="px-3 py-2 font-body">
                    <p className="font-bold">{endpoint.label}</p>
                    <p className="font-mono text-xs text-primary/60">{endpoint.host}</p>
                  </td>
                  <td className="px-3 py-2"><StatusPill status={endpoint.blocked ? "cooldown" : "ok"} /></td>
                  <td className="px-3 py-2 font-body">{endpoint.total_requests.toLocaleString()}</td>
                  <td className="px-3 py-2 font-body">{endpoint.success_rate === null ? "-" : `${endpoint.success_rate}%`}</td>
                  <td className="px-3 py-2 font-body">{endpoint.average_latency_ms === null ? "-" : `${endpoint.average_latency_ms.toLocaleString()}ms`}</td>
                  <td className="max-w-[260px] px-3 py-2 font-mono text-xs text-primary/60">
                    {endpoint.cooldown_reason
                      ? `${endpoint.cooldown_reason}${endpoint.cooldown_expires_at ? ` until ${formatDate(endpoint.cooldown_expires_at)}` : ""}`
                      : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function JobsTable({
  jobs,
  onRetry,
  onWebhookRetry,
  onForceProcess,
  onSelectJob,
  actionLoading,
}: {
  jobs: BatchJobWithUser[];
  onRetry: (jobId: string) => void;
  onWebhookRetry: (jobId: string) => void;
  onForceProcess: (jobId: string) => void;
  onSelectJob: (jobId: string) => void;
  actionLoading: string;
}) {
  return (
    <table className="w-full min-w-[1380px] text-sm text-primary">
      <thead className="bg-[#f2ede5] text-left text-primary border-b-2 border-primary font-headline">
        <tr>
          <th className="px-3 py-2 font-bold uppercase">Time</th>
          <th className="px-3 py-2 font-bold uppercase">User</th>
          <th className="px-3 py-2 font-bold uppercase">Job</th>
          <th className="px-3 py-2 font-bold uppercase">Status</th>
          <th className="px-3 py-2 font-bold uppercase">Webhook</th>
          <th className="px-3 py-2 font-bold uppercase">Done</th>
          <th className="px-3 py-2 font-bold uppercase">Seconds</th>
          <th className="px-3 py-2 font-bold uppercase">Charged</th>
          <th className="px-3 py-2 font-bold uppercase">Error</th>
          <th className="px-3 py-2 font-bold uppercase">Action</th>
        </tr>
      </thead>
      <tbody>
        {jobs.length === 0 ? (
          <tr><td colSpan={10} className="px-3 py-8 text-center text-primary/60 font-body">No batch jobs found.</td></tr>
        ) : (
          jobs.map((job) => (
            <tr key={job.id} className="border-t border-primary/20 hover:bg-[#fafbfe] text-primary">
              <td className="px-3 py-2 font-body">{formatDate(job.createdAt)}</td>
              <td className="max-w-[220px] px-3 py-2 font-body">
                <Link href={`/app/admin/customers/${job.userId}`} className="block truncate font-bold text-emerald-800 hover:underline">
                  {job.userEmail}
                </Link>
              </td>
              <td className="max-w-[260px] px-3 py-2 font-body">
                <p className="truncate font-semibold">{job.title}</p>
                <p className="truncate text-xs text-primary/60 font-mono">{job.id}</p>
              </td>
              <td className="px-3 py-2"><JobStatusPill status={job.status} /></td>
              <td className="px-3 py-2">
                {job.webhookCallbackUrl ? (
                  <span className={`rounded-none border px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider ${
                    job.webhookStatus === "delivered"
                      ? "bg-[#def3e5] text-emerald-900 border-emerald-900"
                      : job.webhookStatus === "failed"
                        ? "bg-red-100 text-red-900 border-red-900"
                        : "bg-amber-100 text-amber-900 border-amber-900"
                  }`}>
                    {job.webhookStatus ?? "pending"} / {job.webhookAttempts}
                  </span>
                ) : "-"}
              </td>
              <td className="px-3 py-2 font-body">{job.completedItems.toLocaleString()} / {job.totalItems.toLocaleString()}</td>
              <td className="px-3 py-2 font-body">{job.outputSeconds.toLocaleString()}s</td>
              <td className="px-3 py-2 font-body">{job.creditsCharged.toLocaleString()}</td>
              <td className="max-w-[240px] truncate px-3 py-2 font-mono text-xs text-primary/60">{job.deadLetterReason ?? job.errorMessage ?? job.webhookLastError ?? "-"}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onSelectJob(job.id)} className="rounded-none border-2 border-primary bg-white px-3 py-1.5 text-xs font-headline font-bold uppercase text-primary shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer">
                    Inspect Items
                  </button>
                  {job.status === "failed" || job.status === "partial" || job.status === "needs_review" ? (
                    <button type="button" disabled={Boolean(actionLoading)} onClick={() => onRetry(job.id)} className="rounded-none border-2 border-primary bg-white px-3 py-1.5 text-xs font-headline font-bold uppercase text-primary shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-50 cursor-pointer">
                      Retry
                    </button>
                  ) : null}
                  {job.status === "queued" ? (
                    <button type="button" disabled={Boolean(actionLoading)} onClick={() => onForceProcess(job.id)} className="rounded-none border-2 border-primary bg-[#ffcc00] px-3 py-1.5 text-xs font-headline font-bold uppercase text-primary shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-50 cursor-pointer">
                      Process now
                    </button>
                  ) : null}
                  {job.webhookCallbackUrl && job.webhookStatus === "failed" ? (
                    <button type="button" disabled={Boolean(actionLoading)} onClick={() => onWebhookRetry(job.id)} className="rounded-none border-2 border-primary bg-white px-3 py-1.5 text-xs font-headline font-bold uppercase text-primary shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-50 cursor-pointer">
                      Retry webhook
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function WebhookAttemptsTable({ attempts }: { attempts: BatchJobWebhookAttemptWithUser[] }) {
  return (
    <table className="w-full min-w-[1120px] text-sm text-primary">
      <thead className="bg-[#f2ede5] text-left text-primary border-b-2 border-primary font-headline">
        <tr>
          <th className="px-3 py-2 font-bold uppercase">Time</th>
          <th className="px-3 py-2 font-bold uppercase">User</th>
          <th className="px-3 py-2 font-bold uppercase">Job</th>
          <th className="px-3 py-2 font-bold uppercase">Status</th>
          <th className="px-3 py-2 font-bold uppercase">HTTP</th>
          <th className="px-3 py-2 font-bold uppercase">Result</th>
        </tr>
      </thead>
      <tbody>
        {attempts.length === 0 ? (
          <tr><td colSpan={6} className="px-3 py-8 text-center text-primary/60 font-body">No webhook attempts recorded.</td></tr>
        ) : (
          attempts.map((attempt) => (
            <tr key={attempt.id} className="border-t border-primary/20 hover:bg-[#fafbfe] text-primary">
              <td className="px-3 py-2 font-body">{formatDate(attempt.createdAt)}</td>
              <td className="px-3 py-2 font-body">{attempt.userEmail}</td>
              <td className="max-w-[260px] truncate px-3 py-2 font-body">{attempt.jobTitle ?? attempt.jobId}</td>
              <td className="px-3 py-2">
                <span className={`rounded-none border-2 px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider ${
                  attempt.deliveryStatus === "delivered"
                    ? "bg-[#def3e5] text-emerald-900 border-emerald-900"
                    : "bg-red-100 text-red-900 border-red-900"
                }`}>
                  {attempt.deliveryStatus}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{attempt.httpStatus ?? "-"}</td>
              <td className="max-w-[420px] truncate px-3 py-2 font-mono text-xs text-primary/60">{attempt.errorMessage ?? attempt.responsePreview ?? "-"}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-none border-2 border-primary bg-[#f2ede5] p-3 text-primary">
      <p className="text-xs font-headline font-bold uppercase text-primary/70">{label}</p>
      <p className="mt-1 text-sm font-body font-bold text-primary">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const isOk = status === "online" || status === "busy" || status === "ok";
  const isErr = status === "stuck" || status === "error" || status === "failed";
  const pillClass = isOk
    ? "bg-[#def3e5] text-emerald-900 border-emerald-900"
    : isErr
      ? "bg-red-100 text-red-900 border-red-900"
      : "bg-amber-100 text-amber-900 border-amber-900";
  return (
    <span className={`rounded-none border-2 px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider ${pillClass}`}>
      {status}
    </span>
  );
}

function JobStatusPill({ status }: { status: BatchJobStatus }) {
  const className =
    status === "completed"
      ? "bg-[#def3e5] text-emerald-900 border-emerald-900"
      : status === "running" || status === "queued"
        ? "bg-amber-100 text-amber-900 border-amber-900"
        : status === "needs_review"
          ? "bg-purple-100 text-purple-900 border-purple-900"
          : "bg-red-100 text-red-900 border-red-900";
  return <span className={`rounded-none border-2 px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider ${className}`}>{status}</span>;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function formatAudioCleanup(cleanup: AudioCleanupResult): string {
  const records =
    cleanup.batchItemsCleared + cleanup.generationsCleared + cleanup.cloneSamplesCleared;
  const action = cleanup.dryRun ? "would clear" : "cleared";
  return `Audio storage cleanup ${action} ${records.toLocaleString()} old payload(s), about ${formatBytes(cleanup.estimatedBytesReleased)}, older than ${cleanup.retentionDays.toLocaleString()} day(s).`;
}

function formatWorkerNotice(state?: string | null, cleanup?: AudioCleanupResult): string {
  if (!state) return "";
  if (state === "processed") return "Worker processed one queued job.";
  if (state === "idle") return "No claimable queued job was available.";
  if (state === "webhook-retry") return "Webhook callback was retried.";
  if (state === "webhook-idle") return "Webhook callback could not be retried for that job.";
  if (state === "processed-job") return "Selected queued job was processed.";
  if (state === "modal-pool-reset") return "Modal endpoint cooldowns were cleared and the pool was reloaded.";
  if ((state === "audio-cleanup" || state === "audio-cleanup-dry-run") && cleanup) return formatAudioCleanup(cleanup);
  if (state === "job-idle") return "Selected job could not be claimed. It may already be running or finished.";
  if (state.startsWith("recovered-")) {
    const [, recoveredRaw, reviewRaw] = state.split("-");
    const recovered = Number(recoveredRaw);
    const review = Number(reviewRaw);
    return `Recovered ${Number.isFinite(recovered) ? recovered.toLocaleString() : "0"} stuck job(s); moved ${Number.isFinite(review) ? review.toLocaleString() : "0"} to review.`;
  }
  if (state.startsWith("retry-")) {
    const count = Number(state.slice("retry-".length));
    return `Retried ${Number.isFinite(count) ? count.toLocaleString() : "0"} job(s).`;
  }
  return state;
}

function emptyModalPool(): ModalPoolHealth {
  return {
    total: 0,
    available: 0,
    blocked: 0,
    endpoints: [],
  };
}

function emptyHealth(): BatchQueueHealth {
  return {
    queuedJobs: 0,
    readyQueuedJobs: 0,
    runningJobs: 0,
    stuckJobs: 0,
    needsReviewJobs: 0,
    failedJobs: 0,
    oldestQueuedAt: null,
    latestUpstreamLatencyMs: null,
    latestUpstreamOk: null,
    lastWorkerSeenAt: null,
    lastWorkerStatus: null,
    lastWorkerError: null,
  };
}

import { useEffect } from "react";

function JobDetailModal({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [data, setData] = useState<{ job: BatchJobWithUser; items: BatchJobItemRecord[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        setLoading(true);
        setError("");
      }
    });

    fetch(`/api/admin/jobs/${jobId}/items`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch job items.");
        return res.json() as Promise<{ job: BatchJobWithUser; items: BatchJobItemRecord[] }>;
      })
      .then((payload) => {
        if (active) {
          setData(payload);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Error fetching items.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [jobId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 font-body text-primary">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col border-4 border-primary bg-surface shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] rounded-none">
        <header className="flex items-center justify-between border-b-4 border-primary bg-[#f2ede5] p-4 font-headline">
          <div>
            <h3 className="text-lg font-black uppercase">Inspect Job: {data?.job.title || jobId.slice(0, 8)}</h3>
            <p className="text-xs text-primary/70">{jobId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center border-2 border-primary bg-[#ff6666] text-sm font-black shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer"
          >
            ✕
          </button>
        </header>

        <div className="smooth-scroll-region flex-1 overflow-y-auto p-4">
          {loading && <p className="text-center font-headline font-bold uppercase py-10">Loading items...</p>}
          {error && <p className="text-center font-headline font-bold uppercase text-red-600 py-10">{error}</p>}
          {!loading && !error && data && (
            <div className="grid gap-4">
              <div className="grid gap-2 border-2 border-primary p-3 bg-surface-container-low sm:grid-cols-4 text-xs">
                <div><span className="font-bold uppercase">Mode:</span> {data.job.mode}</div>
                <div><span className="font-bold uppercase">Voice:</span> {data.job.voice}</div>
                <div><span className="font-bold uppercase">Model:</span> {data.job.model}</div>
                <div><span className="font-bold uppercase">Items count:</span> {data.items.length}</div>
              </div>

              <div className="overflow-x-auto border-2 border-primary">
                <table className="w-full text-left text-xs text-primary">
                  <thead className="bg-[#f2ede5] border-b-2 border-primary font-headline uppercase font-bold">
                    <tr>
                      <th className="px-3 py-2">Index</th>
                      <th className="px-3 py-2">Speaker</th>
                      <th className="px-3 py-2">Text Preview</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Latency</th>
                      <th className="px-3 py-2">Charged</th>
                      <th className="px-3 py-2">Error Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.id} className="border-t border-primary/20 hover:bg-[#fafbfe]">
                        <td className="px-3 py-2 font-mono">{item.itemIndex + 1}</td>
                        <td className="px-3 py-2 font-bold">{item.speaker ?? "default"}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate">{item.inputPreview}</td>
                        <td className="px-3 py-2">
                          <span className={`border px-1.5 py-0.5 text-[10px] font-headline font-bold uppercase tracking-wider ${
                            item.status === "success"
                              ? "bg-[#def3e5] text-emerald-900 border-emerald-900"
                              : item.status === "failed"
                                ? "bg-red-100 text-red-900 border-red-900"
                                : "bg-amber-100 text-amber-900 border-amber-900"
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">{item.latencyMs.toLocaleString()} ms</td>
                        <td className="px-3 py-2">{item.creditsCharged}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate text-red-700 font-semibold">{item.errorMessage ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
