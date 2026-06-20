import { NextResponse } from "next/server";

import {
  BatchMergedAudioError,
  buildMergedBatchAudioForUser,
  dashboardMergedAudioUrl,
} from "@/lib/batch-merged-audio";
import { readSessionFromCookie } from "@/lib/session";

export const runtime = "nodejs";

const DEFAULT_INLINE_AUDIO_MAX_BYTES = 1_500_000;

function inlineAudioMaxBytes(): number {
  const raw = Number(process.env.DASHBOARD_MERGED_INLINE_MAX_BYTES);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_INLINE_AUDIO_MAX_BYTES;
  return Math.min(Math.floor(raw), 8_000_000);
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

  try {
    const merged = await buildMergedBatchAudioForUser(session.userId, id);
    const shouldInline = merged.bytes.byteLength <= inlineAudioMaxBytes();

    return NextResponse.json({
      ok: true,
      generationId: merged.job.id,
      audioBase64: shouldInline ? Buffer.from(merged.bytes).toString("base64") : undefined,
      audioUrl: dashboardMergedAudioUrl(merged.job.id),
      contentType: merged.contentType,
      creditsRequested: merged.job.creditsEstimated,
      creditsCharged: merged.job.creditsCharged,
      remainingTokens: merged.remainingTokens,
      outputSeconds: merged.outputSeconds,
      latencyMs: merged.latencyMs,
      model: merged.job.model,
    });
  } catch (error) {
    console.error(`[merged-audio] Error generating merged audio for job ${id}:`, error);
    if (error instanceof BatchMergedAudioError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to merge audio segments.",
    }, { status: 500 });
  }
}
