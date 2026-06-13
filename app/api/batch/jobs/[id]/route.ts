import { NextResponse } from "next/server";

import { getUserBatchJobWithItems } from "@/lib/store";
import { readSessionFromCookie } from "@/lib/session";
import type { BatchJobItemRecord, BatchJobRecord } from "@/lib/types";

export const runtime = "nodejs";

function retryReadyAt(input: string | null): boolean {
  if (!input) return true;
  const timestamp = new Date(input).getTime();
  return Number.isNaN(timestamp) || timestamp <= Date.now();
}

function publicBatchJob(job: BatchJobRecord): BatchJobRecord {
  return {
    ...job,
    cloneSampleBase64: null,
  };
}

function publicBatchJobItem(item: BatchJobItemRecord): BatchJobItemRecord & { hasAudio: boolean } {
  return {
    ...item,
    audioBase64: null,
    audioObjectKey: null,
    audioObjectUrl: null,
    hasAudio: Boolean(item.audioBase64 || item.audioObjectKey),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await getUserBatchJobWithItems(session.userId, id);
  if (!result) {
    return NextResponse.json({ error: "Batch job not found." }, { status: 404 });
  }

  if (
    process.env.NODE_ENV !== "production" &&
    (
      (result.job.status === "queued" && retryReadyAt(result.job.nextRetryAt)) ||
      (
        result.job.status === "running" &&
        result.items.some((item) => item.status === "queued" && retryReadyAt(item.nextRetryAt))
      )
    )
  ) {
    const { kickBatchWorker } = await import("@/lib/batch-service");
    kickBatchWorker(id);
  }

  return NextResponse.json({
    job: publicBatchJob(result.job),
    items: result.items.map(publicBatchJobItem),
  });
}
