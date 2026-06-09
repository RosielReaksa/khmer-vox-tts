import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { getUpstreamEndpoints, updateEndpointCredits } from "./tts-endpoints";

const execAsync = promisify(exec);
const CONFIG_FILE_PATH = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "modal-accounts-config.json");

export interface ModalAccountConfig {
  profile: string;
  initialCredits: number;
  notes: string;
  modelFile?: string;
}

export interface ModalBillingItem {
  Cost?: string;
  cost?: string;
  description?: string;
  Description?: string;
  objectId?: string;
  "Object ID"?: string;
  "Interval Start"?: string;
  [key: string]: unknown;
}

export interface ModalAccountDetail {
  label: string;
  url: string;
  profile: string;
  initialCredits: number;
  notes: string;
  monthlySpend: number;
  remainingCredits: number;
  billingReport: ModalBillingItem[] | null;
  billingError: string | null;
  modelFile?: string;
}

interface BillingCacheEntry {
  spend: number;
  report: ModalBillingItem[] | null;
  error: string | null;
  fetchedAt: number;
}

const billingCache = new Map<string, BillingCacheEntry>();
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes cache

const sentAlerts = new Map<string, number>();
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours cooldown

async function sendTelegramAlert(message: string): Promise<void> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId) {
    console.warn("[Telegram Alert] Bot token or Chat ID is missing. Cannot send alert.");
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });
    if (!res.ok) {
      console.error(`[Telegram Alert] Failed to send Telegram alert: HTTP ${res.status}`);
    }
  } catch (err) {
    console.error("[Telegram Alert] Network error sending Telegram message:", err);
  }
}


export async function readAccountsConfig(): Promise<Record<string, ModalAccountConfig>> {
  try {
    const data = await fs.readFile(CONFIG_FILE_PATH, "utf-8");
    return JSON.parse(data) as Record<string, ModalAccountConfig>;
  } catch {
    return {};
  }
}

export async function writeAccountsConfig(config: Record<string, ModalAccountConfig>): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_FILE_PATH), { recursive: true });
  await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), "utf-8");
}

function extractDefaultProfile(label: string, url: string): string {
  // Try to match label pattern: "Modal Account X (profilename)"
  const labelMatch = label.match(/\(([^)]+)\)/);
  if (labelMatch) return labelMatch[1].trim();

  // Try to extract from URL: https://profilename--appname...
  try {
    const parsed = new URL(url);
    const hostParts = parsed.host.split("--");
    if (hostParts.length > 1) {
      return hostParts[0];
    }
  } catch {
    // Ignore
  }
  return "default";
}

let profileToWorkspacePromise: Promise<Record<string, string>> | null = null;

async function getProfileWorkspaceMap(): Promise<Record<string, string>> {
  if (profileToWorkspacePromise) {
    return profileToWorkspacePromise;
  }
  profileToWorkspacePromise = (async () => {
    try {
      const { stdout } = await execAsync("modal profile list --json", {
        env: {
          ...process.env,
          MODAL_CONFIG_PATH: process.env.MODAL_CONFIG_PATH || path.join(/*turbopackIgnore: true*/ process.cwd(), "data", ".modal.toml"),
        },
      });
      const profiles = JSON.parse(stdout) as Array<{ name: string; workspace: string }>;
      const map: Record<string, string> = {};
      for (const p of profiles) {
        map[p.name] = p.workspace;
      }
      return map;
    } catch (err) {
      console.error("Failed to fetch modal profile list --json, falling back to name mapping:", err);
      // Reset to allow subsequent retries
      profileToWorkspacePromise = null;
      return {};
    }
  })();
  return profileToWorkspacePromise;
}

export async function getModalAccounts(forceRefresh = false): Promise<ModalAccountDetail[]> {
  const endpoints = getUpstreamEndpoints();
  const configMap = await readAccountsConfig();
  const now = Date.now();
  const workspaceMap = await getProfileWorkspaceMap();

  // Map to hold shared promises for concurrent billing fetches by workspace name
  const workspacePromises = new Map<string, Promise<{ spend: number; report: ModalBillingItem[] | null; error: string | null }>>();

  const detailsPromises = endpoints.map(async (ep) => {
    const label = ep.label || `Modal Account ${endpoints.indexOf(ep) + 1}`;
    const url = ep.url;

    // Load or calculate default configuration mapping
    const config = configMap[label] || {
      profile: extractDefaultProfile(label, url),
      initialCredits: 90.0,
      notes: "",
      modelFile: "modal_voxcpm_api.py",
    };

    // If profile mapping was реакsahTR2a, let's map it correctly
    if (config.profile === "reaksaaaa4" && label.includes("reaksaaaa4")) {
      config.profile = "reaksahTR2a";
    }

    const profile = config.profile;
    const initialCredits = config.initialCredits;
    const notes = config.notes;
    const workspace = workspaceMap[profile] || profile;

    let monthlySpend = 0;
    let billingReport: ModalBillingItem[] | null = null;
    let billingError: string | null = null;

    const cached = billingCache.get(workspace);
    if (cached && !forceRefresh && now - cached.fetchedAt < CACHE_DURATION_MS) {
      monthlySpend = cached.spend;
      billingReport = cached.report;
      billingError = cached.error;
    } else {
      let fetchPromise = workspacePromises.get(workspace);
      if (!fetchPromise) {
        fetchPromise = (async () => {
          let stdout = "";
          let billingError: string | null = null;
          let attempts = 0;
          const maxAttempts = 2;

          while (attempts < maxAttempts) {
            try {
              const execResult = await execAsync('modal billing report --for "this month" --json', {
                env: {
                  ...process.env,
                  MODAL_PROFILE: profile,
                  PYTHONIOENCODING: "utf-8",
                  MODAL_CONFIG_PATH: process.env.MODAL_CONFIG_PATH || path.join(/*turbopackIgnore: true*/ process.cwd(), "data", ".modal.toml"),
                },
              });
              stdout = execResult.stdout;
              billingError = null;
              break;
            } catch (err: unknown) {
              attempts++;
              const error = err as Record<string, unknown> & { stderr?: string; stdout?: string };
              const errMsg = err instanceof Error ? err.message : String(err);
              const errStderr = typeof error.stderr === "string" ? error.stderr : "";
              const combinedErr = `${errMsg}\n${errStderr}`;

              if (combinedErr.includes("Rate limit exceeded") && attempts < maxAttempts) {
                console.warn(`[Modal CLI Warning]: Rate limit hit for profile ${profile}, retrying in 1.5 seconds...`);
                await new Promise((resolve) => setTimeout(resolve, 1500));
                continue;
              }

              console.error(`[Modal CLI Error Debug for profile ${profile}]:`, {
                message: err instanceof Error ? err.message : String(err),
                stdout: error.stdout,
                stderr: error.stderr,
                env: {
                  USERPROFILE: process.env.USERPROFILE,
                  HOME: process.env.HOME,
                  HOMEPATH: process.env.HOMEPATH,
                  USERNAME: process.env.USERNAME,
                },
              });

              if (error && typeof error.stdout === "string" && error.stdout.trim().startsWith("[")) {
                stdout = error.stdout;
                billingError = null;
                break;
              } else {
                if (combinedErr.includes("profile") || combinedErr.includes("token")) {
                  billingError = `Modal CLI profile error or unauthenticated token: ${combinedErr.slice(0, 250)}`;
                } else {
                  billingError = `CLI Error: ${combinedErr.slice(0, 250)}`;
                }
              }
            }
          }

          let spend = 0;
          let report: ModalBillingItem[] | null = null;

          if (stdout && !billingError) {
            try {
              const parsedReport = JSON.parse(stdout) as ModalBillingItem[];
              report = parsedReport;

              let sum = 0;
              for (const item of parsedReport) {
                const costVal = parseFloat(item.Cost || item.cost || "0");
                if (!isNaN(costVal)) {
                  sum += costVal;
                }
              }
              spend = parseFloat(sum.toFixed(4));
            } catch (parseErr) {
              billingError = "Failed to parse billing JSON report.";
            }
          }

          return { spend, report, error: billingError };
        })();

        workspacePromises.set(workspace, fetchPromise);
      }

      // Await the shared promise for this workspace
      const res = await fetchPromise;
      monthlySpend = res.spend;
      billingReport = res.report;
      billingError = res.error;

      // Cache it under workspace
      billingCache.set(workspace, {
        spend: monthlySpend,
        report: billingReport,
        error: billingError,
        fetchedAt: now,
      });
    }

    const remainingCredits = parseFloat((initialCredits - monthlySpend).toFixed(4));
    updateEndpointCredits(url, remainingCredits);

    if (remainingCredits < 10.0 && !billingError) {
      const lastAlerted = sentAlerts.get(profile);
      if (!lastAlerted || now - lastAlerted > ALERT_COOLDOWN_MS) {
        sentAlerts.set(profile, now);
        sendTelegramAlert(
          `🚨 <b>[Khmer Vox TTS Alert]</b>\nModal Profile <b><code>${profile}</code></b> (${label}) is running low on credits!\n\n` +
          `• Remaining Credits: <b>$${remainingCredits.toFixed(2)}</b>\n` +
          `• Initial Limit: $${initialCredits.toFixed(2)}\n\n` +
          `Please connect a new Modal account to prevent service downtime.`
        ).catch(err => console.error("Failed to send credit alert message:", err));
      }
    }

    return {
      label,
      url,
      profile,
      initialCredits,
      notes,
      monthlySpend,
      remainingCredits,
      billingReport,
      billingError,
      modelFile: config.modelFile || "modal_voxcpm_api.py",
    };
  });

  return Promise.all(detailsPromises);
}

export function clearModalBillingCache(): void {
  billingCache.clear();
}
