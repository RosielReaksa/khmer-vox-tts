import { NextResponse } from "next/server";

import { listUserBatchJobs } from "@/lib/store";
import { readSessionFromCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await listUserBatchJobs(session.userId, { limit: 80 });
  return NextResponse.json({ jobs });
}
