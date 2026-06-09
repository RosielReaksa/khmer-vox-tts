import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/lib/admin-api";
import { getBatchJobWithItems } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await props.params;
  const data = await getBatchJobWithItems(id);
  if (!data) {
    return NextResponse.json({ error: "Batch job not found." }, { status: 404 });
  }

  return NextResponse.json({
    job: data.job,
    items: data.items,
  });
}
