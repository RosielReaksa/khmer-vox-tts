import { NextResponse } from "next/server";

import {
  BatchMergedAudioError,
  buildMergedBatchAudioForUser,
} from "@/lib/batch-merged-audio";
import { PUBLIC_AUDIO_OUTPUT_FORMAT } from "@/lib/audio-api";
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

  try {
    const merged = await buildMergedBatchAudioForUser(session.userId, id);
    const bytes = Buffer.from(merged.bytes);
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);

    return new NextResponse(new Blob([body], { type: merged.contentType }), {
      status: 200,
      headers: {
        "Content-Type": merged.contentType,
        "Content-Disposition": `inline; filename="voxtts-${merged.job.mode}-${merged.job.id}.${PUBLIC_AUDIO_OUTPUT_FORMAT}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error(`[merged-audio] Error streaming merged audio for job ${id}:`, error);
    if (error instanceof BatchMergedAudioError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to stream merged audio.",
    }, { status: 500 });
  }
}
