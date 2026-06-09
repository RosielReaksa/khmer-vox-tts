import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvValue(raw) {
  const trimmed = raw.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
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
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function run() {
  await loadEnvFile(".env");
  await loadEnvFile(".env.local", true);

  const orderId = process.argv[2];
  if (!orderId) {
    console.error("Error: Please provide an Order ID as the first argument.");
    console.log("Usage: node scripts/simulate-payment.mjs <orderId> [amount_usd]");
    process.exit(1);
  }

  const amountUsd = process.argv[3] || "5.00";
  const txnId = "TXN_SIM_" + Math.random().toString(36).slice(2, 11).toUpperCase();

  const payload = {
    update_id: Math.floor(Math.random() * 100000),
    message: {
      message_id: Math.floor(Math.random() * 10000),
      from: { id: 50001, is_bot: true, username: "PayWay" },
      chat: { id: -1004296512360, type: "supergroup" },
      date: Math.floor(Date.now() / 1000),
      text: `Payment Success!\nAmount: $${amountUsd} USD\nTransaction ID: ${txnId}\nRemark: ${orderId}`
    }
  };

  console.log(`Sending simulated Telegram payment alert for Order ${orderId}...`);
  console.log(`Payload text:\n---\n${payload.message.text}\n---`);

  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim().replace(/^"|"$/g, "");
  const headers = { "Content-Type": "application/json" };
  if (secret) {
    headers["x-telegram-webhook-secret"] = secret;
  }

  const baseUrl = (process.env.APP_PUBLIC_URL || "http://localhost:3000").trim().replace(/\/$/, "");
  try {
    const response = await fetch(`${baseUrl}/api/webhooks/telegram/payment`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log("\nWebhook Response:");
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`\nFailed to connect to server at ${baseUrl}. Make sure the target server is running.`);
    console.error(error.message);
  }
}

run();
