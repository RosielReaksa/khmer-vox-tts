/**
 * Local-only seed: create a PAID user with an approved order and a fresh API
 * key so a real end-to-end call to /api/v1/audio/speech can authenticate.
 *
 * Uses the project's own store layer (JSON store in local dev, since there is
 * no DATABASE_URL). The raw API key is printed and written to
 * test-output/seed-key.txt (the store only keeps the hash, so we must capture
 * it here). Run: npx tsx scripts/seed-paid-api-user.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const store = await import("../lib/store");
const security = await import("../lib/security");

const email = `apitest+${Date.now()}@example.test`;
const passwordHash = await security.hashPassword("ApiTest123!");
const user = await store.createUserWithSignupBonus(email, passwordHash);

const order = await store.createPaymentOrder({
  userId: user.id,
  planId: "creator",
  planName: "Creator",
  quantity: 1,
  unitPriceCents: 150,
  tokensPerPack: 10_000,
  userNote: "seed paid api user (local e2e test)",
  paymentReference: null,
  proofImageDataUrl: null,
});

const approved = await store.approvePaymentOrder({
  orderId: order.id,
  adminUserId: user.id,
  adminNote: "seed (local e2e test)",
});

const gen = security.generateApiKey();
const key = await store.createApiKey(user.id, "API E2E Test Key", gen.keyPrefix, gen.keyHash);
const balance = await store.getUserTokenBalance(user.id);

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "test-output");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "seed-key.txt"), gen.rawKey);

console.log("=== Seed paid API user ===");
console.log(`email:          ${email}`);
console.log(`userId:         ${user.id}`);
console.log(`orderApproved:  ${approved.ok} (status=${approved.order?.status ?? "?"})`);
console.log(`tokenBalance:   ${balance}`);
console.log(`keyPrefix:      ${key.keyPrefix}`);
console.log(`rawKey:         ${gen.rawKey}`);
console.log(`saved key to:   ${join(outDir, "seed-key.txt")}`);
