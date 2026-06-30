export type DashboardJobCounts = {
  queued: number;
  running: number;
};

export class DashboardJobLimitError extends Error {
  status = 429;
  code: "DASHBOARD_RUNNING_JOB_LIMIT_REACHED" | "DASHBOARD_QUEUED_JOB_LIMIT_REACHED";
  counts: DashboardJobCounts;
  limit: number;

  constructor(
    message: string,
    code: "DASHBOARD_RUNNING_JOB_LIMIT_REACHED" | "DASHBOARD_QUEUED_JOB_LIMIT_REACHED",
    counts: DashboardJobCounts,
    limit: number,
  ) {
    super(message);
    this.code = code;
    this.counts = counts;
    this.limit = limit;
  }
}

export function assertDashboardJobCountsWithinLimits(
  counts: DashboardJobCounts,
  limits: { maxRunning: number; maxQueued: number },
): void {
  if (limits.maxRunning > 0 && counts.running >= limits.maxRunning) {
    throw new DashboardJobLimitError(
      "You already have an audio generation running. Please wait for it to finish before starting another.",
      "DASHBOARD_RUNNING_JOB_LIMIT_REACHED",
      counts,
      limits.maxRunning,
    );
  }

  if (limits.maxQueued > 0 && counts.queued >= limits.maxQueued) {
    throw new DashboardJobLimitError(
      "You already have audio jobs waiting in the queue. Please wait for one to start or finish before adding more.",
      "DASHBOARD_QUEUED_JOB_LIMIT_REACHED",
      counts,
      limits.maxQueued,
    );
  }
}
