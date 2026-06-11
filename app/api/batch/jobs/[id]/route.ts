import { NextResponse } from "next/server";

import { getUserBatchJobWithItems, refreshBatchJobRollup } from "@/lib/store";
import { readSessionFromCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let result = await getUserBatchJobWithItems(session.userId, id);
  if (!result) {
    return NextResponse.json({ error: "Batch job not found." }, { status: 404 });
  }
  try {
    await refreshBatchJobRollup(id);
    result = await getUserBatchJobWithItems(session.userId, id) ?? result;
  } catch (error) {
    console.error("[batch-jobs] Failed to refresh batch job rollup", {
      jobId: id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
  if (process.env.NODE_ENV !== "production" && result.job.status === "queued") {
    const { kickBatchWorker } = await import("@/lib/batch-service");
    kickBatchWorker(id);
  }

  return NextResponse.json(result);
}
