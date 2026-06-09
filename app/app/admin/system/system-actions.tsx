"use client";

import { useEffect, useRef, useState } from "react";

type SystemAction =
  | "database"
  | "telegram"
  | "payway_signature"
  | "payway_qr"
  | "khqr"
  | "bakong_verify"
  | "modal_tts";

type ActionConfig = {
  action: SystemAction;
  label: string;
  note: string;
};

type TestResult = {
  ok: boolean;
  status: "ok" | "warn" | "error";
  detail: string;
  checkedAt: string;
  [key: string]: unknown;
};

interface EndpointTestResult {
  label: string;
  ok: boolean;
  latency?: number | string;
  detail?: string;
}

const actions: ActionConfig[] = [
  {
    action: "database",
    label: "Test Database",
    note: "Checks the active store connection.",
  },
  {
    action: "khqr",
    label: "Test Local KHQR",
    note: "Generates a $0.20 QR payload without calling PayWay.",
  },
  {
    action: "payway_signature",
    label: "Test PayWay Webhook Secret",
    note: "Generates a mock webhook body and verifies its signature with your PAYWAY_WEBHOOK_SECRET.",
  },
  {
    action: "payway_qr",
    label: "Test PayWay QR Generation",
    note: "Sends a request to PayWay Sandbox to generate a live sandbox checkout transaction QR code payload.",
  },
  {
    action: "bakong_verify",
    label: "Test Bakong Check",
    note: "Checks whether the Bakong token is accepted by the configured endpoint.",
  },
  {
    action: "telegram",
    label: "Send Telegram Test",
    note: "Sends one message to the configured admin chat.",
  },
  {
    action: "modal_tts",
    label: "Test Modal TTS",
    note: "Runs one short upstream TTS call.",
  },
];

export function WebhookCopyBox({ webhookUrl }: { webhookUrl: string | null }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function copy() {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
    } catch {
      return;
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }

  if (!webhookUrl) {
    return (
      <p className="mt-2 rounded-none border-2 border-primary bg-amber-50 px-4 py-3 text-sm font-body text-amber-950">
        Set APP_PUBLIC_URL to show the production webhook URL.
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-none border-2 border-primary bg-[#f2ede5] p-2">
      <p className="min-w-0 flex-1 break-all px-2 font-mono text-sm text-primary">{webhookUrl}</p>
      <button
        type="button"
        onClick={copy}
        className="rounded-none border-2 border-primary bg-[#ffcc00] px-3 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function SystemTestPanel() {
  const [loadingAction, setLoadingAction] = useState<SystemAction | null>(null);
  const [results, setResults] = useState<Partial<Record<SystemAction, TestResult>>>({});

  async function run(action: SystemAction) {
    setLoadingAction(action);
    try {
      const response = await fetch("/api/admin/system/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as Partial<TestResult> & { error?: string };
      const result: TestResult = {
        ok: Boolean(data.ok),
        status: data.status ?? "error",
        detail: data.detail ?? data.error ?? "System test failed.",
        checkedAt: data.checkedAt ?? new Date().toISOString(),
        ...data,
      };
      setResults((prev) => ({ ...prev, [action]: result }));
    } catch {
      setResults((prev) => ({
        ...prev,
        [action]: {
          ok: false,
          status: "error",
          detail: "Network error while running system test.",
          checkedAt: new Date().toISOString(),
        },
      }));
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <section className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-headline font-black uppercase text-primary">Live Tests</h2>
          <p className="mt-1 text-sm font-body text-primary/70">
            Run these after changing production settings.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {actions.map((item) => {
          const result = results[item.action];
          const loading = loadingAction === item.action;
          return (
            <article key={item.action} className="rounded-none border-2 border-primary bg-white p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
              <div className="flex min-h-[140px] flex-col">
                <h3 className="font-headline font-bold uppercase text-primary">{item.label}</h3>
                <p className="mt-2 text-xs font-body text-primary/70">{item.note}</p>
                <button
                  type="button"
                  onClick={() => run(item.action)}
                  disabled={loadingAction !== null}
                  className="mt-auto rounded-none border-2 border-primary bg-[#ffcc00] px-3 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-60 cursor-pointer"
                >
                  {loading ? "Testing..." : "Run"}
                </button>
              </div>
              {result ? (
                <div className={`mt-4 rounded-none border-2 px-3 py-2 text-sm font-body ${resultClass(result.status)}`}>
                  <p className="font-bold uppercase tracking-wider text-xs">{result.status}</p>
                  <p className="mt-1 text-xs break-all leading-relaxed">{result.detail}</p>
                  {Array.isArray(result.endpoints) && (
                    <div className="mt-3 border-t border-primary/20 pt-3 grid gap-2">
                      {(result.endpoints as EndpointTestResult[]).map((ep, idx) => (
                        <div key={idx} className="text-[11px] border border-primary/10 bg-white/40 p-2 font-mono">
                          <div className="flex justify-between font-bold gap-2">
                            <span className="truncate max-w-[130px]" title={ep.label}>{ep.label}</span>
                            <span className={ep.ok ? "text-emerald-700 font-bold" : "text-red-700 font-bold"}>
                              {ep.ok ? `OK (${ep.latency}ms)` : "FAIL"}
                            </span>
                          </div>
                          <p className="mt-1 opacity-80 truncate text-[10px]" title={ep.detail}>{ep.detail}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function resultClass(status: TestResult["status"]): string {
  if (status === "ok") return "border-emerald-900 bg-[#def3e5] text-emerald-900";
  if (status === "warn") return "border-amber-900 bg-amber-100 text-amber-900";
  return "border-red-900 bg-red-100 text-red-900";
}

export function AdminStatusPanel() {
  const [active, setActive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/admin/admin-status");
        if (res.ok) {
          const data = await res.json();
          setActive(data.active);
        }
      } catch (err) {
        console.error("Failed to fetch admin status", err);
      }
    }
    fetchStatus();
  }, []);

  async function toggle() {
    if (active === null || loading) return;
    setLoading(true);
    setMessage("");
    const target = !active;
    try {
      const res = await fetch("/api/admin/admin-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: target }),
      });
      if (res.ok) {
        const data = await res.json();
        setActive(data.active);
        setMessage(`Admin status updated to ${data.active ? "ONLINE" : "OFFLINE"}.`);
      } else {
        setMessage("Failed to update status.");
      }
    } catch (err) {
      setMessage("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <p className="text-xs font-headline font-bold uppercase tracking-[0.12em] text-primary/70">Support & Verification</p>
      <h2 className="mt-2 text-2xl font-headline font-black uppercase text-primary">Admin Online status</h2>
      <p className="mt-1 text-sm font-body text-primary/80">
        Toggle whether you are currently active to verify payments. Users see this on the billing/checkout page.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={active === null || loading}
          className={`rounded-none border-2 border-primary px-4 py-2 font-headline font-bold uppercase tracking-wider text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-60 cursor-pointer ${
            active ? "bg-[#10b981]" : "bg-neutral-400"
          }`}
        >
          {active === null ? "Loading..." : active ? "Admin: Online" : "Admin: Offline"}
        </button>
        <span className="text-sm font-body font-semibold text-primary/60">
          {active ? "Users see: Fast Approval active" : "Users see: Delayed Approval warning"}
        </span>
      </div>
      {message && <p className="mt-3 text-xs font-body text-primary/70">{message}</p>}
    </article>
  );
}

