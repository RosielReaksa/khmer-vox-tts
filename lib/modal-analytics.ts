import fs from "fs/promises";
import path from "path";

export interface EndpointMetric {
  url: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalCharacters: number;
  totalLatencyMs: number;
  averageLatencyMs: number;
  successRate: number;
}

const METRICS_FILE_PATH = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "modal-analytics.json");

let metricsInMemory: Record<string, EndpointMetric> = {};
let isLoaded = false;
let saveTimeout: NodeJS.Timeout | null = null;

async function loadMetrics(): Promise<void> {
  if (isLoaded) return;
  try {
    const data = await fs.readFile(/*turbopackIgnore: true*/ METRICS_FILE_PATH, "utf-8");
    metricsInMemory = JSON.parse(data);
  } catch {
    metricsInMemory = {};
  }
  isLoaded = true;
}

async function saveMetricsImmediately(): Promise<void> {
  try {
    await fs.mkdir(path.dirname(/*turbopackIgnore: true*/ METRICS_FILE_PATH), { recursive: true });
    await fs.writeFile(/*turbopackIgnore: true*/ METRICS_FILE_PATH, JSON.stringify(metricsInMemory, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write modal metrics analytics:", err);
  }
}

function queueSaveMetrics(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveMetricsImmediately();
  }, 3000); // Debounce saves by 3 seconds
}

export async function getEndpointMetrics(): Promise<Record<string, EndpointMetric>> {
  await loadMetrics();
  return metricsInMemory;
}

export async function recordSynthesisMetric(
  url: string,
  characterCount: number,
  latencyMs: number,
  success: boolean
): Promise<void> {
  await loadMetrics();

  const current = metricsInMemory[url] || {
    url,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalCharacters: 0,
    totalLatencyMs: 0,
    averageLatencyMs: 0,
    successRate: 100,
  };

  current.totalRequests += 1;
  if (success) {
    current.successfulRequests += 1;
    current.totalCharacters += characterCount;
    current.totalLatencyMs += latencyMs;
  } else {
    current.failedRequests += 1;
  }

  // Recalculate averages and rates
  if (current.successfulRequests > 0) {
    current.averageLatencyMs = Math.round(current.totalLatencyMs / current.successfulRequests);
  }
  current.successRate = Math.round((current.successfulRequests / current.totalRequests) * 100);

  metricsInMemory[url] = current;
  queueSaveMetrics();
}

export async function clearEndpointMetrics(url: string): Promise<void> {
  await loadMetrics();
  if (metricsInMemory[url]) {
    delete metricsInMemory[url];
    await saveMetricsImmediately();
  }
}
