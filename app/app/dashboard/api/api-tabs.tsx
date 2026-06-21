"use client";

import { useEffect, useState } from "react";

import { KeyManager } from "@/app/app/dashboard/key-manager";
import type {
  GenerationMode,
  GenerationSource,
  GenerationStatus,
} from "@/lib/types";

type ApiKeyItem = {
  id: string;
  name: string;
  keyPrefix: string;
  dailyTokenLimit: number | null;
  monthlyTokenLimit: number | null;
  maxConcurrentRequests: number | null;
  maxConcurrentJobs: number | null;
  maxQueuedJobs: number | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  requestCount: number;
};

type RequestLogItem = {
  id: string;
  createdAt: string;
  mode: GenerationMode;
  source: GenerationSource;
  status: GenerationStatus;
  inputChars: number;
  inputPreview: string;
  outputSeconds: number;
  creditsCharged: number;
};

type ApiTabsProps = {
  initialKeys: ApiKeyItem[];
  requestLogs: RequestLogItem[];
  apiAccess: {
    hasPaidApiAccess: boolean;
    currentPlanName: string;
    cloneCreditsPerSecond: number;
    businessLimits: {
      dailyTokenLimit: number | null;
      monthlyTokenLimit: number | null;
      maxConcurrentRequests: number | null;
      maxConcurrentJobs: number | null;
      maxQueuedJobs: number | null;
      cloneCreditRate: number;
    } | null;
  };
};

type ActiveTab = "keys" | "logs";

export function ApiTabs({ initialKeys, requestLogs, apiAccess }: ApiTabsProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("keys");
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>(initialKeys);

  // Sync the key list when fresh server data arrives (e.g. after a poll or
  // cache invalidation). Previously the parent forced a full remount via a
  // changing `key` prop to push new data in, but that also destroyed the
  // one-time raw-key reveal panel before the user could copy it. Syncing via
  // effect keeps KeyManager mounted so the reveal + its 5-minute timer survive.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setApiKeys(initialKeys);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [initialKeys]);

  return (
    <section className="grid gap-6">
      <div
        role="tablist"
        aria-label="API tools"
        className="flex flex-wrap gap-4"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "keys"}
          aria-controls="api-keys-panel"
          onClick={() => setActiveTab("keys")}
          className={tabClass(activeTab === "keys")}
        >
          API Keys
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "logs"}
          aria-controls="request-logs-panel"
          onClick={() => setActiveTab("logs")}
          className={tabClass(activeTab === "logs")}
        >
          Request Logs
        </button>
      </div>

      <div id="api-keys-panel" role="tabpanel" hidden={activeTab !== "keys"}>
        <KeyManager
          initialKeys={apiKeys}
          apiAccess={apiAccess}
          onKeysChange={setApiKeys}
          isBusiness={false}
        />
      </div>

      <div
        id="request-logs-panel"
        role="tabpanel"
        hidden={activeTab !== "logs"}
      >
        <RequestLogsTable requestLogs={requestLogs} />
      </div>
    </section>
  );
}

function RequestLogsTable({ requestLogs }: { requestLogs: RequestLogItem[] }) {
  return (
    <section className="bg-white border-4 border-primary p-6 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative">
      <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
        Request Logs
      </div>
      <p className="text-sm text-[#4a4a4a] font-body mb-6 mt-2">
        Recent API-key generation requests
      </p>

      <div className="smooth-scroll-region overflow-auto border-4 border-primary shadow-[4px_4px_0px_0px_#1a1a1a] bg-white">
        <table className="w-full min-w-[860px] text-left border-collapse">
          <thead>
            <tr className="bg-[#eee9e0] border-b-4 border-primary font-headline uppercase text-xs">
              <th className="p-3 border-r-4 border-primary">Time</th>
              <th className="p-3 border-r-4 border-primary">Mode</th>
              <th className="p-3 border-r-4 border-primary">Status</th>
              <th className="p-3 border-r-4 border-primary">Input</th>
              <th className="p-3 border-r-4 border-primary">Preview</th>
              <th className="p-3 border-r-4 border-primary">Duration</th>
              <th className="p-3">Credits</th>
            </tr>
          </thead>
          <tbody className="font-body text-sm font-semibold">
            {requestLogs.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="p-8 text-center text-[#4a4a4a] bg-white"
                >
                  No API requests yet.
                </td>
              </tr>
            ) : (
              requestLogs.map((item) => (
                <tr
                  key={item.id}
                  className="border-b-4 border-primary hover:bg-[#eee9e0]/40 transition-colors"
                >
                  <td className="p-3 border-r-4 border-primary">
                    {formatDateTime(item.createdAt)}
                  </td>
                  <td className="p-3 border-r-4 border-primary uppercase font-headline">
                    {item.mode}
                  </td>
                  <td className="p-3 border-r-4 border-primary">
                    <span
                      className={`inline-block px-2 py-1 border-2 border-primary font-label text-xs uppercase ${generationStatusClass(item.status)}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="p-3 border-r-4 border-primary">
                    {item.inputChars.toLocaleString()} chars
                  </td>
                  <td className="p-3 border-r-4 border-primary max-w-[300px] truncate">
                    {item.inputPreview}
                  </td>
                  <td className="p-3 border-r-4 border-primary">
                    {item.outputSeconds}s
                  </td>
                  <td className="p-3">
                    {item.creditsCharged.toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function tabClass(active: boolean): string {
  return `font-headline font-bold uppercase text-sm px-6 py-3 border-4 border-primary transition-all shadow-[4px_4px_0px_0px_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0px_0px_#1a1a1a] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none cursor-pointer ${
    active ? "bg-[#ffcc00] text-primary" : "bg-white text-primary"
  }`;
}

function formatDateTime(input: string | null | undefined): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function generationStatusClass(status: GenerationStatus): string {
  if (status === "success") return "bg-[#10b981] text-primary";
  if (status === "processing") return "bg-[#ffcc00] text-primary";
  return "bg-[#e63b2e] text-[#f5f0e8]";
}
