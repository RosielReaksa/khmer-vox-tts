import { spawn, type ChildProcess } from "child_process";
import fs from "fs/promises";
import path from "path";
import { forceReloadEndpoints } from "./tts-endpoints";
import { readAccountsConfig, writeAccountsConfig, clearModalBillingCache } from "./modal-accounts";

function getModalSrcDir(): string {
  if (process.env.MODAL_SRC_DIR) return process.env.MODAL_SRC_DIR;
  return path.join(process.cwd(), "modal");
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

async function readApiKeyFromFile(): Promise<string> {
  const envKey = process.env.VOXCPM_API_KEY?.trim();
  if (envKey) {
    return envKey;
  }
  const filePath = path.join(getModalSrcDir(), "NEW_VOXCPM_API_KEY.txt");
  try {
    const key = await fs.readFile(filePath, "utf-8");
    const trimmed = key.trim();
    if (trimmed) return trimmed;
  } catch {}

  throw new Error("VOXCPM_API_KEY is not defined. Please define the VOXCPM_API_KEY environment variable on the server or provide NEW_VOXCPM_API_KEY.txt.");
}

interface ModalPoolItem {
  url: string;
  token: string;
  label: string;
}

async function appendAccountToEnv(url: string, token: string, label: string): Promise<void> {
  // 1. Write to persistent JSON pool
  const poolPath = path.join(process.cwd(), "data", "tts-upstream-pool.json");
  try {
    let poolList: ModalPoolItem[] = [];
    try {
      const content = await fs.readFile(poolPath, "utf-8");
      poolList = JSON.parse(content) as ModalPoolItem[];
    } catch {}

    const existingIndex = poolList.findIndex(item => item.url === url || item.label === label);
    if (existingIndex >= 0) {
      poolList[existingIndex] = { url, token, label };
    } else {
      poolList.push({ url, token, label });
    }

    await fs.mkdir(path.dirname(poolPath), { recursive: true });
    await fs.writeFile(poolPath, JSON.stringify(poolList, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write new account to tts-upstream-pool.json", err);
  }

  // 2. Fallback: Write to local .env
  const envPath = path.join(process.cwd(), ".env");
  const backupPath = path.join(process.cwd(), ".env.backup");
  
  try {
    const content = await fs.readFile(envPath, "utf-8");
    await fs.writeFile(backupPath, content, "utf-8"); // Backup first

    const match = content.match(/^TTS_UPSTREAM_POOL=(['"])(.*?)\1/m);
    let poolList: ModalPoolItem[] = [];
    
    if (match) {
      try {
        poolList = JSON.parse(match[2]) as ModalPoolItem[];
      } catch (err) {
        console.error("Failed to parse pool list from .env, initializing fresh pool", err);
      }
    }

    const existingIndex = poolList.findIndex(item => item.url === url || item.label === label);
    if (existingIndex >= 0) {
      poolList[existingIndex] = { url, token, label };
    } else {
      poolList.push({ url, token, label });
    }

    const newPoolStr = JSON.stringify(poolList);
    let updatedContent: string;
    
    if (match) {
      updatedContent = content.replace(/^TTS_UPSTREAM_POOL=(['"]).*?\1/m, `TTS_UPSTREAM_POOL='${newPoolStr}'`);
    } else {
      updatedContent = content.endsWith("\n") 
        ? content + `TTS_UPSTREAM_POOL='${newPoolStr}'\n`
        : content + `\nTTS_UPSTREAM_POOL='${newPoolStr}'\n`;
    }

    await fs.writeFile(envPath, updatedContent, "utf-8");
  } catch (err) {
    console.warn("Could not write new account to local .env (this is expected in some production environments)", err);
  }
}

async function removeAccountFromEnv(label: string): Promise<string | null> {
  // 1. Remove from persistent JSON pool
  const poolPath = path.join(process.cwd(), "data", "tts-upstream-pool.json");
  let removedUrl: string | null = null;
  try {
    let poolList: ModalPoolItem[] = [];
    try {
      const content = await fs.readFile(poolPath, "utf-8");
      poolList = JSON.parse(content) as ModalPoolItem[];
    } catch {}

    const item = poolList.find(i => i.label === label);
    removedUrl = item ? item.url : null;

    const filteredPool = poolList.filter(i => i.label !== label);
    await fs.mkdir(path.dirname(poolPath), { recursive: true });
    await fs.writeFile(poolPath, JSON.stringify(filteredPool, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to remove account from tts-upstream-pool.json", err);
  }

  // 2. Fallback: Remove from local .env
  const envPath = path.join(process.cwd(), ".env");
  const backupPath = path.join(process.cwd(), ".env.backup");

  try {
    const content = await fs.readFile(envPath, "utf-8");
    await fs.writeFile(backupPath, content, "utf-8"); // Backup first

    const match = content.match(/^TTS_UPSTREAM_POOL=(['"])(.*?)\1/m);
    if (!match) return removedUrl;

    let poolList: ModalPoolItem[] = [];
    try {
      poolList = JSON.parse(match[2]) as ModalPoolItem[];
    } catch (err) {
      console.error("Failed to parse pool list from .env, using empty list", err);
    }

    const item = poolList.find(i => i.label === label);
    if (item && !removedUrl) {
      removedUrl = item.url;
    }

    const filteredPool = poolList.filter(i => i.label !== label);
    const newPoolStr = JSON.stringify(filteredPool);
    const updatedContent = content.replace(/^TTS_UPSTREAM_POOL=(['"]).*?\1/m, `TTS_UPSTREAM_POOL='${newPoolStr}'`);

    await fs.writeFile(envPath, updatedContent, "utf-8");
  } catch (err) {
    console.warn("Could not remove account from local .env (this is expected in some production environments)", err);
  }
  return removedUrl;
}

export function startUndeploy(params: { label: string; profile: string }): void {
  if (activeChildProcess) {
    try {
      activeChildProcess.kill();
    } catch {}
  }

  resetDeployStatusInMemory();
  currentDeployStatus.status = "deploying";
  currentDeployStatus.progress = `[1/2] Initiating undeployment of App 'voxcpm2-nanovllm-tts-api' on profile '${params.profile}'...\n`;
  persistStatusImmediate();

  const env = {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    MODAL_CONFIG_PATH: process.env.MODAL_CONFIG_PATH || path.join(process.cwd(), "data", ".modal.toml"),
    MODAL_PROFILE: params.profile,
  };

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
      const removedUrl = await removeAccountFromEnv(params.label);

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
  const env = {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    MODAL_CONFIG_PATH: process.env.MODAL_CONFIG_PATH || path.join(process.cwd(), "data", ".modal.toml"),
    MODAL_PROFILE: params.profile,
  };

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
      apiKey = await readApiKeyFromFile();
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
