"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { adminPatch, adminPost } from "@/lib/admin-fetch";

export function CustomerActions({
  customerId,
  customerEmail,
  isSuspended,
}: {
  customerId: string;
  customerEmail: string;
  isSuspended: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("1000");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [businessTokens, setBusinessTokens] = useState("100000");
  const [businessDaily, setBusinessDaily] = useState("");
  const [businessMonthly, setBusinessMonthly] = useState("1000000");
  const [businessRequests, setBusinessRequests] = useState("10");
  const [businessRunningJobs, setBusinessRunningJobs] = useState("3");
  const [businessQueuedJobs, setBusinessQueuedJobs] = useState("100");
  const [businessCloneRate, setBusinessCloneRate] = useState("1.5");
  const [businessNote, setBusinessNote] = useState("Business API access approved by admin.");
  const [applyBusinessToKeys, setApplyBusinessToKeys] = useState(true);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState("");

  async function adjustTokens(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isInteger(parsedAmount) || parsedAmount === 0) {
      setMessage("Amount must be a non-zero whole number.");
      return;
    }

    setLoading("tokens");
    setMessage("");
    try {
      const response = await adminPost(`/api/admin/customers/${customerId}/tokens`, {
        amount: parsedAmount,
        note,
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; balance?: number };
      if (!response.ok) {
        throw new Error(data.error ?? "Token adjustment failed.");
      }
      setMessage(`Token balance updated to ${(data.balance ?? 0).toLocaleString()}.`);
      setNote("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Token adjustment failed.");
    } finally {
      setLoading("");
    }
  }

  async function suspend() {
    if (!reason.trim()) {
      setMessage("Suspension reason is required.");
      return;
    }
    if (!window.confirm(`Suspend ${customerEmail}?`)) return;

    setLoading("suspend");
    setMessage("");
    try {
      const response = await adminPost(`/api/admin/customers/${customerId}/suspend`, { reason });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Suspend failed.");
      }
      setMessage("Customer suspended.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Suspend failed.");
    } finally {
      setLoading("");
    }
  }

  async function unsuspend() {
    setLoading("unsuspend");
    setMessage("");
    try {
      const response = await adminPost(`/api/admin/customers/${customerId}/unsuspend`);
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unsuspend failed.");
      }
      setMessage("Customer unsuspended.");
      setReason("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unsuspend failed.");
    } finally {
      setLoading("");
    }
  }

  async function revokeKeys() {
    if (!window.confirm(`Revoke all active API keys for ${customerEmail}?`)) return;

    setLoading("revoke");
    setMessage("");
    try {
      const response = await adminPost(`/api/admin/customers/${customerId}/revoke-keys`);
      const data = (await response.json().catch(() => ({}))) as { error?: string; revokedCount?: number };
      if (!response.ok) {
        throw new Error(data.error ?? "Key revoke failed.");
      }
      setMessage(`Revoked ${(data.revokedCount ?? 0).toLocaleString()} active API keys.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Key revoke failed.");
    } finally {
      setLoading("");
    }
  }

  async function grantBusinessAccess(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("business");
    setMessage("");
    try {
      const tokenCredit = parseOptionalTokenCredit(businessTokens);
      const response = await adminPost(`/api/admin/customers/${customerId}/business-access`, {
        tokenCredit,
        dailyTokenLimit: parseOptionalLimit(businessDaily, "Daily token limit"),
        monthlyTokenLimit: parseOptionalLimit(businessMonthly, "Monthly token limit"),
        maxConcurrentRequests: parseOptionalLimit(businessRequests, "Concurrent request limit"),
        maxConcurrentJobs: parseOptionalLimit(businessRunningJobs, "Running job limit"),
        maxQueuedJobs: parseOptionalLimit(businessQueuedJobs, "Queued job limit"),
        cloneCreditRate: parseCloneCreditRate(businessCloneRate),
        note: businessNote,
        applyToActiveKeys: applyBusinessToKeys,
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        balance?: number | null;
        creditedTokens?: number;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not grant business access.");
      }
      const balanceText = data.balance === null || data.balance === undefined
        ? ""
        : ` Balance is now ${data.balance.toLocaleString()}.`;
      setMessage(`Business API access granted. Credited ${(data.creditedTokens ?? 0).toLocaleString()} tokens.${balanceText}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not grant business access.");
    } finally {
      setLoading("");
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <article className="rounded-none border-3 border-primary bg-surface p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <h2 className="text-xl font-headline font-black uppercase text-primary leading-none">Token Adjustment</h2>
        <p className="mt-2 text-xs font-body text-[#6a7282]">
          Add customer credits or remove credits after refund, abuse, or support correction. Max 100,000,000 per action.
        </p>
        <form onSubmit={adjustTokens} className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-headline font-bold uppercase text-primary">
            Amount
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="numeric"
              className="rounded-none border-2 border-primary bg-white px-3 py-2 text-sm outline-none focus:bg-surface-container-low focus:border-primary"
              placeholder="1000 or -1000"
            />
          </label>
          <label className="grid gap-1 text-xs font-headline font-bold uppercase text-primary">
            Note
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="rounded-none border-2 border-primary bg-white px-3 py-2 text-sm outline-none focus:bg-surface-container-low focus:border-primary"
              placeholder="Support correction, refund, promotion..."
            />
          </label>
          <button
            type="submit"
            disabled={loading === "tokens"}
            className="rounded-none border-2 border-primary bg-primary-fixed text-primary px-4 py-2 text-xs font-headline font-bold uppercase shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer disabled:opacity-50"
          >
            {loading === "tokens" ? "Updating..." : "Update Tokens"}
          </button>
        </form>
      </article>

      <article className="rounded-none border-3 border-primary bg-surface p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <h2 className="text-xl font-headline font-black uppercase text-primary leading-none">Business API Access</h2>
        <p className="mt-2 text-xs font-body text-[#587064]">
          Grant this customer Business API access, apply default limits to active keys, and optionally credit tokens.
        </p>
        <form onSubmit={grantBusinessAccess} className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <LimitInput label="Token credit" value={businessTokens} onChange={setBusinessTokens} disabled={loading === "business"} />
            <LimitInput label="Daily tokens" value={businessDaily} onChange={setBusinessDaily} disabled={loading === "business"} />
            <LimitInput label="Monthly tokens" value={businessMonthly} onChange={setBusinessMonthly} disabled={loading === "business"} />
            <LimitInput label="Requests" value={businessRequests} onChange={setBusinessRequests} disabled={loading === "business"} />
            <LimitInput label="Running jobs" value={businessRunningJobs} onChange={setBusinessRunningJobs} disabled={loading === "business"} />
            <LimitInput label="Queued jobs" value={businessQueuedJobs} onChange={setBusinessQueuedJobs} disabled={loading === "business"} />
            <label className="grid gap-1 text-[10px] font-headline font-bold uppercase text-primary">
              Clone tokens/sec
              <select
                value={businessCloneRate}
                onChange={(event) => setBusinessCloneRate(event.target.value)}
                disabled={loading === "business"}
                className="w-full rounded-none border-2 border-primary bg-white px-2 py-1 text-xs text-primary outline-none focus:bg-surface-container-low disabled:bg-[#f3f5f9]"
              >
                <option value="1.5">1.5 Business</option>
                <option value="1">1.0 High volume</option>
                <option value="2">2.0 Standard</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-xs font-headline font-bold uppercase text-primary">
            Admin note
            <textarea
              value={businessNote}
              onChange={(event) => setBusinessNote(event.target.value)}
              rows={2}
              maxLength={500}
              className="resize-y rounded-none border-2 border-primary bg-white px-3 py-2 outline-none font-body text-sm focus:bg-surface-container-low focus:border-primary"
              placeholder="Why this business account is approved..."
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-headline font-bold uppercase text-primary cursor-pointer">
            <input
              type="checkbox"
              checked={applyBusinessToKeys}
              onChange={(event) => setApplyBusinessToKeys(event.target.checked)}
              className="h-4 w-4 border-2 border-primary rounded-none"
            />
            Apply limits to active API keys
          </label>
          <button
            type="submit"
            disabled={loading === "business"}
            className="rounded-none border-2 border-primary bg-[#a7f3d0] text-primary px-4 py-2 text-xs font-headline font-bold uppercase shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer disabled:opacity-50"
          >
            {loading === "business" ? "Granting..." : "Grant Business Access"}
          </button>
        </form>
      </article>

      <article className="rounded-none border-3 border-primary bg-surface p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <h2 className="text-xl font-headline font-black uppercase text-primary leading-none">Account Controls</h2>
        <p className="mt-2 text-xs font-body text-[#6a7282]">
          Suspended customers cannot generate audio, create API keys, buy packs, or call public API keys.
        </p>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-headline font-bold uppercase text-primary">
            Suspension reason
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="rounded-none border-2 border-primary bg-white px-3 py-2 text-sm outline-none focus:bg-surface-container-low focus:border-primary"
              placeholder="Payment abuse, policy violation, support hold..."
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {isSuspended ? (
              <button
                type="button"
                onClick={unsuspend}
                disabled={loading === "unsuspend"}
                className="rounded-none border-2 border-primary bg-[#a7f3d0] text-primary px-4 py-2 text-xs font-headline font-bold uppercase shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer disabled:opacity-50"
              >
                {loading === "unsuspend" ? "Restoring..." : "Unsuspend"}
              </button>
            ) : (
              <button
                type="button"
                onClick={suspend}
                disabled={loading === "suspend"}
                className="rounded-none border-2 border-primary bg-[#fca5a5] text-primary px-4 py-2 text-xs font-headline font-bold uppercase shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer disabled:opacity-50"
              >
                {loading === "suspend" ? "Suspending..." : "Suspend"}
              </button>
            )}
            <button
              type="button"
              onClick={revokeKeys}
              disabled={loading === "revoke"}
              className="rounded-none border-2 border-primary bg-white text-primary px-4 py-2 text-xs font-headline font-bold uppercase shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer disabled:opacity-50"
            >
              {loading === "revoke" ? "Revoking..." : "Revoke All API Keys"}
            </button>
          </div>
        </div>
      </article>

      {message ? (
        <p className="xl:col-span-3 rounded-none border-2 border-primary bg-white px-4 py-3 text-sm font-body text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
          {message}
        </p>
      ) : null}
    </section>
  );
}

export function ApiKeyBusinessControls({
  customerId,
  keyId,
  revoked,
  initialDailyTokenLimit,
  initialMonthlyTokenLimit,
  initialMaxConcurrentRequests,
  initialMaxConcurrentJobs,
  initialMaxQueuedJobs,
}: {
  customerId: string;
  keyId: string;
  revoked: boolean;
  initialDailyTokenLimit: number | null;
  initialMonthlyTokenLimit: number | null;
  initialMaxConcurrentRequests: number | null;
  initialMaxConcurrentJobs: number | null;
  initialMaxQueuedJobs: number | null;
}) {
  const router = useRouter();
  const [daily, setDaily] = useState(initialDailyTokenLimit?.toString() ?? "");
  const [monthly, setMonthly] = useState(initialMonthlyTokenLimit?.toString() ?? "");
  const [requests, setRequests] = useState(initialMaxConcurrentRequests?.toString() ?? "");
  const [runningJobs, setRunningJobs] = useState(initialMaxConcurrentJobs?.toString() ?? "");
  const [queuedJobs, setQueuedJobs] = useState(initialMaxQueuedJobs?.toString() ?? "");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const limits = {
        dailyTokenLimit: parseOptionalLimit(daily, "Daily token limit"),
        monthlyTokenLimit: parseOptionalLimit(monthly, "Monthly token limit"),
        maxConcurrentRequests: parseOptionalLimit(requests, "Concurrent request limit"),
        maxConcurrentJobs: parseOptionalLimit(runningJobs, "Running job limit"),
        maxQueuedJobs: parseOptionalLimit(queuedJobs, "Queued job limit"),
      };
      const response = await adminPatch(`/api/admin/customers/${customerId}/keys/${keyId}/limits`, limits);
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not update key limits.");
      }
      setMessage("Saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update key limits.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid min-w-[520px] gap-2">
      <div className="grid grid-cols-5 gap-2">
        <LimitInput label="Daily tokens" value={daily} onChange={setDaily} disabled={revoked || saving} />
        <LimitInput label="Monthly tokens" value={monthly} onChange={setMonthly} disabled={revoked || saving} />
        <LimitInput label="Requests" value={requests} onChange={setRequests} disabled={revoked || saving} />
        <LimitInput label="Running jobs" value={runningJobs} onChange={setRunningJobs} disabled={revoked || saving} />
        <LimitInput label="Queued jobs" value={queuedJobs} onChange={setQueuedJobs} disabled={revoked || saving} />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={revoked || saving}
          className="rounded-none border-2 border-primary bg-white px-3 py-1 text-xs font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] transition-all cursor-pointer disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save business limits"}
        </button>
        {message ? <span className="text-xs font-body text-[#6a7282]">{message}</span> : null}
      </div>
    </form>
  );
}

function LimitInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="grid gap-1 text-[10px] font-headline font-bold uppercase text-on-surface-variant leading-none">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="numeric"
        disabled={disabled}
        placeholder="default"
        className="w-full rounded-none border-2 border-primary bg-white px-2 py-1 text-xs text-primary outline-none focus:bg-surface-container-low disabled:bg-[#f3f5f9]"
      />
    </label>
  );
}


function parseOptionalLimit(input: string, label: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive whole number or blank for default.`);
  }
  return value;
}

function parseOptionalTokenCredit(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Token credit must be a whole number or blank for 0.");
  }
  if (value > 100_000_000) {
    throw new Error("Token credit must be 100,000,000 or lower.");
  }
  return value;
}

function parseCloneCreditRate(input: string): 1 | 1.5 | 2 {
  const value = Number(input);
  if (value === 1 || value === 1.5 || value === 2) return value;
  throw new Error("Clone token rate must be 1, 1.5, or 2.");
}
