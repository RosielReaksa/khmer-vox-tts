import "server-only";

import { getDashboardBatchJobCounts } from "@/lib/store";
import {
  assertDashboardJobCountsWithinLimits,
  DashboardJobLimitError,
  type DashboardJobCounts,
} from "@/lib/dashboard-job-limits-core";

function readNonNegativeInt(name: string, fallback: number): number {
  const value = Number((process.env[name] ?? "").trim());
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

export function dashboardMaxRunningJobsPerUser(): number {
  return readNonNegativeInt("DASHBOARD_MAX_RUNNING_JOBS_PER_USER", 1);
}

export function dashboardMaxQueuedJobsPerUser(): number {
  return readNonNegativeInt("DASHBOARD_MAX_QUEUED_JOBS_PER_USER", 3);
}

export async function assertDashboardJobCapacity(userId: string): Promise<DashboardJobCounts> {
  const counts = await getDashboardBatchJobCounts(userId);
  assertDashboardJobCountsWithinLimits(counts, {
    maxRunning: dashboardMaxRunningJobsPerUser(),
    maxQueued: dashboardMaxQueuedJobsPerUser(),
  });
  return counts;
}

export { DashboardJobLimitError };
