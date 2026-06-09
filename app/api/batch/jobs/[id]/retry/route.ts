import { NextResponse } from "next/server";

import { kickBatchWorker } from "@/lib/batch-service";
import { readSessionFromCookie } from "@/lib/session";
import { getUserBatchJobWithItems, retryBatchJob } from "@/lib/store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const retryableStatuses = new Set(["failed", "partial", "needs_review"]);

export async function POST(_request: Request, context: RouteContext) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const loaded = await getUserBatchJobWithItems(session.userId, id);
  if (!loaded) {
    return NextResponse.json({ error: "Batch job not found." }, { status: 404 });
  }

  const failedItems = loaded.items.filter((item) => item.status === "failed").length;
  if (failedItems === 0) {
    return NextResponse.json({ error: "This batch has no failed lines to retry." }, { status: 400 });
  }

  if (!retryableStatuses.has(loaded.job.status)) {
    return NextResponse.json(
      { error: "Wait until the batch job stops before retrying failed lines." },
      { status: 409 },
    );
  }

  if (loaded.job.mode === "clone" && !loaded.job.cloneSampleBase64) {
    return NextResponse.json(
      {
        error:
          "Clone retry needs the original reference audio. Create a new clone batch with the same saved voice or uploaded sample.",
      },
      { status: 409 },
    );
  }

  const retried = await retryBatchJob(id);
  if (!retried) {
    return NextResponse.json({ error: "Could not retry this batch job." }, { status: 409 });
  }

  kickBatchWorker(retried.id);
  const refreshed = await getUserBatchJobWithItems(session.userId, id);

  return NextResponse.json(
    {
      ok: true,
      retriedItems: failedItems,
      job: refreshed?.job ?? retried,
      items: refreshed?.items ?? [],
    },
    { status: 202 },
  );
}
