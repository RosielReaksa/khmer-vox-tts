"use client";

import { useEffect, useState } from "react";

// Persist the one-time raw API key across tab refreshes / accidental navigation.
// Using sessionStorage (cleared on tab close) so the secret does not linger
// across browser sessions. Storage failures are non-fatal.
const RAW_KEY_STORAGE_KEY = "voxtts:revealedRawKey";

type RevealedKeySnapshot = {
  rawKey: string;
  expiresAt: number;
};

function readRevealedKey(): RevealedKeySnapshot | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage?.getItem(RAW_KEY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RevealedKeySnapshot;
    if (
      !parsed ||
      typeof parsed.rawKey !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.rawKey.length === 0 ||
      parsed.expiresAt <= Date.now()
    ) {
      window.sessionStorage?.removeItem(RAW_KEY_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeRevealedKey(snapshot: RevealedKeySnapshot) {
  try {
    window.sessionStorage?.setItem(RAW_KEY_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* sessionStorage unavailable or quota: non-fatal */
  }
}

function clearRevealedKey() {
  try {
    window.sessionStorage?.removeItem(RAW_KEY_STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

import { clearDashboardCache } from "@/app/app/dashboard/dashboard-data-cache";
import { Portal } from "@/app/components/portal";

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

type ApiAccess = {
  hasPaidApiAccess: boolean;
  currentPlanName: string;
  businessLimits: {
    dailyTokenLimit: number | null;
    monthlyTokenLimit: number | null;
    maxConcurrentRequests: number | null;
    maxConcurrentJobs: number | null;
    maxQueuedJobs: number | null;
  } | null;
};

const RAW_KEY_VISIBLE_MS = 5 * 60 * 1000;

export function KeyManager({
  initialKeys,
  apiAccess,
  onKeysChange,
  isBusiness = false,
}: {
  initialKeys: ApiKeyItem[];
  apiAccess: ApiAccess;
  onKeysChange?: (keys: ApiKeyItem[]) => void;
  isBusiness?: boolean;
}) {
  const [keys, setKeys] = useState<ApiKeyItem[]>(initialKeys);
  const [name, setName] = useState("Primary key");
  const [dailyLimit, setDailyLimit] = useState("");

  // Keep the displayed key list in sync with fresh server data (polls / cache
  // invalidation) without disturbing the one-time `rawKey` reveal state below.
  // This replaces the old parent-driven remount, which refreshed this list but
  // also wiped the freshly created key reveal before it could be copied.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setKeys(initialKeys);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [initialKeys]);

  const [monthlyLimit, setMonthlyLimit] = useState("");

  // Restore the just-revealed key on mount if the user navigated away during
  // the 5-minute reveal window and came back. The lazy useState initializer reads
  // from sessionStorage on every mount, so any unmount/remount cycle (or tab
  // refresh) picks up the key reveal state without needing a useEffect.
  const [rawKey, setRawKey] = useState(() => {
    const persisted = readRevealedKey();
    return persisted?.rawKey ?? "";
  });
  const [rawKeyExpiresAt, setRawKeyExpiresAt] = useState<number | null>(() => {
    const persisted = readRevealedKey();
    return persisted?.expiresAt ?? null;
  });

  const [countdownNow, setCountdownNow] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyItem | null>(null);
  const canCreateApiKey = apiAccess.hasPaidApiAccess;
  const rawKeySecondsRemaining = rawKeyExpiresAt
    ? Math.max(0, Math.ceil((rawKeyExpiresAt - countdownNow) / 1000))
    : 0;

  useEffect(() => {
    if (!rawKey || !rawKeyExpiresAt) {
      return;
    }
    // Mirror the active reveal window to sessionStorage so a quick navigation
    // away + back (or a tab refresh) does not destroy the only copy of the key.
    writeRevealedKey({ rawKey, expiresAt: rawKeyExpiresAt });
    const expiresAt = rawKeyExpiresAt;

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setCountdownNow(now);
      if (now >= expiresAt) {
        setRawKey("");
        setRawKeyExpiresAt(null);
        setCountdownNow(0);
        setCopyStatus("");
        setMessage("API key hidden after 5 minutes. Create a new key if you did not copy it.");
        window.clearInterval(intervalId);
        clearRevealedKey();
      }
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [rawKey, rawKeyExpiresAt]);

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateApiKey) {
      setMessage("API keys require a paid token pack. Buy Creator or a token pack first.");
      return;
    }
    setLoading(true);
    setMessage("");
    setRawKey("");
    setRawKeyExpiresAt(null);
    setCountdownNow(0);
    setCopyStatus("");

    try {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          dailyTokenLimit: parseOptionalLimit(dailyLimit),
          monthlyTokenLimit: parseOptionalLimit(monthlyLimit),
          isBusiness,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        rawKey?: string;
        key?: ApiKeyItem;
      };
      if (!response.ok || !data.key || !data.rawKey) {
        setMessage(data.error ?? "Could not create key.");
        return;
      }
      const nextKeys = [data.key, ...keys];
      setKeys(nextKeys);
      onKeysChange?.(nextKeys);
      setDailyLimit("");
      setMonthlyLimit("");
      clearDashboardCache("dashboard:api");
      setRawKey(data.rawKey);
      setRawKeyExpiresAt(Date.now() + RAW_KEY_VISIBLE_MS);
      setCountdownNow(Date.now());
      setCopyStatus("");
      setMessage("New API key created. Copy it now; it will be hidden after 5 minutes.");
    } catch {
      setMessage("Network error while creating key.");
    } finally {
      setLoading(false);
    }
  }

  async function copyRawKey() {
    if (!rawKey) return;
    try {
      await navigator.clipboard.writeText(rawKey);
      setCopyStatus("Copied.");
    } catch {
      setCopyStatus("Copy failed. Select and copy the key manually.");
    }
  }

  async function saveLimits(id: string, dailyTokenLimit: number | null, monthlyTokenLimit: number | null) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/keys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyTokenLimit, monthlyTokenLimit }),
      });
      const data = (await response.json()) as { error?: string; key?: ApiKeyItem };
      if (!response.ok || !data.key) {
        setMessage(data.error ?? "Could not update key limits.");
        return;
      }
      const nextKeys = keys.map((item) => (item.id === id ? { ...item, ...data.key! } : item));
      setKeys(nextKeys);
      onKeysChange?.(nextKeys);
      clearDashboardCache("dashboard:api");
      setMessage("API key limits updated.");
    } catch {
      setMessage("Network error while updating limits.");
    } finally {
      setLoading(false);
    }
  }

  async function revokeKey(id: string) {
    setLoading(true);
    setMessage("");
    setRevokeTarget(null);
    try {
      const response = await fetch(`/api/keys/${id}/revoke`, {
        method: "POST",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(data.error ?? "Could not revoke key.");
        return;
      }
      const nextKeys = keys.map((item) =>
        item.id === id ? { ...item, revokedAt: new Date().toISOString() } : item,
      );
      setKeys(nextKeys);
      onKeysChange?.(nextKeys);
      clearDashboardCache("dashboard:api");
      setMessage("API key revoked.");
    } catch {
      setMessage("Network error while revoking key.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid gap-8 min-w-0">
      {!canCreateApiKey ? (
        <article className="bg-[#ffdad6] border-4 border-primary p-6 shadow-[4px_4px_0px_0px_#1a1a1a] text-primary relative">
          <div className="absolute -top-4 -left-4 bg-[#e63b2e] text-[#f5f0e8] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase">
            API Access Locked
          </div>
          <h2 className="mt-4 text-xl font-headline font-black uppercase">Buy a paid token pack to use API keys</h2>
          <p className="mt-2 text-sm leading-6 font-body">
            Free accounts can test the web dashboard, but public API access is only for paid
            token pack users. Current plan: <strong>{apiAccess.currentPlanName}</strong>.
          </p>
          <a
            href="/app/dashboard/billing"
            onClick={(e) => {
              e.preventDefault();
              const billingNav = document.querySelector('aside a[title="Billing"]') as HTMLAnchorElement | null;
              billingNav?.click();
            }}
            className="bg-[#1a1a1a] text-[#f5f0e8] font-headline font-bold uppercase text-xs py-2.5 px-6 border-2 border-primary shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#ffcc00] hover:text-primary transition-all cursor-pointer mt-4 inline-block"
          >
            Buy token pack
          </a>
        </article>
      ) : null}

      <article className="bg-white border-4 border-primary p-4 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative min-w-0">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b-4 border-primary pb-4">
          <div>
            <h2 className="text-xl font-headline font-black uppercase">Create API key</h2>
            <p className="mt-1 text-sm text-[#4a4a4a] font-body">
              API access is active for <strong>{apiAccess.currentPlanName}</strong>. Daily and monthly limits are optional.
            </p>
          </div>
          <span className={`px-4 py-2 border-3 border-primary font-headline font-bold uppercase text-sm shadow-[2px_2px_0px_0px_#1a1a1a] ${
            isBusiness ? "bg-[#ffcc00] text-primary" : "bg-[#f5f0e8] text-primary"
          }`}>
            {isBusiness ? "Business API Tier" : "Personal API Tier"}
          </span>
        </div>

        <form className="mt-4 grid gap-4 lg:grid-cols-[1fr_200px_200px_auto]" onSubmit={createKey}>
          <input
            id="new-key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border-[3px] border-primary bg-white p-3 font-body text-sm text-primary focus:outline-none focus:border-[#0055ff] transition-colors"
            placeholder="Key name (e.g. Production Key)"
            maxLength={50}
            required
            disabled={!canCreateApiKey || loading}
          />
          <input
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
            className="w-full border-[3px] border-primary bg-white p-3 font-body text-sm text-primary focus:outline-none focus:border-[#0055ff] transition-colors"
            inputMode="numeric"
            placeholder="Daily limit (optional)"
            disabled={!canCreateApiKey || loading}
          />
          <input
            value={monthlyLimit}
            onChange={(e) => setMonthlyLimit(e.target.value)}
            className="w-full border-[3px] border-primary bg-white p-3 font-body text-sm text-primary focus:outline-none focus:border-[#0055ff] transition-colors"
            inputMode="numeric"
            placeholder="Monthly limit (optional)"
            disabled={!canCreateApiKey || loading}
          />
          <button
            type="submit"
            disabled={loading || !canCreateApiKey}
            className="bg-[#10b981] text-primary font-headline font-black text-sm uppercase py-3 px-8 border-3 border-primary shadow-[3px_3px_0px_0px_#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#10b981] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_#1a1a1a] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create key"}
          </button>
        </form>
        <p className="mt-2 text-xs text-[#4a4a4a] font-body">
          Leave daily/monthly blank for unlimited usage within your token balance and platform rate limits.
        </p>

        {rawKey ? (
          <div className="mt-6 border-4 border-primary bg-[#ffcc00]/10 p-5 shadow-[4px_4px_0px_0px_#1a1a1a]">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-primary pb-3 mb-3">
              <div>
                <p className="text-xs font-headline font-black uppercase tracking-wider text-[#e63b2e]">
                  ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Copy this API key now
                </p>
                <p className="mt-1 text-xs text-[#4a4a4a] font-body">
                  Shown for <strong>{formatKeyRevealTime(rawKeySecondsRemaining)}</strong> only. It will not be shown again.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyRawKey()}
                className="bg-[#1a1a1a] text-[#f5f0e8] font-headline font-bold uppercase text-xs py-2 px-4 border-2 border-primary shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#ffcc00] hover:text-primary transition-all cursor-pointer"
              >
                {copyStatus === "Copied." ? "Copied!" : "Copy Key"}
              </button>
            </div>
            <p className="break-all border-2 border-primary bg-white p-3 font-mono text-sm font-semibold select-all">{rawKey}</p>
            {copyStatus ? <p className="mt-2 text-xs font-headline font-bold text-[#10b981] uppercase">{copyStatus}</p> : null}
          </div>
        ) : null}

        {message ? (
          <p className="mt-4 border-2 border-primary bg-[#def3e5] p-3 text-xs font-bold text-emerald-800 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
            {message}
          </p>
        ) : null}
      </article>

      <article className="bg-white border-4 border-primary p-4 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative min-w-0">
        <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
          Your API keys
        </div>
        <div className="mt-4 grid gap-6">
          {keys.length === 0 ? (
            <p className="text-sm text-[#4a4a4a] font-body mt-2">No API keys yet.</p>
          ) : (
            keys.map((item) => (
              <div
                key={item.id}
                className={`bg-white border-4 border-primary p-5 shadow-[4px_4px_0px_0px_#1a1a1a] transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0px_0px_#1a1a1a] relative flex flex-col md:flex-row justify-between items-start md:items-center gap-6 ${
                  item.revokedAt ? "opacity-60 grayscale" : ""
                }`}
              >
                <div className="flex-grow space-y-2">
                  <div className="flex items-center gap-3">
                    <p className="text-base font-headline font-black uppercase text-primary">{item.name}</p>
                    <span className={`inline-block px-2 py-0.5 border-2 border-primary font-label text-xs uppercase ${
                      item.revokedAt ? "bg-[#e63b2e] text-[#f5f0e8]" : "bg-[#10b981] text-primary"
                    }`}>
                      {item.revokedAt ? "revoked" : "active"}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-primary bg-[#f5f0e8] px-2 py-1 w-fit border border-primary font-semibold">
                    {item.keyPrefix}ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 pt-2 text-xs font-body text-[#4a4a4a]">
                    <p>ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â <strong>Created:</strong> {new Date(item.createdAt).toLocaleDateString()}</p>
                    <p>ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ <strong>Last Used:</strong> {item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleDateString() : "never"}</p>
                    <p>ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â  <strong>Total Requests:</strong> {item.requestCount.toLocaleString()}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-2 border-t border-[#e5e5e5] text-xs font-body text-[#4a4a4a]">
                    <p>ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ <strong>Daily Limit:</strong> {formatLimit(item.dailyTokenLimit)}</p>
                    <p>ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ <strong>Monthly Limit:</strong> {formatLimit(item.monthlyTokenLimit)}</p>
                  </div>
                  {(item.maxConcurrentRequests !== null || item.maxConcurrentJobs !== null || item.maxQueuedJobs !== null) && (
                    <div className="pt-2 border-t border-[#e5e5e5] text-xs font-headline font-bold text-[#0055ff] flex flex-wrap gap-x-4">
                      <span>ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ Requests Concurrency: {formatBusinessLimit(item.maxConcurrentRequests)}</span>
                      <span>ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ Active Jobs: {formatBusinessLimit(item.maxConcurrentJobs)}</span>
                      <span>ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ Queue limit: {formatBusinessLimit(item.maxQueuedJobs)}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {!item.revokedAt ? (
                    <LimitEditor
                      item={item}
                      disabled={loading}
                      onSave={(daily, monthly) => void saveLimits(item.id, daily, monthly)}
                    />
                  ) : null}
                  {item.revokedAt ? (
                    <span className="bg-[#e8e3da] text-[#4a4a4a] border-2 border-primary font-headline font-bold text-xs uppercase py-1 px-4">
                      Revoked Key
                    </span>
                  ) : (
                    <button
                      onClick={() => setRevokeTarget(item)}
                      disabled={loading}
                      className="bg-[#e63b2e] text-[#f5f0e8] font-headline font-bold uppercase text-xs py-2 px-4 border-2 border-primary shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#e63b2e] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_#1a1a1a] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer disabled:opacity-60"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </article>
      {revokeTarget ? (
        <RevokeKeyModal
          apiKey={revokeTarget}
          loading={loading}
          onCancel={() => setRevokeTarget(null)}
          onConfirm={() => void revokeKey(revokeTarget.id)}
        />
      ) : null}
    </section>
  );
}

function parseOptionalLimit(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function formatLimit(value: number | null): string {
  return value === null ? "unlimited" : value.toLocaleString();
}

function formatBusinessLimit(value: number | null): string {
  return value === null ? "default" : value.toLocaleString();
}

function formatKeyRevealTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  if (minutes <= 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

function LimitEditor({
  item,
  disabled,
  onSave,
}: {
  item: ApiKeyItem;
  disabled: boolean;
  onSave: (dailyTokenLimit: number | null, monthlyTokenLimit: number | null) => void;
}) {
  const [daily, setDaily] = useState(item.dailyTokenLimit?.toString() ?? "");
  const [monthly, setMonthly] = useState(item.monthlyTokenLimit?.toString() ?? "");

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <input
        value={daily}
        onChange={(event) => setDaily(event.target.value)}
        className="w-24 border-2 border-primary bg-white px-2 py-1.5 font-body text-xs focus:outline-none focus:border-[#0055ff]"
        inputMode="numeric"
        placeholder="Daily limit"
      />
      <input
        value={monthly}
        onChange={(event) => setMonthly(event.target.value)}
        className="w-24 border-2 border-primary bg-white px-2 py-1.5 font-body text-xs focus:outline-none focus:border-[#0055ff]"
        inputMode="numeric"
        placeholder="Monthly limit"
      />
      <button
        type="button"
        onClick={() => onSave(parseOptionalLimit(daily), parseOptionalLimit(monthly))}
        disabled={disabled}
        className="bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-1.5 px-3 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#eee9e0] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_#1a1a1a] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer disabled:opacity-60"
      >
        Save limits
      </button>
    </div>
  );
}

function RevokeKeyModal({
  apiKey,
  loading,
  onCancel,
  onConfirm,
}: {
  apiKey: ApiKeyItem;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-xs">
        <section className="w-full max-w-lg border-4 border-primary bg-[#f5f0e8] p-6 shadow-[8px_8px_0px_0px_#1a1a1a] relative">
          <div className="absolute -top-4 -left-4 bg-[#e63b2e] text-white border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase">
            Confirm Revoke
          </div>

          <h2 className="mt-4 text-2xl font-headline font-black uppercase text-primary">Revoke this API key?</h2>
          <p className="mt-2 text-sm leading-6 text-[#4a4a4a] font-body">
            Any app using this key will stop working immediately. This action cannot be undone.
          </p>

          <div className="mt-4 grid gap-2 border-3 border-primary bg-white p-4 text-sm font-semibold font-headline uppercase">
            <p className="flex justify-between gap-4">
              <span className="text-[#4a4a4a]">Name</span>
              <span className="text-primary font-black">{apiKey.name}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-[#4a4a4a]">Prefix</span>
              <span className="font-mono text-xs text-primary font-black">{apiKey.keyPrefix}...</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-[#4a4a4a]">Requests</span>
              <span className="text-primary font-black">{apiKey.requestCount.toLocaleString()}</span>
            </p>
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-2 px-4 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#eee9e0] transition-all cursor-pointer disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="bg-[#e63b2e] text-[#f5f0e8] border-2 border-primary font-headline font-bold uppercase text-xs py-2 px-4 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#e63b2e] transition-all cursor-pointer disabled:opacity-60"
            >
              {loading ? "Revoking..." : "Revoke Key"}
            </button>
          </div>
        </section>
      </div>
    </Portal>
  );
}
