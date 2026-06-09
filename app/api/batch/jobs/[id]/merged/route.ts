import { NextResponse } from "next/server";

import { concatMp3Buffers } from "@/lib/audio-merge";
import { getUserBatchJobWithItems, getUserTokenBalance } from "@/lib/store";
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
  const result = await getUserBatchJobWithItems(session.userId, id);
  if (!result) {
    return NextResponse.json({ error: "Batch job not found." }, { status: 404 });
  }

  const { job, items } = result;

  if (job.status !== "completed" && job.status !== "partial") {
    return NextResponse.json({ error: "Batch job is not completed yet." }, { status: 400 });
  }

  const successfulItems = items
    .filter((item) => item.status === "success" && item.audioBase64)
    .sort((a, b) => a.itemIndex - b.itemIndex);

  if (successfulItems.length === 0) {
    return NextResponse.json({ error: "No successful audio segments found in this batch job." }, { status: 404 });
  }

  try {
    const buffers = successfulItems.map((item) => Buffer.from(item.audioBase64 ?? "", "base64"));
    const mergedBuffer = await concatMp3Buffers(buffers);

    if (mergedBuffer.length === 0) {
      return NextResponse.json({ error: "Failed to concatenate audio segments." }, { status: 500 });
    }

    const audioBase64 = Buffer.from(mergedBuffer).toString("base64");
    const remainingTokens = await getUserTokenBalance(session.userId);

    return NextResponse.json({
      ok: true,
      generationId: job.id,
      audioBase64,
      contentType: "audio/mpeg",
      creditsRequested: job.creditsEstimated,
      creditsCharged: job.creditsCharged,
      remainingTokens,
      outputSeconds: job.outputSeconds,
      latencyMs: job.startedAt && job.completedAt
        ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
        : 0,
      model: job.model,
    });
  } catch (error) {
    console.error(`[merged-audio] Error generating merged audio for job ${id}:`, error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to merge audio segments.",
    }, { status: 500 });
  }
}
