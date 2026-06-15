// Focused test for the dashboard-merge job marker helpers in batch-service.
//
// These pure functions decide whether a batch job is a dashboard auto-chunked
// generation (which gets ONE merged full-audio history record) versus an
// intentional Batch Jobs submission (which keeps per-line behaviour). Run with:
//   node --test lib/batch-service.markers.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DASHBOARD_MERGE_JOB_KIND,
  dashboardMergeMetadataJson,
  isDashboardMergeJob,
} from "./batch-merge-marker.ts";

test("dashboardMergeMetadataJson encodes the marker kind", () => {
  const json = dashboardMergeMetadataJson();
  assert.equal(JSON.parse(json).kind, DASHBOARD_MERGE_JOB_KIND);
});

test("isDashboardMergeJob detects a dashboard auto-chunked job", () => {
  assert.equal(isDashboardMergeJob({ metadataJson: dashboardMergeMetadataJson() }), true);
});

test("isDashboardMergeJob is false for intentional batch jobs (no marker)", () => {
  assert.equal(isDashboardMergeJob({ metadataJson: null }), false);
  assert.equal(isDashboardMergeJob({ metadataJson: "" }), false);
  assert.equal(isDashboardMergeJob({ metadataJson: JSON.stringify({ campaign: "ads" }) }), false);
});

test("isDashboardMergeJob is false for user metadata that happens to be JSON", () => {
  assert.equal(isDashboardMergeJob({ metadataJson: JSON.stringify({ kind: "something_else" }) }), false);
});

test("isDashboardMergeJob does not throw on malformed metadata", () => {
  assert.doesNotThrow(() => isDashboardMergeJob({ metadataJson: "{not valid json" }));
  assert.equal(isDashboardMergeJob({ metadataJson: "{not valid json" }), false);
});
