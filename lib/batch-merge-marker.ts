// Pure, dependency-free helpers for the dashboard-merge job marker.
//
// Kept separate from batch-service so they can be unit-tested without pulling
// in the "server-only" import chain. A dashboard auto-chunked generation tags
// its batch job with this marker so the worker (a) hides the per-chunk segment
// records from History and (b) saves ONE merged full-audio history record on
// completion. Intentional Batch Jobs submissions do not carry the marker.

export const DASHBOARD_MERGE_JOB_KIND = "dashboard_merge";

import { normalizeVoiceStyle, type VoiceStylePreset } from "@/lib/voice-defaults";

// Optional flags carried alongside the dashboard-merge marker. Kept additive so
// older jobs (marker only, no flags) keep parsing correctly.
export type DashboardMergeOptions = {
  // Opt-in ZipEnhancer reference-audio denoise for clone jobs (default off).
  denoiseReference?: boolean;
  // Per-job voice style preset (prosody). Default off = "normal".
  voiceStyle?: VoiceStylePreset;
};

export function dashboardMergeMetadataJson(options?: DashboardMergeOptions): string {
  const payload: Record<string, unknown> = { kind: DASHBOARD_MERGE_JOB_KIND };
  if (options?.denoiseReference === true) {
    payload.denoiseReference = true;
  }
  const style = normalizeVoiceStyle(options?.voiceStyle);
  if (style !== "normal") {
    payload.voiceStyle = style;
  }
  return JSON.stringify(payload);
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

// Reads optional dashboard-merge flags. Returns false-y defaults for legacy or
// malformed metadata so callers never have to special-case missing fields.
export function readDashboardMergeOptions(job: { metadataJson: string | null }): DashboardMergeOptions {
  if (!job.metadataJson) return {};
  try {
    const parsed = JSON.parse(job.metadataJson) as {
      kind?: unknown;
      denoiseReference?: unknown;
      voiceStyle?: unknown;
    };
    if (parsed?.kind !== DASHBOARD_MERGE_JOB_KIND) return {};
    return {
      denoiseReference: parsed.denoiseReference === true,
      voiceStyle: normalizeVoiceStyle(parsed.voiceStyle),
    };
  } catch {
    return {};
  }
}
