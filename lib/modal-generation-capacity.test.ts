import assert from "node:assert/strict";
import test from "node:test";

const originalEnv = { ...process.env };

async function loadModule() {
  return import(`./modal-generation-capacity-core.ts?test=${Date.now()}-${Math.random()}`);
}

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test("modal capacity limiter is disabled when max active generations is zero", async () => {
  process.env.NODE_ENV = "test";
  process.env.MODAL_MAX_ACTIVE_GENERATIONS = "0";
  delete process.env.DATABASE_URL;

  const { acquireModalGenerationLease } = await loadModule();
  const lease = await acquireModalGenerationLease();

  assert.equal(lease.enabled, false);
  await lease.release();
});

test("modal capacity limiter tracks memory leases and releases capacity", async () => {
  process.env.NODE_ENV = "test";
  process.env.MODAL_MAX_ACTIVE_GENERATIONS = "1";
  process.env.MODAL_GENERATION_ACQUIRE_TIMEOUT_MS = "0";
  delete process.env.DATABASE_URL;

  const {
    acquireModalGenerationLease,
    activeMemoryModalGenerationLeases,
  } = await loadModule();

  const lease = await acquireModalGenerationLease();
  assert.equal(lease.enabled, true);
  assert.equal(activeMemoryModalGenerationLeases(), 1);

  await assert.rejects(
    () => acquireModalGenerationLease(),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("Modal generation capacity is full"),
  );

  await lease.release();
  assert.equal(activeMemoryModalGenerationLeases(), 0);

  const nextLease = await acquireModalGenerationLease();
  await nextLease.release();
});
