import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const offsetPath = path.join(rootDir, "data", "telegram-payment-offset.json");

function parseEnvValue(raw) {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function loadEnvFile(filename, override = false) {
  const fullPath = path.join(rootDir, filename);
  let text;
  try {
    text = await fs.readFile(fullPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt === -1) continue;
    const key = trimmed.slice(0, equalsAt).trim();
    const value = parseEnvValue(trimmed.slice(equalsAt + 1));
    if (!key) continue;
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
}

async function loadEnvironment() {
  await loadEnvFile(".env");
  await loadEnvFile(".env.local", true);
}

async function readOffset() {
  try {
    const data = JSON.parse(await fs.readFile(offsetPath, "utf8"));
    return Number.isInteger(data.offset) ? data.offset : 0;
  } catch {
    return 0;
  }
}

async function writeOffset(offset) {
  await fs.mkdir(path.dirname(offsetPath), { recursive: true });
  await fs.writeFile(offsetPath, `${JSON.stringify({ offset }, null, 2)}\n`, "utf8");
}

function cleanEnv(key) {
  return (process.env[key] || "").trim().replace(/^"|"$/g, "");
}

async function main() {
  await loadEnvironment();

  const token = cleanEnv("TELEGRAM_BOT_TOKEN");
  const webhookSecret = cleanEnv("TELEGRAM_WEBHOOK_SECRET");
  const baseUrl = (process.env.SMOKE_BASE_URL || process.env.APP_LOCAL_URL || "http://localhost:3000").replace(/\/$/, "");
  const once = process.argv.includes("--once");
  const intervalMs = Number(process.env.TELEGRAM_PAYMENT_POLL_INTERVAL_MS || 5000);

  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set.");

  console.log("Telegram payment poller");
  console.log(`Webhook target: ${baseUrl}/api/webhooks/telegram/payment`);
  console.log(`Mode: ${once ? "once" : "loop"}`);

  let offset = await readOffset();

  async function pollOnce() {
    const params = new URLSearchParams({
      timeout: "20",
      allowed_updates: JSON.stringify(["message", "edited_message", "channel_post", "edited_channel_post"]),
    });
    if (offset > 0) params.set("offset", String(offset));

    const updatesResponse = await fetch(`https://api.telegram.org/bot${token}/getUpdates?${params}`);
    const updatesData = await updatesResponse.json();
    if (!updatesResponse.ok || !updatesData.ok) {
      throw new Error(`Telegram getUpdates failed: ${updatesResponse.status}`);
    }

    const updates = Array.isArray(updatesData.result) ? updatesData.result : [];
    for (const update of updates) {
      const updateId = Number(update.update_id);
      const headers = new Headers({ "Content-Type": "application/json" });
      if (webhookSecret) headers.set("x-telegram-webhook-secret", webhookSecret);

      const response = await fetch(`${baseUrl}/api/webhooks/telegram/payment`, {
        method: "POST",
        headers,
        body: JSON.stringify(update),
      });
      const body = await response.text();
      console.log(`update ${updateId}: HTTP ${response.status} ${body}`);

      if (Number.isInteger(updateId)) {
        offset = Math.max(offset, updateId + 1);
        await writeOffset(offset);
      }
    }

    if (updates.length === 0) console.log("No new Telegram updates.");
  }

  do {
    await pollOnce();
    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (true);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
