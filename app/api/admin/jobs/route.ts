import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/lib/admin-api";
import {
  kickBatchWorker,
  processBatchJob,
  processNextBatchJob,
  recoverStuckBatchQueue,
  retryBatchJobWebhook,
} from "@/lib/batch-service";
import { getEndpointMetrics } from "@/lib/modal-analytics";
import {
  cleanupOldAudioStorage,
  getBatchQueueHealth,
  listBatchJobWebhookAttemptsForAdmin,
  listBatchJobsForAdmin,
  listWorkerHeartbeats,
  purgeQueuedBatchJobs,
  retryBatchJob,
} from "@/lib/store";
import {
  forceReloadEndpoints,
  getBlockedEndpoints,
  getUpstreamEndpoints,
  resetEndpointPool,
} from "@/lib/tts-endpoints";
import type { BatchJobStatus } from "@/lib/types";

export const runtime = "nodejs";

const statusOptions: Array<BatchJobStatus | "all"> = [
  "all",
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "needs_review",
];

function endpointHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 80);
  }
}

async function getModalPoolHealth() {
  const [metrics, endpoints, blocked] = await Promise.all([
    getEndpointMetrics(),
    Promise.resolve(getUpstreamEndpoints()),
    Promise.resolve(getBlockedEndpoints()),
  ]);
  const blockedByUrl = new Map(blocked.map((endpoint) => [endpoint.url, endpoint]));
  return {
    total: endpoints.length,
    available: endpoints.filter((endpoint) => !blockedByUrl.has(endpoint.url)).length,
    blocked: blocked.length,
    endpoints: endpoints.map((endpoint, index) => {
      const metric = metrics[endpoint.url];
      const blockedEndpoint = blockedByUrl.get(endpoint.url);
      return {
        label: endpoint.label || `Modal Endpoint ${index + 1}`,
        host: endpointHost(endpoint.url),
        blocked: Boolean(blockedEndpoint),
        cooldown_reason: blockedEndpoint?.reason ?? null,
        cooldown_expires_at: blockedEndpoint?.expiresAt ?? null,
        total_requests: metric?.totalRequests ?? 0,
        success_rate: metric?.successRate ?? null,
        average_latency_ms: metric?.averageLatencyMs ?? null,
        failed_requests: metric?.failedRequests ?? 0,
      };
    }),
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminApiSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const requestedStatus = url.searchParams.get("status") ?? "all";
  const status = statusOptions.includes(requestedStatus as BatchJobStatus | "all")
    ? (requestedStatus as BatchJobStatus | "all")
    : "all";
  const q = url.searchParams.get("q")?.trim() ?? "";

  const [jobs, webhookAttempts, queueHealth, workerHeartbeats, modalPool] = await Promise.all([
    listBatchJobsForAdmin({ limit: 200, status, q }),
    listBatchJobWebhookAttemptsForAdmin({ limit: 80 }),
    getBatchQueueHealth(),
    listWorkerHeartbeats({ limit: 8 }),
    getModalPoolHealth(),
  ]);

  return NextResponse.json({
    jobs,
    webhookAttempts,
    queueHealth,
    workerHeartbeats,
    modalPool,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    jobId?: string;
    jobIds?: string[];
    retentionDays?: number;
    limit?: number;
    dryRun?: boolean;
  };

  if (body.action === "purge_queue") {
    const result = await purgeQueuedBatchJobs(auth.userId, "Cancelled by admin purge.");
    return NextResponse.json({
      ok: true,
      purged: result,
      worker: `purged-${result}`,
    });
  }

  if (body.action === "process_next") {
    const result = await processNextBatchJob({ workerId: "admin-manual" });
    return NextResponse.json({
      ok: true,
      worker: result.job ? "processed" : "idle",
      jobId: result.job?.id ?? null,
    });
  }

  if (body.action === "process_job") {
    const jobId = body.jobId?.trim();
    if (!jobId) {
      return NextResponse.json({ error: "Job ID is required." }, { status: 400 });
    }
    const result = await processBatchJob(jobId, { workerId: "admin-manual-selected" });
    return NextResponse.json({
      ok: true,
      worker: result.job ? "processed-job" : "job-idle",
      jobId: result.job?.id ?? jobId,
    });
  }

  if (body.action === "reset_modal_pool") {
    resetEndpointPool();
    forceReloadEndpoints();
    return NextResponse.json({
      ok: true,
      worker: "modal-pool-reset",
    });
  }

  if (body.action === "cleanup_audio_storage") {
    const result = await cleanupOldAudioStorage({
      retentionDays: body.retentionDays,
      limit: body.limit,
      dryRun: Boolean(body.dryRun),
    });
    return NextResponse.json({
      ok: true,
      worker: body.dryRun ? "audio-cleanup-dry-run" : "audio-cleanup",
      cleanup: result,
    });
  }

  if (body.action === "recover_stuck") {
    const result = await recoverStuckBatchQueue();
    return NextResponse.json({
      ok: true,
      worker: `recovered-${result.recoveredJobs}-${result.movedToReviewJobs}`,
      ...result,
    });
  }

  if (body.action === "retry_webhook") {
    const jobId = body.jobId?.trim();
    const retried = jobId ? await retryBatchJobWebhook(jobId) : false;
    return NextResponse.json({
      ok: retried,
      worker: retried ? "webhook-retry" : "webhook-idle",
    });
  }

  if (body.action === "retry_jobs") {
    const jobIds = (body.jobIds ?? []).filter(Boolean).slice(0, 50);
    let retried = 0;
    for (const jobId of jobIds) {
      const job = await retryBatchJob(jobId);
      if (!job) continue;
      retried += 1;
      kickBatchWorker(job.id);
    }
    return NextResponse.json({
      ok: true,
      retried,
      worker: `retry-${retried}`,
    });
  }

  if (body.action === "retry_job") {
    const jobId = body.jobId?.trim();
    const job = jobId ? await retryBatchJob(jobId) : null;
    if (job) kickBatchWorker(job.id);
    return NextResponse.json({
      ok: Boolean(job),
      retried: job ? 1 : 0,
      worker: job ? "retry-1" : "retry-0",
    });
  }

  return NextResponse.json({ error: "Unknown job action." }, { status: 400 });
}
