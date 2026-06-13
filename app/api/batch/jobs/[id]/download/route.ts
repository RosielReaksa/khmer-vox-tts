import { NextResponse } from "next/server";

import { PUBLIC_AUDIO_OUTPUT_FORMAT } from "@/lib/audio-api";
import { resolveAudioBytes } from "@/lib/audio-storage";
import { getUserBatchJobWithItems } from "@/lib/store";
import { readSessionFromCookie } from "@/lib/session";
import { createZip } from "@/lib/zip";

export const runtime = "nodejs";

function extensionFor(contentType: string | null): string {
  if (!contentType) return PUBLIC_AUDIO_OUTPUT_FORMAT;
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return "mp3";
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("webm")) return "webm";
  return "wav";
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

  const files: Array<{ name: string; data: Buffer }> = [];
  for (const item of result.items.filter((candidate) => candidate.status === "success" && (candidate.audioBase64 || candidate.audioObjectKey))) {
    const bytes = await resolveAudioBytes({
      audioBase64: item.audioBase64,
      audioObjectKey: item.audioObjectKey,
    });
    if (!bytes?.byteLength) continue;
    files.push({
      name: `${String(item.itemIndex + 1).padStart(3, "0")}.${extensionFor(item.contentType)}`,
      data: Buffer.from(bytes),
    });
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No generated audio files are available yet." }, { status: 404 });
  }

  const zip = createZip(files);
  const body = new ArrayBuffer(zip.byteLength);
  new Uint8Array(body).set(zip);
  return new NextResponse(new Blob([body], { type: "application/zip" }), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${result.job.id}.zip"`,
      "Content-Length": String(zip.byteLength),
    },
  });
}
