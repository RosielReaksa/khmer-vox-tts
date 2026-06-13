import { NextResponse } from "next/server";

import { resolveAudioBytes } from "@/lib/audio-storage";
import { getUserBatchJobWithItems, getUserTokenBalance } from "@/lib/store";
import { readSessionFromCookie } from "@/lib/session";
import { mergePublicMp3SegmentsForDelivery } from "@/lib/tts-provider";

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
    .filter((item) => item.status === "success" && (item.audioBase64 || item.audioObjectKey))
    .sort((a, b) => a.itemIndex - b.itemIndex);

  if (successfulItems.length === 0) {
    return NextResponse.json({ error: "No successful audio segments found in this batch job." }, { status: 404 });
  }

  try {
    const buffers: Buffer[] = [];
    for (const item of successfulItems) {
      const bytes = await resolveAudioBytes({
        audioBase64: item.audioBase64,
        audioObjectKey: item.audioObjectKey,
      });
      if (bytes?.byteLength) buffers.push(Buffer.from(bytes));
    }
    if (buffers.length === 0) {
      return NextResponse.json({ error: "No successful audio segments found in this batch job." }, { status: 404 });
    }
    const cleanedAudio = await mergePublicMp3SegmentsForDelivery(buffers, job.outputSeconds);
    const audioBase64 = Buffer.from(cleanedAudio.bytes).toString("base64");
    const remainingTokens = await getUserTokenBalance(session.userId);

    return NextResponse.json({
      ok: true,
      generationId: job.id,
      audioBase64,
      contentType: cleanedAudio.contentType,
      creditsRequested: job.creditsEstimated,
      creditsCharged: job.creditsCharged,
      remainingTokens,
      outputSeconds: cleanedAudio.outputSeconds ?? job.outputSeconds,
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
