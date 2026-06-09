import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import {
  BatchJobServiceError,
  processBatchJob,
  processNextBatchJob,
  recoverStuckBatchQueue,
} from "@/lib/batch-service";

export const runtime = "nodejs"; // Force recompilation comment

function cleanEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function authorized(request: Request): boolean {
  const secret = cleanEnv("JOB_WORKER_SECRET");
  if (!secret && process.env.NODE_ENV !== "production") return true;
  if (!secret) return false;
  const provided = request.headers.get("x-job-worker-secret") ?? "";
  return safeEqual(provided, secret);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let jobId: string | undefined;
  let workerId: string | undefined;
  let recoverOnly = false;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      jobId?: unknown;
      workerId?: unknown;
      recoverOnly?: unknown;
    };
    jobId = typeof body.jobId === "string" && body.jobId.trim() ? body.jobId.trim() : undefined;
    workerId = typeof body.workerId === "string" && body.workerId.trim() ? body.workerId.trim() : undefined;
    recoverOnly = body.recoverOnly === true;
  } catch {
    jobId = undefined;
  }
  workerId ??= request.headers.get("x-worker-id")?.trim() || undefined;

  try {
    if (recoverOnly) {
      const recovery = await recoverStuckBatchQueue();
      return NextResponse.json({ ok: true, recovery });
    }

    const result = jobId ? await processBatchJob(jobId, { workerId }) : await processNextBatchJob({ workerId });
    return NextResponse.json({
      ok: true,
      processed: Boolean(result.job),
      job: result.job,
      itemCount: result.items.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Batch worker processing failed.";
    const code = error instanceof BatchJobServiceError ? error.code : "BATCH_WORKER_FAILED";
    const status = error instanceof BatchJobServiceError ? error.status : 500;
    console.error("[batch-worker] internal process failed", { code, message, workerId, jobId });
    return NextResponse.json({ ok: false, error: message, code }, { status });
  }
}
