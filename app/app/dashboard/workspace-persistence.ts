// Persistence helpers for the speech workspace generate panels (TTS + Clone).
//
// A page refresh wipes the in-memory workspaceSnapshots, so these helpers
// persist the minimum needed to localStorage and restore it on mount:
//   - the in-flight background job id (reconnect + keep polling), and
//   - the last COMPLETED result (restore the audio instead of "No audio yet").
//
// Every access is wrapped in try/catch because localStorage can be unavailable
// (SSR, private mode) or throw on quota (large base64 audio); failures are
// non-fatal and simply skip cross-refresh restore.

export type WorkspaceMode = "tts" | "clone";

export type WorkspaceGenerationResult = {
  generationId: string;
  audioBase64?: string;
  audioUrl?: string;
  contentType: string;
  creditsRequested: number;
  creditsCharged: number;
  remainingTokens: number;
  outputSeconds: number;
  latencyMs: number;
  model: string;
  upstreamRequestId: string | null;
};

export type PersistedResult = {
  result: WorkspaceGenerationResult;
  updatedAtLabel: string;
};

// Minimal storage surface so this module is testable without a real DOM:
// any object implementing getItem/setItem/removeItem works.
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStore(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

// --- in-flight background job id -------------------------------------------
export const activeJobStorageKey = (mode: WorkspaceMode) => `voxtts:activeJob:${mode}`;

export function persistActiveJob(mode: WorkspaceMode, jobId: string) {
  try {
    getStore()?.setItem(activeJobStorageKey(mode), jobId);
  } catch {
    /* localStorage unavailable (private mode / SSR): non-fatal */
  }
}

export function clearActiveJob(mode: WorkspaceMode) {
  try {
    getStore()?.removeItem(activeJobStorageKey(mode));
  } catch {
    /* non-fatal */
  }
}

export function readActiveJob(mode: WorkspaceMode): string | null {
  try {
    return getStore()?.getItem(activeJobStorageKey(mode)) ?? null;
  } catch {
    return null;
  }
}

// --- last completed result --------------------------------------------------
export const resultStorageKey = (mode: WorkspaceMode) => `voxtts:result:${mode}`;

export function persistResult(mode: WorkspaceMode, payload: PersistedResult) {
  try {
    getStore()?.setItem(resultStorageKey(mode), JSON.stringify(payload));
  } catch {
    // localStorage unavailable or over quota (large audio): non-fatal. The
    // in-memory snapshot still works for the current session; only cross-
    // refresh restore is skipped.
  }
}

export function clearResult(mode: WorkspaceMode) {
  try {
    getStore()?.removeItem(resultStorageKey(mode));
  } catch {
    /* non-fatal */
  }
}

export function readResult(mode: WorkspaceMode): PersistedResult | null {
  try {
    const raw = getStore()?.getItem(resultStorageKey(mode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedResult;
    const hasAudio = typeof parsed?.result?.audioBase64 === "string" ||
      typeof parsed?.result?.audioUrl === "string";
    if (!parsed || !parsed.result || !hasAudio) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}


// --- clone sample (recorded voice reference) ---------------------------------
// The clone sample is a File object that lives in JS memory only. Without
// persistence it is lost the moment the user navigates away from the clone
// workspace (DashboardSpa unmounts SpeechWorkspace, dropping module state on
// hard refresh). We store the audio bytes as base64 + a few metadata fields
// so the file can be rehydrated on remount.
//
// localStorage caps at ~5MB; a 30-second voice clip is ~300KB at opus/webm, so
// this is safe. We wrap every operation in try/catch because quota / private
// mode failures are non-fatal - the user just loses cross-nav restore.
export const cloneSampleStorageKey = (mode: WorkspaceMode) =>
  `voxtts:cloneSample:${mode}`;

export type PersistedCloneSample = {
  name: string;
  type: string;
  base64: string;
  recordedAt: number;
};

export function persistCloneSample(
  mode: WorkspaceMode,
  payload: PersistedCloneSample,
) {
  try {
    getStore()?.setItem(
      cloneSampleStorageKey(mode),
      JSON.stringify(payload),
    );
  } catch {
    // localStorage unavailable or over quota (rare for short clips).
    // Non-fatal; user can simply re-record on next visit.
  }
}

export function clearCloneSample(mode: WorkspaceMode) {
  try {
    getStore()?.removeItem(cloneSampleStorageKey(mode));
  } catch {
    /* non-fatal */
  }
}

export function readCloneSample(mode: WorkspaceMode): PersistedCloneSample | null {
  try {
    const raw = getStore()?.getItem(cloneSampleStorageKey(mode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedCloneSample;
    if (
      !parsed ||
      typeof parsed.base64 !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.type !== "string" ||
      parsed.base64.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}