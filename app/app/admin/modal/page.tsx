"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { ModalAccountDetail } from "@/lib/modal-accounts";

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  return mounted ? createPortal(children, document.body) : null;
}

type AccountStatusState = Record<string, { ok: boolean; status: string; latency?: number; checking: boolean }>;

interface AccountMetrics {
  totalRequests: number;
  totalCharacters: number;
  averageLatencyMs: number;
  successRate: number;
}

export default function AdminModalPage() {
  const [accounts, setAccounts] = useState<ModalAccountDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Health check statuses
  const [healthStatus, setHealthStatus] = useState<AccountStatusState>({});

  // Editing state
  const [editingAccount, setEditingAccount] = useState<ModalAccountDetail | null>(null);
  const [formProfile, setFormProfile] = useState("");
  const [formCredits, setFormCredits] = useState(90.0);
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Active Billing Report popup
  const [viewingReport, setViewingReport] = useState<ModalAccountDetail | null>(null);

  // Connect New Account states
  const [connectingNew, setConnectingNew] = useState(false);
  const [modalAction, setModalAction] = useState<"connect" | "undeploy">("connect");
  const [newProfile, setNewProfile] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newTokenId, setNewTokenId] = useState("");
  const [newTokenSecret, setNewTokenSecret] = useState("");
  const [newCredits, setNewCredits] = useState(90.0);
  const [newNotes, setNewNotes] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Deployment Polling State
  const [deployState, setDeployState] = useState<{
    status: "idle" | "configuring_token" | "creating_secret" | "deploying" | "success" | "failed";
    progress: string;
    error: string | null;
    deployedUrl: string | null;
  } | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Analytics & Versions states
  const [metrics, setMetrics] = useState<Record<string, AccountMetrics>>({});
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [newModelFile, setNewModelFile] = useState("modal_voxcpm_api.py");

  const terminalRef = useRef<HTMLPreElement>(null);

  // Poll deployment status
  async function pollDeployStatus() {
    try {
      const res = await fetch("/api/admin/modal/deploy");
      const data = await res.json();
      if (data.ok && data.deploy) {
        setDeployState(data.deploy);
        const status = data.deploy.status;
        if (status === "configuring_token" || status === "creating_secret" || status === "deploying") {
          setIsPolling(true);
        } else {
          setIsPolling(false);
          if (status === "success") {
            loadData(false); // reload pool configuration instantly without slow billing refresh
          }
        }
      }
    } catch (err) {
      console.error("Error polling deployment status:", err);
    }
  }

  // Handle auto-paste / parser helper
  function handlePasteHelper(text: string) {
    const tokenIdMatch = text.match(/--token-id\s+([^\s]+)/) || text.match(/ak-[a-zA-Z0-9]+/);
    const tokenSecretMatch = text.match(/--token-secret\s+([^\s]+)/) || text.match(/as-[a-zA-Z0-9]+/);
    const profileMatch = text.match(/--profile[=\s]([^\s]+)/);

    const parsedId = tokenIdMatch ? (Array.isArray(tokenIdMatch) ? tokenIdMatch[1] || tokenIdMatch[0] : tokenIdMatch[0]) : "";
    const parsedSecret = tokenSecretMatch ? (Array.isArray(tokenSecretMatch) ? tokenSecretMatch[1] || tokenSecretMatch[0] : tokenSecretMatch[0]) : "";
    const parsedProfile = profileMatch ? profileMatch[1] : "";

    if (parsedId) setNewTokenId(parsedId);
    if (parsedSecret) setNewTokenSecret(parsedSecret);
    if (parsedProfile) {
      setNewProfile(parsedProfile);
      // Automatically derive label if not set
      if (!newLabel || newLabel === `MODAL ACCOUNT ${accounts.length + 1}`) {
        setNewLabel(`MODAL ACCOUNT ${accounts.length + 1} (${parsedProfile.toUpperCase()})`);
      }
    }
  }

  // Start connection / trigger background task
  async function startConnectAndDeploy() {
    setConnecting(true);
    setConnectError(null);
    setModalAction("connect");

    // Instantly open the console view with initial progress message
    setDeployState({
      status: "configuring_token",
      progress: "[1/3] Initiating connection workflow...\nContacting server to configure Modal token...\n",
      error: null,
      deployedUrl: null
    });

    const finalLabel = newLabel.trim() || `MODAL ACCOUNT ${accounts.length + 1} (${newProfile.toUpperCase()})`;

    try {
      const res = await fetch("/api/admin/modal/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: finalLabel,
          profile: newProfile.trim(),
          tokenId: newTokenId.trim(),
          tokenSecret: newTokenSecret.trim(),
          initialCredits: newCredits,
          notes: newNotes.trim(),
          modelFile: newModelFile,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setIsPolling(true);
        pollDeployStatus(); // immediate check
      } else {
        setDeployState(null); // Switch back to form view
        setConnectError(data.error || "Failed to initiate connection and deployment.");
      }
    } catch {
      setDeployState(null); // Switch back to form view
      setConnectError("Network error starting deployment.");
    } finally {
      setConnecting(false);
    }
  }

  // Trigger undeployment and removal
  async function triggerUndeploy(account: ModalAccountDetail) {
    if (!confirm(`Are you sure you want to undeploy the application from profile "${account.profile}" and remove account "${account.label}"?`)) {
      return;
    }

    setModalAction("undeploy");
    setConnectingNew(true);
    setNewProfile(account.profile);
    setNewLabel(account.label);
    setConnectError(null);

    setDeployState({
      status: "deploying",
      progress: `[1/2] Sending request to undeploy and stop app 'voxcpm2-nanovllm-tts-api' on profile '${account.profile}'...\n`,
      error: null,
      deployedUrl: null
    });

    try {
      const search = new URLSearchParams({
        label: account.label,
        profile: account.profile,
        url: account.url,
      });
      const res = await fetch(`/api/admin/modal/deploy?${search.toString()}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.ok) {
        setIsPolling(true);
        pollDeployStatus();
      } else {
        setDeployState(null);
        alert(data.error || "Failed to start undeployment.");
      }
    } catch {
      setDeployState(null);
      alert("Network error starting undeployment.");
    }
  }

  // Reset deployment status
  async function resetDeploy() {
    try {
      await fetch("/api/admin/modal/deploy", { method: "DELETE" });
      setDeployState(null);
      setIsPolling(false);
      setNewProfile("");
      setNewLabel("");
      setNewTokenId("");
      setNewTokenSecret("");
      setNewCredits(90.0);
      setNewNotes("");
      setConnectError(null);
    } catch (err) {
      console.error("Failed to reset deployment status:", err);
    }
  }

  // Load versions available for deployment
  async function loadVersions() {
    try {
      const res = await fetch("/api/admin/modal/deploy/versions");
      const data = await res.json();
      if (data.ok && Array.isArray(data.versions)) {
        setAvailableVersions(data.versions);
        if (data.versions.includes("modal_voxcpm_api.py")) {
          setNewModelFile("modal_voxcpm_api.py");
        } else if (data.versions.length > 0) {
          setNewModelFile(data.versions[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load versions:", err);
    }
  }

  // Open modal for connecting a new account
  function openConnectModal() {
    setModalAction("connect");
    setConnectingNew(true);
    setNewLabel(`MODAL ACCOUNT ${accounts.length + 1}`);
    setNewProfile("");
    setNewTokenId("");
    setNewTokenSecret("");
    setNewCredits(90.0);
    setNewNotes("");
    setConnectError(null);
    loadVersions();
  }

  // Load analytics metrics
  async function loadAnalytics() {
    try {
      const res = await fetch("/api/admin/modal/analytics");
      const data = await res.json();
      if (data.ok) {
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error("Failed to load analytics metrics:", err);
    }
  }

  async function loadData(forceRefresh = false) {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/modal${forceRefresh ? "?refresh=true" : ""}`);
      const data = await res.json();
      if (data.ok) {
        setAccounts(data.accounts);
        loadAnalytics();
      } else {
        setError(data.error || "Failed to load Modal accounts");
      }
    } catch {
      setError("Network error loading Modal accounts.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Poll deployment status on interval
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isPolling) {
      timer = setInterval(() => {
        pollDeployStatus();
      }, 1500);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPolling]);

  // Autoscroll terminal console
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [deployState?.progress]);

  // Initial load
  useEffect(() => {
    loadData();
    pollDeployStatus(); // Check if there is already a running deployment
  }, []);


  // Health checks run individually per endpoint
  async function runHealthCheck(account: ModalAccountDetail) {
    const label = account.label;
    setHealthStatus((prev) => ({
      ...prev,
      [label]: { ok: false, status: "Checking...", checking: true },
    }));

    const start = Date.now();
    try {
      const res = await fetch(`/api/admin/modal?ping=${encodeURIComponent(label)}`);
      const data = await res.json();

      if (res.ok && data.ok) {
        setHealthStatus((prev) => ({
          ...prev,
          [label]: {
            ok: true,
            status: data.status,
            latency: data.latency,
            checking: false,
          },
        }));
      } else {
        setHealthStatus((prev) => ({
          ...prev,
          [label]: {
            ok: false,
            status: data.status || data.error || "Failed",
            latency: data.latency,
            checking: false,
          },
        }));
      }
    } catch (err) {
      setHealthStatus((prev) => ({
        ...prev,
        [label]: {
          ok: false,
          status: err instanceof Error ? err.message : "Network request failed",
          latency: Date.now() - start,
          checking: false,
        },
      }));
    }
  }

  // Run health check on all endpoints sequentially/parallel
  function runAllHealthChecks() {
    accounts.forEach((acc) => runHealthCheck(acc));
  }

  // Trigger edit modal
  function startEdit(account: ModalAccountDetail) {
    setEditingAccount(account);
    setFormProfile(account.profile);
    setFormCredits(account.initialCredits);
    setFormNotes(account.notes);
    setSaveError(null);
  }

  // Save changes
  async function saveConfig() {
    if (!editingAccount) return;
    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch("/api/admin/modal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: editingAccount.label,
          profile: formProfile,
          initialCredits: formCredits,
          notes: formNotes,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setEditingAccount(null);
        loadData(false); // Refresh items
      } else {
        setSaveError(data.error || "Failed to save configuration");
      }
    } catch {
      setSaveError("Network error saving configuration.");
    } finally {
      setSaving(false);
    }
  }

  // Totals calculations
  const totalLimit = accounts.reduce((acc, curr) => acc + curr.initialCredits, 0);
  const totalSpend = accounts.reduce((acc, curr) => acc + curr.monthlySpend, 0);
  const totalRemaining = totalLimit - totalSpend;

  return (
    <section className="grid min-w-0 gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-headline font-black uppercase text-primary">Modal Account Pool</h1>
          <p className="mt-1 text-sm font-body text-primary/70">
            Monitor spend, remaining credit limits, health, and configuration profiles for your serverless GPU pool.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runAllHealthChecks}
            disabled={loading || accounts.length === 0}
            className="rounded-none border-2 border-primary bg-primary text-white font-headline font-bold uppercase text-xs px-4 py-3 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            Check All Endpoints
          </button>
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
            className="rounded-none border-2 border-primary bg-[#ffcc00] font-headline font-bold uppercase text-xs px-4 py-3 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer transition-all disabled:opacity-50"
          >
            {refreshing ? "Refreshing Spend..." : "Refresh Billing Data"}
          </button>
          <button
            type="button"
            onClick={openConnectModal}
            className="rounded-none border-2 border-primary bg-[#a3e635] text-primary font-headline font-bold uppercase text-xs px-4 py-3 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer transition-all"
          >
            Connect New Account
          </button>
        </div>
      </div>

      {/* Active Deployment Banner */}
      {deployState && ["configuring_token", "creating_secret", "deploying"].includes(deployState.status) && !connectingNew && (
        <div className="border-3 border-primary bg-[#fff8db] p-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
            <p className="text-sm font-headline font-bold uppercase text-primary">
              {deployState.progress?.includes("undeploy") || deployState.progress?.includes("stop") || deployState.progress?.includes("Undeployment")
                ? "Undeployment in progress..."
                : `Auto-deployment in progress (${
                    deployState.status === "configuring_token"
                      ? "Configuring Token"
                      : deployState.status === "creating_secret"
                      ? "Creating Secret"
                      : "Deploying model_voxcpm_api.py"
                  })...`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (deployState.progress?.includes("undeploy") || deployState.progress?.includes("stop") || deployState.progress?.includes("Undeployment")) {
                setModalAction("undeploy");
              } else {
                setModalAction("connect");
              }
              setConnectingNew(true);
            }}
            className="rounded-none border-2 border-primary bg-primary text-white font-headline font-bold uppercase text-xs px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer transition-all"
          >
            Open Console
          </button>
        </div>
      )}


      {/* Overview Cards */}
      <div className="grid gap-5 sm:grid-cols-3">
        <div className="border-3 border-primary bg-[#def3e5] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
          <p className="text-xs font-headline font-bold uppercase text-[#128342]">Pool Remaining Credits</p>
          <h3 className="mt-2 text-4xl font-headline font-black uppercase text-primary">
            ${totalRemaining.toFixed(2)}
          </h3>
        </div>
        <div className="border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
          <p className="text-xs font-headline font-bold uppercase text-primary/70">Initial Credits Budget</p>
          <h3 className="mt-2 text-4xl font-headline font-black uppercase text-primary">
            ${totalLimit.toFixed(2)}
          </h3>
        </div>
        <div className="border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
          <p className="text-xs font-headline font-bold uppercase text-primary/70">Estimated Monthly Spend</p>
          <h3 className="mt-2 text-4xl font-headline font-black uppercase text-[#882222]">
            ${totalSpend.toFixed(2)}
          </h3>
        </div>
      </div>

      {/* Main List */}
      {loading ? (
        <div className="border-3 border-primary bg-white p-10 text-center shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
          <p className="font-headline font-bold uppercase text-primary animate-pulse">Loading pool configuration and spend details...</p>
        </div>
      ) : error ? (
        <div className="border-3 border-primary bg-[#fff0f0] p-6 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
          <h4 className="font-headline font-black text-red-900 uppercase">Error Loading Accounts</h4>
          <p className="mt-2 text-sm font-body text-red-950">{error}</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {accounts.map((acc, index) => {
            const h = healthStatus[acc.label];
            const spendPercentage = acc.initialCredits > 0 ? (acc.monthlySpend / acc.initialCredits) * 100 : 0;
            return (
              <div
                key={acc.label}
                className="border-3 border-primary bg-white p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] flex flex-col md:flex-row justify-between items-start md:items-center gap-5"
              >
                {/* Account details */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="bg-primary text-white font-headline font-black text-xs px-2 py-1 uppercase">
                      Account {index + 1}
                    </span>
                    <h3 className="text-lg font-headline font-black text-primary uppercase">{acc.label}</h3>
                  </div>

                  <p className="mt-2 text-xs font-mono text-primary/60 truncate" title={acc.url}>
                    {acc.url}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <div>
                      <span className="font-headline font-bold uppercase text-primary/60">CLI Profile:</span>{" "}
                      <span className="font-mono font-bold bg-[#f2ede5] px-2 py-0.5 text-xs text-primary border border-primary/30">
                        {acc.profile}
                      </span>
                    </div>
                    <div>
                      <span className="font-headline font-bold uppercase text-primary/60">Deployed Code:</span>{" "}
                      <span className="font-mono bg-[#f2ede5] px-2 py-0.5 text-xs text-primary border border-primary/30">
                        {acc.modelFile || "modal_voxcpm_api.py"}
                      </span>
                    </div>
                    {acc.notes && (
                      <div className="max-w-md truncate">
                        <span className="font-headline font-bold uppercase text-primary/60">Notes:</span>{" "}
                        <span className="font-body text-primary/80 italic">{acc.notes}</span>
                      </div>
                    )}
                  </div>

                  {/* Billing indicator */}
                  {acc.billingError ? (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 text-xs text-red-700 max-w-md">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">⚠️ Billing Unavailable</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            alert(acc.billingError);
                          }}
                          className="underline text-[10px] text-red-600 hover:text-red-800"
                        >
                          Show Error Details
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-red-600/95 line-clamp-2">
                        {acc.billingError.includes("Token missing")
                          ? "Credentials not authenticated. Please edit or reconnect this account."
                          : acc.billingError}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 max-w-sm">
                      <div className="flex justify-between text-xs font-headline font-bold text-primary/70 mb-1">
                        <span>Credits Spent: ${acc.monthlySpend.toFixed(2)}</span>
                        <span>Limit: ${acc.initialCredits.toFixed(2)}</span>
                      </div>
                      <div className="h-3 bg-[#f2ede5] border-2 border-primary overflow-hidden">
                        <div
                          className="h-full bg-[#ffcc00] border-r-2 border-primary transition-all"
                          style={{ width: `${Math.min(100, spendPercentage)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Analytics Summary */}
                  {metrics[acc.url] && (
                    <div className="mt-4 bg-[#fcfbfa] border border-primary/20 p-2 text-xs grid grid-cols-4 gap-2 font-mono max-w-sm">
                      <div>
                        <div className="text-[9px] font-headline font-bold uppercase text-primary/50">Requests</div>
                        <div className="font-bold text-primary">{metrics[acc.url].totalRequests}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-headline font-bold uppercase text-primary/50">Chars</div>
                        <div className="font-bold text-primary">{metrics[acc.url].totalCharacters}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-headline font-bold uppercase text-primary/50">Avg Latency</div>
                        <div className="font-bold text-primary">{metrics[acc.url].averageLatencyMs}ms</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-headline font-bold uppercase text-primary/50">Success</div>
                        <div className={`font-bold ${metrics[acc.url].successRate < 90 ? "text-red-700" : "text-[#128342]"}`}>
                          {metrics[acc.url].successRate}%
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Health & Credits summary */}
                <div className="flex flex-wrap md:flex-col items-start md:items-end justify-between w-full md:w-auto gap-4 border-t-2 border-dashed md:border-t-0 pt-4 md:pt-0 border-primary/25">
                  <div className="text-left md:text-right">
                    <p className="text-[10px] font-headline font-bold uppercase text-primary/60">Remaining Credits</p>
                    <h4 className={`text-2xl font-headline font-black uppercase ${acc.remainingCredits < 15 ? "text-red-800 animate-pulse" : "text-[#128342]"}`}>
                      ${acc.remainingCredits.toFixed(2)}
                    </h4>
                  </div>

                  <div className="flex flex-col gap-2 items-start md:items-end w-full sm:w-auto">
                    {/* Health indicator */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => runHealthCheck(acc)}
                        disabled={h?.checking}
                        className="text-[10px] font-headline font-bold uppercase underline text-primary hover:text-primary/75 cursor-pointer disabled:opacity-50"
                      >
                        {h?.checking ? "Checking..." : "Ping Status"}
                      </button>

                      {h ? (
                        <span className={`text-xs font-headline font-bold px-2 py-0.5 border ${
                          h.ok 
                            ? "bg-[#def3e5] border-[#128342] text-[#128342]" 
                            : "bg-[#fff0f0] border-red-800 text-red-800"
                        }`}>
                          {h.status} {h.latency ? `(${h.latency}ms)` : ""}
                        </span>
                      ) : (
                        <span className="text-xs font-headline font-bold px-2 py-0.5 bg-[#f2ede5] border border-primary/30 text-primary/60">
                          Not verified
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 w-full justify-start sm:justify-end">
                      <button
                        type="button"
                        onClick={() => startEdit(acc)}
                        className="rounded-none border-2 border-primary bg-white text-xs font-headline font-bold uppercase px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer transition-all"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewingReport(acc)}
                        disabled={!acc.billingReport || acc.billingReport.length === 0}
                        className="rounded-none border-2 border-primary bg-[#f2ede5] text-xs font-headline font-bold uppercase px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer transition-all disabled:opacity-50 disabled:pointer-events-none"
                      >
                        Billing Report
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerUndeploy(acc)}
                        className="rounded-none border-2 border-[#882222] bg-white text-[#882222] text-xs font-headline font-bold uppercase px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(136,34,34,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer transition-all hover:bg-[#fff0f0]"
                      >
                        Undeploy & Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Config Modal */}
      {editingAccount && (
        <Portal>
          <div className="fixed inset-0 z-50 overflow-y-auto bg-primary/40 backdrop-blur-xs flex justify-center p-4">
            <div className="w-full max-w-md border-3 border-primary bg-[#faf7f2] p-6 shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] my-auto">
              <h3 className="text-xl font-headline font-black uppercase text-primary border-b-2 border-primary pb-2 mb-4">
                Edit Modal Profile Config
              </h3>

              <div className="grid gap-4">
                <div>
                  <label className="block text-xs font-headline font-bold uppercase text-primary/70 mb-1">
                    Endpoint Label
                  </label>
                  <input
                    type="text"
                    disabled
                    value={editingAccount.label}
                    className="w-full border-2 border-primary bg-[#f2ede5] px-3 py-2 text-sm text-primary/60 font-body outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-headline font-bold uppercase text-primary mb-1">
                    Modal CLI Profile Name
                  </label>
                  <input
                    type="text"
                    value={formProfile}
                    onChange={(e) => setFormProfile(e.target.value)}
                    className="w-full border-2 border-primary bg-white px-3 py-2 text-sm text-primary font-mono outline-none focus:bg-amber-50"
                    placeholder="e.g. reaksabbb3"
                  />
                  <p className="mt-1 text-[10px] text-primary/60">
                    Must match the profile name configured in your local `.modal.toml` file.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-headline font-bold uppercase text-primary mb-1">
                    Initial Credits limit ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formCredits}
                    onChange={(e) => setFormCredits(parseFloat(e.target.value) || 0)}
                    className="w-full border-2 border-primary bg-white px-3 py-2 text-sm text-primary font-headline font-bold outline-none focus:bg-amber-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-headline font-bold uppercase text-primary mb-1">
                    Custom Notes
                  </label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    rows={2}
                    className="w-full border-2 border-primary bg-white px-3 py-2 text-sm text-primary font-body outline-none focus:bg-amber-50"
                    placeholder="e.g. Used for active generation, backup account, etc."
                  />
                </div>

                {saveError && (
                  <p className="text-xs font-body font-semibold text-red-800">{saveError}</p>
                )}

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-primary/20">
                  <button
                    type="button"
                    onClick={() => setEditingAccount(null)}
                    className="rounded-none border-2 border-primary bg-[#f2ede5] text-xs font-headline font-bold uppercase px-4 py-2 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveConfig}
                    disabled={saving || !formProfile}
                    className="rounded-none border-2 border-primary bg-[#ffcc00] text-xs font-headline font-bold uppercase px-4 py-2 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer transition-all disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Viewing CLI Billing Report Modal */}
      {viewingReport && (
        <Portal>
          <div className="fixed inset-0 z-50 overflow-y-auto bg-primary/40 backdrop-blur-xs flex justify-center p-4">
            <div className="w-full max-w-2xl border-3 border-primary bg-white p-6 shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col my-auto max-h-[90vh]">
              <div className="flex justify-between items-center border-b-2 border-primary pb-3 mb-4 shrink-0">
                <h3 className="text-xl font-headline font-black uppercase text-primary">
                  CLI Billing Report: {viewingReport.profile}
                </h3>
                <button
                  type="button"
                  onClick={() => setViewingReport(null)}
                  className="font-headline font-black hover:text-red-700 text-lg cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="overflow-y-auto flex-1 min-h-0 smooth-scroll-region pr-1">
                <p className="text-xs font-body text-primary/70 mb-4">
                  Detailed cost breakdowns fetched from your workspace billing reports for the current month.
                </p>

                <table className="w-full text-left border-collapse border-2 border-primary font-body text-sm">
                  <thead>
                    <tr className="bg-[#f2ede5] border-b-2 border-primary font-headline font-black text-xs uppercase">
                      <th className="p-3 border-r-2 border-primary">App / Resource ID</th>
                      <th className="p-3 border-r-2 border-primary">Description</th>
                      <th className="p-3 border-r-2 border-primary">Date</th>
                      <th className="p-3">Cost ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingReport.billingReport?.map((row, rIdx) => (
                      <tr key={rIdx} className="border-b border-primary/20 last:border-0 hover:bg-[#faf7f2]">
                        <td className="p-3 border-r border-primary/20 font-mono text-xs max-w-[120px] truncate" title={row["Object ID"] || row.objectId}>
                          {row["Object ID"] || row.objectId || "N/A"}
                        </td>
                        <td className="p-3 border-r border-primary/20 font-semibold">
                          {row.Description || row.description || "N/A"}
                        </td>
                        <td className="p-3 border-r border-primary/20 font-mono text-xs">
                          {row["Interval Start"] ? row["Interval Start"].split("T")[0] : "N/A"}
                        </td>
                        <td className="p-3 font-mono font-bold">
                          ${parseFloat(row.Cost || row.cost || "0").toFixed(6)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end mt-4 pt-4 border-t border-primary/20 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewingReport(null)}
                  className="rounded-none border-2 border-primary bg-primary text-white font-headline font-bold uppercase text-xs px-4 py-2 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer transition-all"
                >
                  Close Report
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Connect & Deploy Modal */}
      {connectingNew && (
        <Portal>
          <div className="fixed inset-0 z-50 overflow-y-auto bg-primary/40 backdrop-blur-xs flex justify-center p-4">
            <div className="w-full max-w-xl border-3 border-primary bg-[#faf7f2] p-6 shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col my-auto max-h-[90vh]">
              <div className="flex justify-between items-center border-b-2 border-primary pb-3 mb-4 shrink-0">
                <h3 className="text-xl font-headline font-black uppercase text-primary">
                {modalAction === "undeploy" ? "Undeploying Modal Account" : "Connect New Modal Account"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (deployState && ["configuring_token", "creating_secret", "deploying"].includes(deployState.status)) {
                    // Minimize but keep running in background
                    setConnectingNew(false);
                  } else {
                    resetDeploy();
                    setConnectingNew(false);
                  }
                }}
                className="font-headline font-black hover:text-red-700 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Check if deployment is active/completed */}
            {deployState && deployState.status !== "idle" ? (
              // View 2: Terminal Logs & Active Progress Console
              <div className="flex-1 flex flex-col min-h-0">
                <div className="mb-4 shrink-0">
                  <h4 className="text-sm font-headline font-bold uppercase text-primary mb-2 flex items-center gap-2">
                    {deployState.status === "success" ? (
                      <span className="text-green-600">✔ {modalAction === "undeploy" ? "REMOVE SUCCESSFUL" : "DEPLOYMENT SUCCESSFUL"}</span>
                    ) : deployState.status === "failed" ? (
                      <span className="text-red-600">✘ {modalAction === "undeploy" ? "REMOVE FAILED" : "DEPLOYMENT FAILED"}</span>
                    ) : (
                      <>
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                        <span className="text-amber-600 animate-pulse">
                          {modalAction === "undeploy" ? `UNDEPLOYING FROM PROFILE '${newProfile || "MODAL"}'...` : `DEPLOYING TO PROFILE '${newProfile || "MODAL"}'...`}
                        </span>
                      </>
                    )}
                  </h4>

                  {/* Visual steps */}
                  {modalAction === "undeploy" ? (
                    <div className="grid grid-cols-3 gap-2 text-[10px] font-headline font-bold uppercase text-center">
                      <div className={`p-1 border ${
                        deployState.status === "deploying"
                          ? "bg-amber-100 border-primary text-primary animate-pulse"
                          : ["success", "failed"].includes(deployState.status)
                          ? "bg-primary text-white border-primary"
                          : "bg-[#f2ede5] border-primary/20 text-primary/40"
                      }`}>
                        1. Stop App
                      </div>
                      <div className={`p-1 border ${
                        deployState.status === "success"
                          ? "bg-primary text-white border-primary"
                          : "bg-[#f2ede5] border-primary/20 text-primary/40"
                      }`}>
                        2. Remove Config
                      </div>
                      <div className={`p-1 border ${
                        deployState.status === "success"
                          ? "bg-[#def3e5] border-[#128342] text-[#128342]"
                          : deployState.status === "failed"
                          ? "bg-[#fff0f0] border-red-800 text-red-800"
                          : "bg-[#f2ede5] border-primary/20 text-primary/40"
                      }`}>
                        3. Finished
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 text-[10px] font-headline font-bold uppercase text-center">
                      <div className={`p-1 border ${
                        ["configuring_token", "creating_secret", "deploying", "success", "failed"].includes(deployState.status)
                          ? "bg-primary text-white border-primary"
                          : "bg-[#f2ede5] border-primary/20 text-primary/40"
                      }`}>
                        1. Token Config
                      </div>
                      <div className={`p-1 border ${
                        ["creating_secret", "deploying", "success", "failed"].includes(deployState.status)
                          ? "bg-primary text-white border-primary"
                          : deployState.status === "configuring_token"
                          ? "bg-amber-100 border-primary text-primary animate-pulse"
                          : "bg-[#f2ede5] border-primary/20 text-primary/40"
                      }`}>
                        2. Create Secret
                      </div>
                      <div className={`p-1 border ${
                        ["deploying", "success", "failed"].includes(deployState.status)
                          ? "bg-primary text-white border-primary"
                          : deployState.status === "creating_secret"
                          ? "bg-amber-100 border-primary text-primary animate-pulse"
                          : "bg-[#f2ede5] border-primary/20 text-primary/40"
                      }`}>
                        3. Deploy TTS API
                      </div>
                      <div className={`p-1 border ${
                        deployState.status === "success"
                          ? "bg-[#def3e5] border-[#128342] text-[#128342]"
                          : deployState.status === "failed"
                          ? "bg-[#fff0f0] border-red-800 text-red-800"
                          : "bg-[#f2ede5] border-primary/20 text-primary/40"
                      }`}>
                        4. Finished
                      </div>
                    </div>
                  )}
                </div>

                {/* Terminal Console */}
                <div className="flex-1 min-h-0 flex flex-col border-2 border-primary bg-slate-950 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]">
                  <div className="bg-slate-900 border-b border-primary/20 px-3 py-1.5 flex justify-between items-center text-[10px] font-mono text-slate-400 shrink-0">
                    <span>modal-deployer-stream.sh</span>
                    <span>UTF-8</span>
                  </div>
                  <pre
                    ref={terminalRef}
                    className="flex-1 overflow-y-auto p-4 font-mono text-xs text-slate-200 selection:bg-amber-500 selection:text-black leading-relaxed smooth-scroll-region"
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {deployState.progress || "Configuring connection parameters..."}
                  </pre>
                </div>

                {deployState.error && (
                  <div className="mt-4 p-3 bg-[#fff0f0] border-2 border-red-800 text-xs font-body text-red-950 shrink-0">
                    <span className="font-bold">Error:</span> {deployState.error}
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-primary/20 shrink-0">
                  {["configuring_token", "creating_secret", "deploying"].includes(deployState.status) && (
                    <p className="text-[10px] font-headline font-bold uppercase text-primary/60 self-center mr-auto">
                      ⚡ Deployment runs in the background. You can safely close this window.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (deployState.status === "success" || deployState.status === "failed") {
                        resetDeploy();
                      } else {
                        setConnectingNew(false);
                      }
                    }}
                    className="rounded-none border-2 border-primary bg-[#f2ede5] text-xs font-headline font-bold uppercase px-4 py-2 cursor-pointer"
                  >
                    {["configuring_token", "creating_secret", "deploying"].includes(deployState.status) ? "Minimize" : "Close"}
                  </button>

                  {deployState.status === "failed" && (
                    <button
                      type="button"
                      onClick={resetDeploy}
                      className="rounded-none border-2 border-primary bg-[#ffcc00] text-xs font-headline font-bold uppercase px-4 py-2 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer transition-all"
                    >
                      Configure Again
                    </button>
                  )}

                  {deployState.status === "success" && (
                    <button
                      type="button"
                      onClick={() => {
                        resetDeploy();
                        setConnectingNew(false);
                      }}
                      className="rounded-none border-2 border-primary bg-[#a3e635] text-primary font-headline font-bold uppercase text-xs px-4 py-2 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer transition-all"
                    >
                      All Done
                    </button>
                  )}
                </div>
              </div>
            ) : (
              // View 1: Connect Form
              <div className="overflow-y-auto flex-1 pr-1 smooth-scroll-region">
                <div className="grid gap-4">
                  {/* Smart Auto-fill Paste Input */}
                  <div className="bg-[#fff8db] border-2 border-dashed border-primary/55 p-3">
                    <label className="block text-xs font-headline font-bold uppercase text-primary mb-1">
                      ⚡ Smart Paste Autocomplete
                    </label>
                    <textarea
                      rows={1}
                      onChange={(e) => {
                        handlePasteHelper(e.target.value);
                        e.target.value = ""; // clear after parsing
                      }}
                      placeholder="Paste the full 'modal token set --token-id ak-... --token-secret as-...' command here"
                      className="w-full border-2 border-primary bg-white px-3 py-2 text-xs text-primary font-mono outline-none focus:bg-amber-50"
                    />
                    <p className="mt-1 text-[10px] text-primary/60">
                      Copy your setup command directly from Modal Dashboard and paste above. We&apos;ll extract profile, token id, and token secret instantly!
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-headline font-bold uppercase text-primary mb-1">
                        Modal CLI Profile Name
                      </label>
                      <input
                        type="text"
                        value={newProfile}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewProfile(val);
                          // Auto update label if it's default
                          if (!newLabel || newLabel === `MODAL ACCOUNT ${accounts.length + 1}` || newLabel.startsWith("MODAL ACCOUNT ")) {
                            setNewLabel(`MODAL ACCOUNT ${accounts.length + 1} (${val.toUpperCase()})`);
                          }
                        }}
                        className="w-full border-2 border-primary bg-white px-3 py-2 text-sm text-primary font-mono outline-none focus:bg-amber-50"
                        placeholder="e.g. khmer-ai-research"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-headline font-bold uppercase text-primary mb-1">
                        Account Label
                      </label>
                      <input
                        type="text"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        className="w-full border-2 border-primary bg-white px-3 py-2 text-sm text-primary font-headline font-bold outline-none focus:bg-amber-50"
                        placeholder="e.g. MODAL ACCOUNT 4"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-headline font-bold uppercase text-primary mb-1">
                      Token ID
                    </label>
                    <input
                      type="text"
                      value={newTokenId}
                      onChange={(e) => setNewTokenId(e.target.value)}
                      autoComplete="new-password"
                      className="w-full border-2 border-primary bg-white px-3 py-2 text-sm text-primary font-mono outline-none focus:bg-amber-50"
                      placeholder="ak-xxxxxxxxxxxxxxxxxxxx"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-headline font-bold uppercase text-primary mb-1">
                      Token Secret
                    </label>
                    <input
                      type="password"
                      value={newTokenSecret}
                      onChange={(e) => setNewTokenSecret(e.target.value)}
                      autoComplete="new-password"
                      className="w-full border-2 border-primary bg-white px-3 py-2 text-sm text-primary font-mono outline-none focus:bg-amber-50"
                      placeholder="as-xxxxxxxxxxxxxxxxxxxx"
                      required
                    />
                  </div>


                  <div>
                    <label className="block text-xs font-headline font-bold uppercase text-primary mb-1">
                      Model Script File to Deploy
                    </label>
                    <select
                      value={newModelFile}
                      onChange={(e) => setNewModelFile(e.target.value)}
                      className="w-full border-2 border-primary bg-white px-3 py-2 text-sm text-primary font-mono outline-none focus:bg-amber-50 rounded-none appearance-none"
                      style={{
                        backgroundImage: `url("data:image/svg+xml;utf8,<svg fill='black' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/><path d='M0 0h24v24H0z' fill='none'/></svg>")`,
                        backgroundPosition: "right 10px center",
                        backgroundRepeat: "no-repeat",
                      }}
                    >
                      {availableVersions.length > 0 ? (
                        availableVersions.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))
                      ) : (
                        <option value="modal_voxcpm_api.py">modal_voxcpm_api.py (default)</option>
                      )}
                    </select>
                    <p className="mt-1 text-[10px] text-primary/60">
                      Select which Python deployment file to push to Modal.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-headline font-bold uppercase text-primary mb-1">
                        Initial Credits Budget ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={newCredits}
                        onChange={(e) => setNewCredits(parseFloat(e.target.value) || 0)}
                        className="w-full border-2 border-primary bg-white px-3 py-2 text-sm text-primary font-headline font-bold outline-none focus:bg-amber-50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-headline font-bold uppercase text-primary mb-1">
                        Custom Notes
                      </label>
                      <input
                        type="text"
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                        className="w-full border-2 border-primary bg-white px-3 py-2 text-sm text-primary font-body outline-none focus:bg-amber-50"
                        placeholder="e.g. Khmer AI main account"
                      />
                    </div>
                  </div>

                  {connectError && (
                    <p className="text-xs font-body font-semibold text-red-800">{connectError}</p>
                  )}

                  <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-primary/20 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConnectingNew(false)}
                      className="rounded-none border-2 border-primary bg-[#f2ede5] text-xs font-headline font-bold uppercase px-4 py-2 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={startConnectAndDeploy}
                      disabled={connecting || !newProfile || !newTokenId || !newTokenSecret}
                      className="rounded-none border-2 border-primary bg-[#ffcc00] text-xs font-headline font-bold uppercase px-4 py-2 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer transition-all disabled:opacity-50"
                    >
                      {connecting ? "Starting..." : "Setup & Auto Deploy"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Portal>
      )}
    </section>
  );
}
