import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getEndpointPoolSnapshot } from "@/lib/tts-endpoints";

// Live snapshot of the TTS upstream round-robin: every account in the pool,
// its cooldown status, which one the round-robin would pick next, and the
// current remaining-credits value (when reported by the Modal account page).
//
// Used by the admin /app/admin/modal page so operators can see *right now*
// which Modal account is serving traffic and which are temporarily disabled.
export const dynamic = "force-dynamic";

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
