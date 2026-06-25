import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import { getEndpointPoolSnapshot } from "@/lib/tts-endpoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await readSessionFromCookie();
  if (!session) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAdminEmail(session.email)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, session };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const snapshot = getEndpointPoolSnapshot();
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    console.error("[admin/modal/health] snapshot failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to load endpoint pool snapshot.",
      },
      { status: 500 },
    );
  }
}
