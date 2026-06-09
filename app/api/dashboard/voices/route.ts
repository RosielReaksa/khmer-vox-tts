import { NextResponse } from "next/server";
import { z } from "zod";

import { readSessionFromCookie } from "@/lib/session";
import {
  createUserVoice,
  deleteUserVoice,
  findUserVoiceById,
  listUserVoices,
} from "@/lib/store";
import { MAX_CLONE_SAMPLE_BYTES, MAX_VOICE_CHARS } from "@/lib/usage-policy";

export const runtime = "nodejs";

const nameSchema = z.string().min(1).max(MAX_VOICE_CHARS).regex(/^[a-zA-Z0-9\s-_()\u1780-\u17F9]+$/, {
  message: "Name can only contain alphanumeric characters, spaces, dashes, underscores, parentheses, and Khmer text.",
});
const descriptionSchema = z.string().max(255).optional();

export async function GET(request: Request) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      const voice = await findUserVoiceById(session.userId, id);
      if (!voice) {
        return NextResponse.json({ error: "Voice not found" }, { status: 404 });
      }
      const buffer = Buffer.from(voice.audioBase64, "base64");
      return new Response(buffer, {
        headers: {
          "Content-Type": voice.mimeType,
          "Content-Length": buffer.length.toString(),
          "Content-Disposition": `inline; filename="${encodeURIComponent(voice.fileName)}"`,
        },
      });
    }

    const voices = await listUserVoices(session.userId);
    // Return voices without the heavy base64 payload to keep lists light
    const responseVoices = voices.map((v) => ({
      id: v.id,
      userId: v.userId,
      name: v.name,
      description: v.description,
      fileName: v.fileName,
      mimeType: v.mimeType,
      fileSize: v.fileSize,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    }));
    return NextResponse.json({ ok: true, voices: responseVoices });
  } catch (error) {
    console.error("[api/dashboard/voices] GET error:", error);
    return NextResponse.json({ error: "Failed to list voices." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const nameVal = formData.get("name");
    const descVal = formData.get("description");
    const sample = formData.get("sample");

    const nameParsed = nameSchema.safeParse(typeof nameVal === "string" ? nameVal.trim() : "");
    if (!nameParsed.success) {
      return NextResponse.json(
        { error: nameParsed.error.issues[0]?.message || "Invalid name." },
        { status: 400 },
      );
    }

    const descParsed = descriptionSchema.safeParse(typeof descVal === "string" ? descVal.trim() : undefined);
    if (!descParsed.success) {
      return NextResponse.json({ error: "Description is too long (max 255 chars)." }, { status: 400 });
    }

    if (!(sample instanceof File)) {
      return NextResponse.json({ error: "Voice sample file is required." }, { status: 400 });
    }

    if (sample.size <= 0 || sample.size > MAX_CLONE_SAMPLE_BYTES) {
      return NextResponse.json(
        { error: `Voice sample must be between 1 byte and ${(MAX_CLONE_SAMPLE_BYTES / (1024 * 1024))}MB.` },
        { status: 400 },
      );
    }

    const lowerName = sample.name.toLowerCase();
    const isMp3 = sample.type === "audio/mpeg" || sample.type === "audio/mp3" || lowerName.endsWith(".mp3");
    const isWav = sample.type === "audio/wav" || sample.type === "audio/x-wav" || lowerName.endsWith(".wav");

    if (!isMp3 && !isWav) {
      return NextResponse.json({ error: "Only MP3 and WAV files are supported." }, { status: 400 });
    }

    const arrayBuffer = await sample.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const newVoice = await createUserVoice({
      userId: session.userId,
      name: nameParsed.data,
      description: descParsed.data || null,
      fileName: sample.name,
      mimeType: sample.type || (isMp3 ? "audio/mpeg" : "audio/wav"),
      fileSize: sample.size,
      audioBase64: base64,
    });

    const voiceResponse = {
      id: newVoice.id,
      userId: newVoice.userId,
      name: newVoice.name,
      description: newVoice.description,
      fileName: newVoice.fileName,
      mimeType: newVoice.mimeType,
      fileSize: newVoice.fileSize,
      createdAt: newVoice.createdAt,
      updatedAt: newVoice.updatedAt,
    };
    return NextResponse.json({ ok: true, voice: voiceResponse });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === "23505" || err.message?.includes("exists")) {
      return NextResponse.json({ error: "A voice with this name already exists." }, { status: 400 });
    }
    console.error("[api/dashboard/voices] POST error:", error);
    return NextResponse.json({ error: "Failed to save voice." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Voice ID is required." }, { status: 400 });
    }

    const deleted = await deleteUserVoice(session.userId, id);
    if (!deleted) {
      return NextResponse.json({ error: "Voice not found or access denied." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/dashboard/voices] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete voice." }, { status: 500 });
  }
}
