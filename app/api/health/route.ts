import { NextResponse } from "next/server";

import { getStoreMode } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const storeMode = getStoreMode();

  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      store: storeMode,
      checks: {
        server: { status: "ok" },
      },
    },
    { status: 200 },
  );
}
