import assert from "node:assert/strict";
import test from "node:test";

import {
  DashboardJobLimitError,
  assertDashboardJobCountsWithinLimits,
} from "./dashboard-job-limits-core.ts";

test("dashboard job limits allow counts below limits", () => {
  assert.doesNotThrow(() =>
    assertDashboardJobCountsWithinLimits(
      { queued: 2, running: 0 },
      { maxQueued: 3, maxRunning: 1 },
    ),
  );
});

test("dashboard job limits reject when running limit is reached", () => {
  assert.throws(
    () =>
      assertDashboardJobCountsWithinLimits(
        { queued: 0, running: 1 },
        { maxQueued: 3, maxRunning: 1 },
      ),
    (error: unknown) =>
      error instanceof DashboardJobLimitError &&
      error.code === "DASHBOARD_RUNNING_JOB_LIMIT_REACHED" &&
      error.limit === 1,
  );
});

test("dashboard job limits reject when queued limit is reached", () => {
  assert.throws(
    () =>
      assertDashboardJobCountsWithinLimits(
        { queued: 3, running: 0 },
        { maxQueued: 3, maxRunning: 1 },
      ),
    (error: unknown) =>
      error instanceof DashboardJobLimitError &&
      error.code === "DASHBOARD_QUEUED_JOB_LIMIT_REACHED" &&
      error.limit === 3,
  );
});

test("dashboard job limits can be disabled with zero values", () => {
  assert.doesNotThrow(() =>
    assertDashboardJobCountsWithinLimits(
      { queued: 50, running: 50 },
      { maxQueued: 0, maxRunning: 0 },
    ),
  );
});
