// Focused test for the speech-workspace refresh-persistence logic.
//
// Run with:  node --test app/app/dashboard/workspace-persistence.test.ts
//
// It uses a fake localStorage (no DOM needed) and simulates the mount-time
// restore decision used by SpeechWorkspace to prove that:
//   - a completed result survives a "refresh" (in-memory state wiped),
//   - an in-flight job id takes priority (reconnect/poll),
//   - starting a new generation clears stale results,
//   - corrupt/oversized storage degrades gracefully.

import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";

import {
  activeJobStorageKey,
  clearActiveJob,
  clearResult,
  persistActiveJob,
  persistResult,
  readActiveJob,
  readResult,
  resultStorageKey,
  type PersistedResult,
  type WorkspaceGenerationResult,
} from "./workspace-persistence.ts";

// --- fake localStorage ------------------------------------------------------
class FakeStorage {
  private map = new Map<string, string>();
  // when true, setItem throws like a quota error
  throwOnSet = false;
  getItem(k: string): string | null {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    if (this.throwOnSet) throw new Error("QuotaExceededError");
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

function installStorage(): FakeStorage {
  const store = new FakeStorage();
  // The module reads window.localStorage; provide a minimal global window.
  (globalThis as unknown as { window: unknown }).window = { localStorage: store };
  return store;
}

function sampleResult(overrides: Partial<WorkspaceGenerationResult> = {}): WorkspaceGenerationResult {
  return {
    generationId: "gen_123",
    audioBase64: "QUJDRA==",
    contentType: "audio/wav",
    creditsRequested: 10,
    creditsCharged: 10,
    remainingTokens: 990,
    outputSeconds: 3.2,
    latencyMs: 1500,
    model: "voxcpm2",
    upstreamRequestId: null,
    ...overrides,
  };
}

// Mirrors the SpeechWorkspace mount effect: decide what to restore after a
// refresh, given that in-memory snapshot.result is null (refresh wiped it).
type RestoreAction =
  | { kind: "reconnect"; jobId: string }
  | { kind: "restore"; payload: PersistedResult }
  | { kind: "none" };

function decideMountRestore(mode: "tts" | "clone", snapshotHasResult: boolean): RestoreAction {
  const storedJobId = readActiveJob(mode);
  if (storedJobId) {
    if (snapshotHasResult) {
      clearActiveJob(mode);
      return { kind: "none" };
    }
    return { kind: "reconnect", jobId: storedJobId };
  }
  if (!snapshotHasResult) {
    const stored = readResult(mode);
    if (stored) return { kind: "restore", payload: stored };
  }
  return { kind: "none" };
}

let storage: FakeStorage;
beforeEach(() => {
  storage = installStorage();
});

test("storage keys are namespaced per mode", () => {
  assert.equal(resultStorageKey("tts"), "voxtts:result:tts");
  assert.equal(resultStorageKey("clone"), "voxtts:result:clone");
  assert.equal(activeJobStorageKey("tts"), "voxtts:activeJob:tts");
});

test("completed result survives a refresh (restored on mount)", () => {
  const payload: PersistedResult = { result: sampleResult(), updatedAtLabel: "10:30:00 AM" };
  persistResult("tts", payload);

  // Simulate refresh: in-memory snapshot.result is null, but storage persists.
  const action = decideMountRestore("tts", false);
  assert.equal(action.kind, "restore");
  if (action.kind === "restore") {
    assert.equal(action.payload.result.generationId, "gen_123");
    assert.equal(action.payload.updatedAtLabel, "10:30:00 AM");
  }
});

test("tts and clone results do not collide", () => {
  persistResult("tts", { result: sampleResult({ generationId: "tts_1" }), updatedAtLabel: "a" });
  persistResult("clone", { result: sampleResult({ generationId: "clone_1" }), updatedAtLabel: "b" });
  assert.equal(readResult("tts")?.result.generationId, "tts_1");
  assert.equal(readResult("clone")?.result.generationId, "clone_1");
});

test("in-flight job takes priority over a stored result (reconnect)", () => {
  persistResult("tts", { result: sampleResult(), updatedAtLabel: "x" });
  persistActiveJob("tts", "job_abc");
  const action = decideMountRestore("tts", false);
  assert.equal(action.kind, "reconnect");
  if (action.kind === "reconnect") assert.equal(action.jobId, "job_abc");
});

test("stale job id is cleared when a result is already in memory", () => {
  persistActiveJob("tts", "job_stale");
  const action = decideMountRestore("tts", true);
  assert.equal(action.kind, "none");
  assert.equal(readActiveJob("tts"), null, "stale job id should be cleared");
});

test("starting a new generation clears the previous result", () => {
  persistResult("tts", { result: sampleResult(), updatedAtLabel: "old" });
  clearResult("tts"); // what onGenerate() does before a new run
  assert.equal(readResult("tts"), null);
  // A refresh mid-run (no job id yet) must NOT restore stale audio.
  assert.equal(decideMountRestore("tts", false).kind, "none");
});

test("corrupt stored JSON is ignored, not thrown", () => {
  storage.setItem(resultStorageKey("tts"), "{not valid json");
  assert.equal(readResult("tts"), null);
});

test("stored result without inline audio or audio url is rejected", () => {
  storage.setItem(resultStorageKey("tts"), JSON.stringify({ result: { generationId: "x" }, updatedAtLabel: "y" }));
  assert.equal(readResult("tts"), null);
});

test("stored result with streamed audio url is accepted", () => {
  const payload: PersistedResult = {
    result: sampleResult({
      audioBase64: undefined,
      audioUrl: "/api/batch/jobs/job_1/merged/audio",
    }),
    updatedAtLabel: "11:00:00 AM",
  };
  persistResult("tts", payload);
  assert.equal(readResult("tts")?.result.audioUrl, "/api/batch/jobs/job_1/merged/audio");
});

test("quota error on persist is non-fatal and skips restore", () => {
  storage.throwOnSet = true;
  assert.doesNotThrow(() => persistResult("tts", { result: sampleResult(), updatedAtLabel: "z" }));
  assert.equal(readResult("tts"), null);
  assert.equal(decideMountRestore("tts", false).kind, "none");
});

test("no stored state restores nothing", () => {
  assert.equal(decideMountRestore("tts", false).kind, "none");
});
