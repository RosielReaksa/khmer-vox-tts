import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";
import { listBatchJobsForAdmin } from "@/lib/store";

export const runtime = "nodejs";

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await listBatchJobsForAdmin({ limit: 500, status: "all" });
  const rows = [
    [
      "id",
      "user_email",
      "external_id",
      "title",
      "mode",
      "source",
      "status",
      "webhook_status",
      "webhook_attempts",
      "webhook_last_error",
      "total_items",
      "completed_items",
      "failed_items",
      "credits_estimated",
      "credits_charged",
      "output_seconds",
      "created_at",
    ],
    ...jobs.map((job) => [
      job.id,
      job.userEmail,
      job.externalId,
      job.title,
      job.mode,
      job.source,
      job.status,
      job.webhookStatus,
      job.webhookAttempts,
      job.webhookLastError,
      job.totalItems,
      job.completedItems,
      job.failedItems,
      job.creditsEstimated,
      job.creditsCharged,
      job.outputSeconds,
      job.createdAt,
    ]),
  ];
  const csv = `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=batch-jobs.csv",
    },
  });
}
