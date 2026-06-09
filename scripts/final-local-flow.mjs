import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.SMOKE_BASE_URL || "http://localhost:3000",
    liveTts: false,
    approve: false,
    adminEmail: process.env.SMOKE_ADMIN_EMAIL || "",
    adminPassword: process.env.SMOKE_ADMIN_PASSWORD || "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--live-tts") {
      args.liveTts = true;
      continue;
    }
    if (value === "--approve") {
      args.approve = true;
      continue;
    }
    if (value.startsWith("--")) {
      const [rawKey, rawValue] = value.includes("=")
        ? value.split(/=(.*)/s, 2)
        : [value, argv[index + 1]];
      if (!value.includes("=")) index += 1;
      const key = rawKey.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (key in args && rawValue !== undefined) {
        args[key] = rawValue;
      }
    }
  }

  args.baseUrl = String(args.baseUrl).replace(/\/$/, "");
  return args;
}

function runStep(label, script, args) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, [path.join(rootDir, "scripts", script), ...args], {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

const args = parseArgs(process.argv.slice(2));
const common = [`--base-url=${args.baseUrl}`];
const adminArgs =
  args.approve && args.adminEmail && args.adminPassword
    ? [`--admin-email=${args.adminEmail}`, `--admin-password=${args.adminPassword}`]
    : [];

console.log("Final local flow");
console.log(`Base URL: ${args.baseUrl}`);
console.log(`Admin approval: ${args.approve ? "enabled" : "skipped"}`);
console.log(`Live TTS: ${args.liveTts ? "enabled" : "skipped"}`);

runStep("Payment order and approval smoke", "payment-smoke.mjs", [
  ...common,
  ...(args.approve ? ["--approve", ...adminArgs] : []),
]);

runStep("PayWay webhook crediting smoke", "payway-webhook-smoke.mjs", [
  ...common,
  "--allow-non-localhost"
]);

runStep("Telegram payment monitor smoke", "telegram-payment-smoke.mjs", [
  ...common,
  ...(args.approve ? ["--approve", ...adminArgs] : []),
]);

runStep("Prelaunch app and API smoke", "prelaunch-smoke.mjs", [
  ...common,
  ...(args.liveTts ? ["--live-tts"] : []),
  ...(args.approve ? ["--approve", ...adminArgs] : []),
]);

console.log("\nRESULT PASS");
console.log("Local payment, webhook, account, API key, and optional live TTS flow are working.");
