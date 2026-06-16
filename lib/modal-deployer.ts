import { spawn, type ChildProcess } from "child_process";
import fs from "fs/promises";
import path from "path";
import { forceReloadEndpoints, getUpstreamEndpoints } from "./tts-endpoints";
import { readAccountsConfig, writeAccountsConfig, clearModalBillingCache } from "./modal-accounts";

function getModalSrcDir(): string {
  if (process.env.MODAL_SRC_DIR) return process.env.MODAL_SRC_DIR;
  return path.join(process.cwd(), "modal");
}

// Idle-cost control applied to every Modal deploy the website performs.
// The Modal app (modal_voxcpm_api.py) reads VOXCPM_SCALEDOWN_WINDOW at deploy
// time and bakes it into the GPU container's scaledown_window, i.e. how many
// seconds a GPU stays warm (and billed) after its last request before scaling
// to zero. Injecting it here means every account connected through the admin
// page -- now and in the future -- automatically gets the same warm window
// without any per-account manual step. Override with the env var if needed.
const DEPLOY_SCALEDOWN_WINDOW = (process.env.VOXCPM_SCALEDOWN_WINDOW || "120").trim();

// Diffusion decode steps baked into every deploy. Lower = faster generation
// with a modest quality tradeoff. Injected here (like the scaledown window) so
// every account connected through the admin page stays consistent. Default 8
// (down from the upstream 10). Override with VOXCPM_INFERENCE_TIMESTEPS.
const DEPLOY_INFERENCE_TIMESTEPS = (process.env.VOXCPM_INFERENCE_TIMESTEPS || "8").trim();

// Builds the environment passed to every spawned `modal` CLI call so deploy
// settings (like the scaledown window) are applied consistently.
function buildModalEnv(profile: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    MODAL_CONFIG_PATH:
      process.env.MODAL_CONFIG_PATH || path.join(process.cwd(), "data", ".modal.toml"),
    MODAL_PROFILE: profile,
    // Force the cost-saving warm window into the deploy regardless of the
    // value baked into the Python default, so all accounts stay consistent.
    VOXCPM_SCALEDOWN_WINDOW: DEPLOY_SCALEDOWN_WINDOW,
    // Force the diffusion decode steps into every deploy for consistent speed.
    VOXCPM_INFERENCE_TIMESTEPS: DEPLOY_INFERENCE_TIMESTEPS,
  };
}

// Defense-in-depth against command injection: the Modal CLI is spawned with
// shell:true (needed for cross-platform `modal`/`modal.cmd` resolution), so any
// user-influenced argument must be free of shell metacharacters before spawn.
const MODAL_SAFE_ARG = /^[A-Za-z0-9._:/-]+$/;

function assertSafeModalArg(value: string, fieldName: string): void {
  if (!MODAL_SAFE_ARG.test(value)) {
    throw new Error(`${fieldName} contains characters that are not allowed.`);
  }
}

export async function listModelFiles(): Promise<string[]> {
  const dirPath = getModalSrcDir();
  try {
    const files = await fs.readdir(dirPath);
    return files.filter(f => f.endsWith(".py") && (f.startsWith("modal_") || f === "modal_voxcpm_api.py"));
  } catch {
    return ["modal_voxcpm_api.py"];
  }
}

export interface DeployStatus {
  status: "idle" | "configuring_token" | "creating_secret" | "deploying" | "success" | "failed";
  progress: string;
  error: string | null;
  deployedUrl: string | null;
}

const STATUS_FILE_PATH = path.join(process.cwd(), "data", "modal-deploy-status.json");

let currentDeployStatus: DeployStatus = {
  status: "idle",
  progress: "",
  error: null,
  deployedUrl: null,
};

let activeChildProcess: ChildProcess | null = null;
let writeQueue = Promise.resolve();
let saveTimeout: NodeJS.Timeout | null = null;

async function persistStatusImmediate(): Promise<void> {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  const content = JSON.stringify(currentDeployStatus, null, 2);
  writeQueue = writeQueue.then(async () => {
    try {
      await fs.mkdir(path.dirname(STATUS_FILE_PATH), { recursive: true });
      await fs.writeFile(STATUS_FILE_PATH, content, "utf-8");
    } catch (err) {
      console.error("Failed to write deploy status file", err);
    }
  });
  await writeQueue;
}

function persistStatusDebounced(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    const content = JSON.stringify(currentDeployStatus, null, 2);
    writeQueue = writeQueue.then(async () => {
      try {
        await fs.mkdir(path.dirname(STATUS_FILE_PATH), { recursive: true });
        await fs.writeFile(STATUS_FILE_PATH, content, "utf-8");
      } catch (err) {
        console.error("Failed to write deploy status file", err);
      }
    });
  }, 200);
}

export async function getDeployStatus(): Promise<DeployStatus> {
  try {
    const data = await fs.readFile(STATUS_FILE_PATH, "utf-8");
    const parsed = JSON.parse(data) as DeployStatus;
    currentDeployStatus = parsed;
    return parsed;
  } catch {
    return currentDeployStatus;
  }
}

function resetDeployStatusInMemory(): void {
  currentDeployStatus = {
    status: "idle",
    progress: "",
    error: null,
    deployedUrl: null,
  };
}

export async function resetDeployStatus(): Promise<void> {
  resetDeployStatusInMemory();
  await persistStatusImmediate();
}

async function readApiKeyFromConfiguredSources(): Promise<string> {
  const envKey = process.env.VOXCPM_API_KEY?.trim();
  if (envKey) {
    return envKey;
  }

  const configuredEndpointKey = getUpstreamEndpoints()
    .map((endpoint) => endpoint.token?.trim())
    .find((token): token is string => Boolean(token));
  if (configuredEndpointKey) {
    return configuredEndpointKey;
  }

  const singleEndpointKey = process.env.TTS_UPSTREAM_TOKEN?.trim();
  if (singleEndpointKey) {
    return singleEndpointKey;
  }

  const filePath = path.join(getModalSrcDir(), "NEW_VOXCPM_API_KEY.txt");
  try {
    const key = await fs.readFile(filePath, "utf-8");
    const trimmed = key.trim();
    if (trimmed) return trimmed;
  } catch {}

  throw new Error(
    "No VoxCPM API key is configured. Add VOXCPM_API_KEY or TTS_UPSTREAM_TOKEN to the server environment before connecting a Modal account.",
  );
}

interface ModalPoolItem {
  url: string;
  token: string;
  label: string;
}

function parsePool(value: string): ModalPoolItem[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const record = (item ?? {}) as Record<string, unknown>;
        return {
          url: String(record.url ?? "").trim(),
          token: String(record.token ?? "").trim(),
          label: String(record.label ?? "").trim(),
        };
      })
      .filter((item) => item.url);
  } catch {
    return [];
  }
}

function readPoolFromEnvContent(content: string): ModalPoolItem[] {
  const match = content.match(/^TTS_UPSTREAM_POOL=(['"])(.*?)\1/m);
  return match ? parsePool(match[2]) : [];
}

function normalizedEndpointUrl(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

function mergePoolItems(...pools: ModalPoolItem[][]): ModalPoolItem[] {
  const merged = new Map<string, ModalPoolItem>();
  for (const pool of pools) {
    for (const item of pool) {
      const key = normalizedEndpointUrl(item.url);
      if (!key) continue;
      const existing = merged.get(key);
      merged.set(key, {
        url: item.url,
        token: item.token || existing?.token || "",
        label: item.label || existing?.label || "",
      });
    }
  }
  return [...merged.values()];
}

async function readPoolFile(poolPath: string): Promise<ModalPoolItem[]> {
  try {
    return parsePool(await fs.readFile(poolPath, "utf-8"));
  } catch {
    return [];
  }
}

function updatePoolInEnvContent(content: string, pool: ModalPoolItem[]): string {
  const newPoolLine = `TTS_UPSTREAM_POOL='${JSON.stringify(pool)}'`;
  const match = content.match(/^TTS_UPSTREAM_POOL=(['"])(.*?)\1/m);
  if (match) {
    return content.replace(/^TTS_UPSTREAM_POOL=(['"])(.*?)\1/m, newPoolLine);
  }
  return content.endsWith("\n")
    ? `${content}${newPoolLine}\n`
    : `${content}\n${newPoolLine}\n`;
}

async function writePoolFile(poolPath: string, pool: ModalPoolItem[]): Promise<void> {
  await fs.mkdir(path.dirname(poolPath), { recursive: true });
  await fs.writeFile(poolPath, JSON.stringify(pool, null, 2), "utf-8");
}

async function appendAccountToEnv(url: string, token: string, label: string): Promise<void> {
  const poolPath = path.join(process.cwd(), "data", "tts-upstream-pool.json");
  const envPath = path.join(process.cwd(), ".env");
  const backupPath = path.join(process.cwd(), ".env.backup");

  let envContent = "";
  try {
    envContent = await fs.readFile(envPath, "utf-8");
  } catch {}

  const existingPool = mergePoolItems(
    readPoolFromEnvContent(envContent),
    await readPoolFile(poolPath),
  );
  const nextPool = existingPool.filter(
    (item) => normalizedEndpointUrl(item.url) !== normalizedEndpointUrl(url) && item.label !== label,
  );
  nextPool.push({ url, token, label });

  await writePoolFile(poolPath, nextPool);

  if (!envContent) return;
  try {
    await fs.writeFile(backupPath, envContent, "utf-8");
    await fs.writeFile(envPath, updatePoolInEnvContent(envContent, nextPool), "utf-8");
  } catch (error) {
    console.warn("Could not update the local environment pool.", error);
  }
}

async function removeAccountFromEnv(label: string, selectedUrl?: string): Promise<string | null> {
  const poolPath = path.join(process.cwd(), "data", "tts-upstream-pool.json");
  const envPath = path.join(process.cwd(), ".env");
  const backupPath = path.join(process.cwd(), ".env.backup");

  let envContent = "";
  try {
    envContent = await fs.readFile(envPath, "utf-8");
  } catch {}

  const currentPool = mergePoolItems(
    readPoolFromEnvContent(envContent),
    await readPoolFile(poolPath),
  );
  const selectedUrlKey = selectedUrl ? normalizedEndpointUrl(selectedUrl) : "";
  const removedItem = currentPool.find((item) =>
    selectedUrlKey
      ? normalizedEndpointUrl(item.url) === selectedUrlKey
      : item.label === label,
  );
  if (!removedItem) {
    throw new Error(`Selected Modal account "${label}" was not found in the endpoint pool.`);
  }

  const nextPool = currentPool.filter((item) =>
    selectedUrlKey
      ? normalizedEndpointUrl(item.url) !== selectedUrlKey
      : item.label !== label,
  );
  await writePoolFile(poolPath, nextPool);

  if (envContent) {
    try {
      await fs.writeFile(backupPath, envContent, "utf-8");
      await fs.writeFile(envPath, updatePoolInEnvContent(envContent, nextPool), "utf-8");
    } catch (error) {
      console.warn("Could not update the local environment pool.", error);
    }
  }

  return removedItem.url;
}

export function startUndeploy(params: { label: string; profile: string; url?: string }): void {
  assertSafeModalArg(params.profile, "Profile name");

  if (activeChildProcess) {
    try {
      activeChildProcess.kill();
    } catch {}
  }

  resetDeployStatusInMemory();
  currentDeployStatus.status = "deploying";
  currentDeployStatus.progress = `[1/2] Initiating undeployment of App 'voxcpm2-nanovllm-tts-api' on profile '${params.profile}'...\n`;
  persistStatusImmediate();

  const env = buildModalEnv(params.profile);

  const stopProcess = spawn(
    "modal",
    ["app", "stop", "voxcpm2-nanovllm-tts-api"],
    { env, shell: true }
  );

  activeChildProcess = stopProcess;

  stopProcess.stdout.on("data", (data) => {
    currentDeployStatus.progress += data.toString("utf-8");
    persistStatusDebounced();
  });

  stopProcess.stderr.on("data", (data) => {
    currentDeployStatus.progress += data.toString("utf-8");
    persistStatusDebounced();
  });

  stopProcess.on("close", async (code) => {
    activeChildProcess = null;
    currentDeployStatus.progress += `\n[2/2] App stop completed (exit code ${code}). Removing config mappings...\n`;
    persistStatusImmediate();

    try {
      const removedUrl = await removeAccountFromEnv(params.label, params.url);

      const configMap = await readAccountsConfig();
      if (configMap[params.label]) {
        delete configMap[params.label];
        await writeAccountsConfig(configMap);
      }

      if (removedUrl) {
        const { clearEndpointMetrics } = await import("./modal-analytics");
        await clearEndpointMetrics(removedUrl);
      }

      clearModalBillingCache();
      forceReloadEndpoints();

      currentDeployStatus.status = "success";
      if (code === 0) {
        currentDeployStatus.progress += `\n🎉 SUCCESS! Modal App stopped and account configuration removed.\n`;
      } else {
        currentDeployStatus.progress += `\n⚠️ WARNING: Modal CLI app stop returned code ${code}. The remote app might have already been stopped or was not found, but we successfully removed the account configuration from your pool.\n`;
      }
      persistStatusImmediate();
    } catch (err: unknown) {
      currentDeployStatus.status = "failed";
      const error = err as Error;
      currentDeployStatus.error = `Undeployment completed, but config removal failed: ${error?.message}`;
      persistStatusImmediate();
    }
  });
}


export function startDeploy(params: {
  label: string;
  profile: string;
  tokenId: string;
  tokenSecret: string;
  initialCredits: number;
  notes: string;
  modelFile?: string;
}): void {
  const modelFileToDeploy = params.modelFile || "modal_voxcpm_api.py";

  assertSafeModalArg(params.tokenId, "Token ID");
  assertSafeModalArg(params.tokenSecret, "Token Secret");
  assertSafeModalArg(params.profile, "Profile name");
  assertSafeModalArg(modelFileToDeploy, "Model file");

  // If there is an active deployment process running, kill it
  if (activeChildProcess) {
    try {
      activeChildProcess.kill();
    } catch {
      // Ignore
    }
  }

  resetDeployStatusInMemory();
  currentDeployStatus.status = "configuring_token";
  currentDeployStatus.progress = `[1/3] Setting Modal Token for profile '${params.profile}'...\n`;
  persistStatusImmediate();

  // Start CLI execution
  const env = buildModalEnv(params.profile);

  // Run token set
  const tokenProcess = spawn(
    "modal",
    ["token", "set", "--token-id", params.tokenId, "--token-secret", params.tokenSecret, "--profile", params.profile],
    { env, shell: true }
  );

  activeChildProcess = tokenProcess;

  let tokenOutput = "";
  tokenProcess.stdout.on("data", (data) => {
    tokenOutput += data.toString("utf-8");
    currentDeployStatus.progress += data.toString("utf-8");
    persistStatusDebounced();
  });

  tokenProcess.stderr.on("data", (data) => {
    tokenOutput += data.toString("utf-8");
    currentDeployStatus.progress += data.toString("utf-8");
    persistStatusDebounced();
  });

  tokenProcess.on("close", async (code) => {
    if (code !== 0) {
      currentDeployStatus.status = "failed";
      currentDeployStatus.error = `Token configuration failed (exit code ${code})`;
      activeChildProcess = null;
      persistStatusImmediate();
      return;
    }

    // Token set succeeded, next: create secret
    currentDeployStatus.status = "creating_secret";
    currentDeployStatus.progress += `\n[2/3] Token configured successfully! Creating 'voxcpm-api-key' secret in workspace...\n`;
    persistStatusImmediate();

    let apiKey: string;
    try {
      apiKey = await readApiKeyFromConfiguredSources();
    } catch (err: unknown) {
      currentDeployStatus.status = "failed";
      currentDeployStatus.error = err instanceof Error ? err.message : "VOXCPM_API_KEY is missing.";
      currentDeployStatus.progress += `\n❌ ERROR: ${currentDeployStatus.error}\n`;
      activeChildProcess = null;
      persistStatusImmediate();
      return;
    }

    const secretProcess = spawn(
      "modal",
      ["secret", "create", "--force", "voxcpm-api-key", `VOXCPM_API_KEY=${apiKey}`],
      { env, shell: true }
    );

    activeChildProcess = secretProcess;

    secretProcess.stdout.on("data", (data) => {
      currentDeployStatus.progress += data.toString("utf-8");
      persistStatusDebounced();
    });

    secretProcess.stderr.on("data", (data) => {
      currentDeployStatus.progress += data.toString("utf-8");
      persistStatusDebounced();
    });

    secretProcess.on("close", (secCode) => {
      if (secCode !== 0) {
        currentDeployStatus.status = "failed";
        currentDeployStatus.error = `Secret creation failed (exit code ${secCode})`;
        activeChildProcess = null;
        persistStatusImmediate();
        return;
      }

      // Secret created, next: deploy app
      currentDeployStatus.status = "deploying";
      currentDeployStatus.progress += `\n[3/3] Secret created successfully! Deploying TTS API to Modal workspace (this can take 3-5 minutes)...\n`;
      persistStatusImmediate();

      const deployProcess = spawn(
        "modal",
        ["deploy", modelFileToDeploy],
        { cwd: getModalSrcDir(), env, shell: true }
      );

      activeChildProcess = deployProcess;

      deployProcess.stdout.on("data", (data) => {
        const text = data.toString("utf-8");
        currentDeployStatus.progress += text;

        // Parse deployment URL
        const urlMatch = text.match(/https:\/\/[a-zA-Z0-9-]+--voxcpm2-nanovllm-tts-api-api\.modal\.run/);
        if (urlMatch) {
          currentDeployStatus.deployedUrl = urlMatch[0];
        }
        persistStatusDebounced();
      });

      deployProcess.stderr.on("data", (data) => {
        currentDeployStatus.progress += data.toString("utf-8");
        persistStatusDebounced();
      });

      deployProcess.on("close", async (depCode) => {
        activeChildProcess = null;
        if (depCode !== 0) {
          currentDeployStatus.status = "failed";
          currentDeployStatus.error = `Deployment failed (exit code ${depCode})`;
          persistStatusImmediate();
          return;
        }

        // Successfully deployed! Save config and add to .env
        try {
          const finalUrl = currentDeployStatus.deployedUrl || `https://${params.profile}--voxcpm2-nanovllm-tts-api-api.modal.run`;
          const finalSpeechUrl = `${finalUrl.replace(/\/$/, "")}/v1/audio/speech`;

          // 1. Add to .env pool list
          await appendAccountToEnv(finalSpeechUrl, apiKey, params.label);

          // 2. Save settings (initialCredits, notes) to config file
          const configMap = await readAccountsConfig();
          configMap[params.label] = {
            profile: params.profile,
            initialCredits: params.initialCredits,
            notes: params.notes,
            modelFile: modelFileToDeploy,
          };
          await writeAccountsConfig(configMap);

          // 3. Clear cache and reload
          clearModalBillingCache();
          forceReloadEndpoints();

          currentDeployStatus.status = "success";
          currentDeployStatus.progress += `\n🎉 SUCCESS! Modal Account connected and deployed successfully!\nWeb Function URL: ${finalUrl}\n`;
          persistStatusImmediate();
        } catch (saveErr: unknown) {
          currentDeployStatus.status = "failed";
          const error = saveErr as Error;
          currentDeployStatus.error = `Deployment succeeded, but failed to save config: ${error?.message}`;
          persistStatusImmediate();
        }
      });
    });
  });
}
