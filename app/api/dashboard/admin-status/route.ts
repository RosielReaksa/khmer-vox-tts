import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getSystemSetting } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const active = await getSystemSetting("admin_active", "true");
  return NextResponse.json({ active: active === "true" });
}
