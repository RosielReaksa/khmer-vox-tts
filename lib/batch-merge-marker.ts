// Pure, dependency-free helpers for the dashboard-merge job marker.
//
// Kept separate from batch-service so they can be unit-tested without pulling
// in the "server-only" import chain. A dashboard auto-chunked generation tags
// its batch job with this marker so the worker (a) hides the per-chunk segment
// records from History and (b) saves ONE merged full-audio history record on
// completion. Intentional Batch Jobs submissions do not carry the marker.

export const DASHBOARD_MERGE_JOB_KIND = "dashboard_merge";

export function dashboardMergeMetadataJson(): string {
  return JSON.stringify({ kind: DASHBOARD_MERGE_JOB_KIND });
}

export function isDashboardMergeJob(job: { metadataJson: string | null }): boolean {
  if (!job.metadataJson) return false;
  try {
    const parsed = JSON.parse(job.metadataJson) as { kind?: unknown };
    return parsed?.kind === DASHBOARD_MERGE_JOB_KIND;
  } catch {
    return false;
  }
}
