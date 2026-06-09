"use client";

import Link from "next/link";
import { useState } from "react";

import { useAdminCachedJson } from "@/app/app/admin/admin-data-cache";
import {
  AdminPanelSkeleton,
  formatDate,
  InlineAdminError,
  MetricCard,
} from "@/app/app/admin/admin-shared";
import type { AdminCustomerSummary } from "@/lib/types";

type AdminCustomersData = {
  customers: AdminCustomerSummary[];
  generatedAt: string;
};

export function AdminCustomersClient() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended" | "api">("all");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [bulkAmount, setBulkAmount] = useState("");
  const [bulkTokenNote, setBulkTokenNote] = useState("");
  const [bulkSuspendReason, setBulkSuspendReason] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkError, setBulkError] = useState("");

  const { data, error, loading, refreshing, refresh } = useAdminCachedJson<AdminCustomersData>(
    "admin:customers",
    "/api/admin/customers",
    { pollMs: 45_000, staleMs: 45_000 },
  );

  if (loading && !data) return <AdminPanelSkeleton label="Loading admin customers" />;

  const customers = data?.customers ?? [];
  const suspendedCount = customers.filter((customer) => customer.user.suspendedAt).length;
  const totalBalance = customers.reduce((sum, customer) => sum + customer.tokenBalance, 0);
  const apiUsers = customers.filter((customer) => customer.activeApiKeys > 0).length;
  const filteredCustomers = filterCustomers(customers, query, statusFilter);

  async function postJson(path: string, body?: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      balance?: number | null;
    };
    if (!response.ok) {
      throw new Error(result.error ?? "Action failed.");
    }
    return result;
  }

  async function handleBulkTokens(e: React.FormEvent) {
    e.preventDefault();
    const parsedAmount = Number(bulkAmount);
    if (!Number.isInteger(parsedAmount) || parsedAmount === 0) {
      setBulkError("Amount must be a non-zero integer.");
      return;
    }
    setBulkLoading(true);
    setBulkMessage("");
    setBulkError("");

    let successCount = 0;
    const failedEmails: string[] = [];

    for (const id of selectedCustomerIds) {
      const customer = customers.find((c) => c.user.id === id);
      const email = customer?.user.email ?? id;
      try {
        await postJson(`/api/admin/customers/${id}/tokens`, {
          amount: parsedAmount,
          note: bulkTokenNote || "Bulk token adjustment",
        });
        successCount++;
      } catch (err) {
        console.error(`Error adjusting tokens for ${email}:`, err);
        failedEmails.push(email);
      }
    }

    setBulkLoading(false);
    if (failedEmails.length > 0) {
      setBulkError(`Tokens updated for ${successCount} customers. Failed for: ${failedEmails.join(", ")}`);
    } else {
      setBulkMessage(`Successfully updated tokens for ${successCount} customers.`);
      setBulkAmount("");
      setBulkTokenNote("");
      setSelectedCustomerIds([]);
    }
    await refresh();
  }

  async function handleBulkSuspend(e: React.FormEvent) {
    e.preventDefault();
    if (!bulkSuspendReason.trim()) {
      setBulkError("Suspension reason is required.");
      return;
    }
    if (!window.confirm(`Suspend the ${selectedCustomerIds.length} selected customer accounts?`)) {
      return;
    }
    setBulkLoading(true);
    setBulkMessage("");
    setBulkError("");

    let successCount = 0;
    const failedEmails: string[] = [];

    for (const id of selectedCustomerIds) {
      const customer = customers.find((c) => c.user.id === id);
      const email = customer?.user.email ?? id;
      try {
        await postJson(`/api/admin/customers/${id}/suspend`, {
          reason: bulkSuspendReason,
        });
        successCount++;
      } catch (err) {
        console.error(`Error suspending ${email}:`, err);
        failedEmails.push(email);
      }
    }

    setBulkLoading(false);
    if (failedEmails.length > 0) {
      setBulkError(`Suspended ${successCount} customers. Failed for: ${failedEmails.join(", ")}`);
    } else {
      setBulkMessage(`Successfully suspended ${successCount} customers.`);
      setBulkSuspendReason("");
      setSelectedCustomerIds([]);
    }
    await refresh();
  }

  async function handleBulkUnsuspend() {
    if (!window.confirm(`Unsuspend the ${selectedCustomerIds.length} selected customer accounts?`)) {
      return;
    }
    setBulkLoading(true);
    setBulkMessage("");
    setBulkError("");

    let successCount = 0;
    const failedEmails: string[] = [];

    for (const id of selectedCustomerIds) {
      const customer = customers.find((c) => c.user.id === id);
      const email = customer?.user.email ?? id;
      try {
        await postJson(`/api/admin/customers/${id}/unsuspend`);
        successCount++;
      } catch (err) {
        console.error(`Error unsuspending ${email}:`, err);
        failedEmails.push(email);
      }
    }

    setBulkLoading(false);
    if (failedEmails.length > 0) {
      setBulkError(`Unsuspended ${successCount} customers. Failed for: ${failedEmails.join(", ")}`);
    } else {
      setBulkMessage(`Successfully unsuspended ${successCount} customers.`);
      setSelectedCustomerIds([]);
    }
    await refresh();
  }

  return (
    <section className="grid min-w-0 gap-5 relative pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-primary pb-5">
        <div>
          <h1 className="text-[38px] font-headline font-black uppercase tracking-tight text-primary leading-none">Admin Customers</h1>
          <p className="mt-2 text-sm font-body text-on-surface-variant">
            Cached customer list for fast sidebar switching and background refresh.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-none border-2 border-primary bg-primary bg-primary-fixed px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
        >
          {refreshing ? "Refreshing..." : `Cached ${data ? formatDate(data.generatedAt) : ""}`}
        </button>
      </div>

      {error ? <InlineAdminError message={error} /> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Customers" value={customers.length.toLocaleString()} note="All registered users" />
        <MetricCard label="Suspended" value={suspendedCount.toLocaleString()} note="Blocked from API and app generation" />
        <MetricCard label="API Users" value={apiUsers.toLocaleString()} note="Has at least one active key" />
        <MetricCard label="Outstanding Tokens" value={totalBalance.toLocaleString()} note="Total token liability" />
      </section>

      <section className="min-w-0 rounded-none border-3 border-primary bg-surface p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-primary pb-3">
          <div>
            <h2 className="text-2xl font-headline font-black uppercase text-[#1c212d] leading-none">Customer Accounts</h2>
            <p className="mt-2 text-xs font-body text-[#6a7282]">
              Search by email, user ID, status, balance, orders, active keys, or last activity.
            </p>
          </div>
          <p className="text-sm font-headline font-bold text-on-surface-variant">
            Showing {filteredCustomers.length.toLocaleString()} of {customers.length.toLocaleString()}
          </p>
        </div>

        <div className="mt-4 grid gap-3 rounded-none border border-primary bg-white p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="grid gap-1 text-xs font-headline font-bold uppercase text-primary">
            Search account
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Email, user ID, status, balance, order count..."
              className="rounded-none border-2 border-primary bg-white px-3 py-2 text-sm outline-none focus:bg-surface-container-low focus:border-primary"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <FilterButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
              All
            </FilterButton>
            <FilterButton active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>
              Active
            </FilterButton>
            <FilterButton active={statusFilter === "suspended"} onClick={() => setStatusFilter("suspended")}>
              Suspended
            </FilterButton>
            <FilterButton active={statusFilter === "api"} onClick={() => setStatusFilter("api")}>
              API Users
            </FilterButton>
            {(query || statusFilter !== "all") ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("all");
                }}
                className="rounded-none border-2 border-primary bg-white px-3 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] transition-all cursor-pointer"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 max-w-full overflow-x-auto rounded-none border-2 border-primary">
          <table className="w-full min-w-[1160px] text-sm">
            <thead className="bg-[#f2ede5] text-left text-primary font-headline font-bold uppercase border-b-2 border-primary">
              <tr>
                <th className="px-3 py-2 text-center w-12">
                  <input
                    type="checkbox"
                    checked={
                      filteredCustomers.length > 0 &&
                      filteredCustomers.every((c) => selectedCustomerIds.includes(c.user.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCustomerIds((prev) => {
                          const newIds = [...prev];
                          filteredCustomers.forEach((c) => {
                            if (!newIds.includes(c.user.id)) {
                              newIds.push(c.user.id);
                            }
                          });
                          return newIds;
                        });
                      } else {
                        setSelectedCustomerIds((prev) => {
                          const idsToRemove = filteredCustomers.map((c) => c.user.id);
                          return prev.filter((id) => !idsToRemove.includes(id));
                        });
                      }
                    }}
                    className="h-4 w-4 border-2 border-primary rounded-none cursor-pointer"
                  />
                </th>
                <th className="px-3 py-2 font-semibold">Customer</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Balance</th>
                <th className="px-3 py-2 font-semibold">Credits Bought</th>
                <th className="px-3 py-2 font-semibold">Generations</th>
                <th className="px-3 py-2 font-semibold">API Requests</th>
                <th className="px-3 py-2 font-semibold">Orders</th>
                <th className="px-3 py-2 font-semibold">Active Keys</th>
                <th className="px-3 py-2 font-semibold">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-[#6a7282] font-body">
                    No customers found.
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-[#6a7282] font-body">
                    No customer matches this search.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <CustomerRow
                    key={customer.user.id}
                    customer={customer}
                    isSelected={selectedCustomerIds.includes(customer.user.id)}
                    onToggle={(checked) => {
                      if (checked) {
                        setSelectedCustomerIds((prev) => [...prev, customer.user.id]);
                      } else {
                        setSelectedCustomerIds((prev) => prev.filter((id) => id !== customer.user.id));
                      }
                    }}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Floating Bulk Action Panel */}
      {selectedCustomerIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-5xl rounded-none border-3 border-primary bg-[#00ffcc] p-4 font-headline uppercase text-primary shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] transition-all">
          <div className="flex flex-col gap-3">
            {/* Header/Info line */}
            <div className="flex flex-wrap items-center justify-between border-b border-primary/30 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-base font-black bg-white px-2 py-0.5 border-2 border-primary">
                  {selectedCustomerIds.length} Selected
                </span>
                <span className="text-xs font-bold text-primary/80 normal-case">
                  Select customers to apply bulk changes.
                </span>
              </div>
              <div className="flex items-center gap-2">
                {bulkMessage && (
                  <span className="text-xs font-bold text-emerald-900 normal-case bg-white border border-primary px-2 py-0.5 max-w-[300px] truncate">
                    {bulkMessage}
                  </span>
                )}
                {bulkError && (
                  <span className="text-xs font-bold text-red-700 normal-case bg-white border border-primary px-2 py-0.5 max-w-[300px] truncate">
                    {bulkError}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomerIds([]);
                    setBulkMessage("");
                    setBulkError("");
                  }}
                  className="rounded-none border-2 border-primary bg-white px-2 py-1 text-xs font-bold hover:bg-surface-container-high transition-all cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>
            </div>

            {/* Actions group */}
            <div className="grid gap-3 lg:grid-cols-3 font-bold text-xs">
              {/* Form 1: Adjust Tokens */}
              <form
                onSubmit={handleBulkTokens}
                className="flex flex-col justify-between gap-2 rounded-none border-2 border-primary bg-white p-2.5 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
              >
                <div>
                  <div className="font-black">Adjust Tokens</div>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Amount (e.g. 1000)"
                      value={bulkAmount}
                      onChange={(e) => setBulkAmount(e.target.value)}
                      disabled={bulkLoading}
                      className="w-1/2 rounded-none border-2 border-primary bg-white px-2 py-1 outline-none text-xs font-body font-normal"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Note (e.g. Bulk promo)"
                      value={bulkTokenNote}
                      onChange={(e) => setBulkTokenNote(e.target.value)}
                      disabled={bulkLoading}
                      className="w-1/2 rounded-none border-2 border-primary bg-white px-2 py-1 outline-none text-xs font-body font-normal"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={bulkLoading}
                  className="w-full rounded-none border-2 border-primary bg-[#ffcc00] py-1.5 text-xs font-bold uppercase shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all cursor-pointer disabled:opacity-50"
                >
                  {bulkLoading ? "Processing..." : "Apply Adjustment"}
                </button>
              </form>

              {/* Form 2: Suspend */}
              <form
                onSubmit={handleBulkSuspend}
                className="flex flex-col justify-between gap-2 rounded-none border-2 border-primary bg-white p-2.5 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
              >
                <div>
                  <div className="font-black text-red-700">Suspend Accounts</div>
                  <input
                    type="text"
                    placeholder="Suspension Reason"
                    value={bulkSuspendReason}
                    onChange={(e) => setBulkSuspendReason(e.target.value)}
                    disabled={bulkLoading}
                    className="mt-2 w-full rounded-none border-2 border-primary bg-white px-2 py-1 outline-none text-xs font-body font-normal"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={bulkLoading}
                  className="w-full rounded-none border-2 border-primary bg-[#fca5a5] py-1.5 text-xs font-bold uppercase shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all cursor-pointer disabled:opacity-50"
                >
                  {bulkLoading ? "Processing..." : "Suspend Selected"}
                </button>
              </form>

              {/* Box 3: Unsuspend */}
              <div className="flex flex-col justify-between gap-2 rounded-none border-2 border-primary bg-white p-2.5 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                <div>
                  <div className="font-black text-[#116d3c]">Unsuspend Accounts</div>
                  <div className="mt-2 text-[10px] text-primary/70 normal-case font-body font-normal">
                    Re-enable all selected accounts to allow app and API operations.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleBulkUnsuspend}
                  disabled={bulkLoading}
                  className="w-full rounded-none border-2 border-primary bg-[#a7f3d0] py-1.5 text-xs font-bold uppercase shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all cursor-pointer disabled:opacity-50"
                >
                  {bulkLoading ? "Processing..." : "Unsuspend Selected"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-none px-3 py-2 text-sm font-headline font-bold uppercase transition-all cursor-pointer ${
        active
          ? "bg-primary-fixed text-primary border-2 border-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] translate-x-0.5 -translate-y-0.5"
          : "border-2 border-primary bg-white text-primary hover:bg-surface-container-high"
      }`}
    >
      {children}
    </button>
  );
}

function CustomerRow({
  customer,
  isSelected,
  onToggle,
}: {
  customer: AdminCustomerSummary;
  isSelected: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <tr className="border-t border-primary text-[#202533] hover:bg-surface-container-low/40">
      <td className="px-3 py-3 text-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 border-2 border-primary rounded-none cursor-pointer"
        />
      </td>
      <td className="px-3 py-3">
        <Link href={`/app/admin/customers/${customer.user.id}`} className="font-headline font-bold text-[#116d3c] hover:underline">
          {customer.user.email}
        </Link>
        <p className="mt-1 font-mono text-xs text-[#7a8292]">{customer.user.id}</p>
      </td>
      <td className="px-3 py-3">
        <span className={`rounded-none border px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider ${
          customer.user.suspendedAt ? "bg-red-50 text-red-700 border-red-700" : "bg-accent-soft text-accent-strong border-accent-strong"
        }`}>
          {customer.user.suspendedAt ? "suspended" : "active"}
        </span>
        {customer.user.suspendedReason ? (
          <p className="mt-1 max-w-[180px] truncate text-xs text-red-700 font-body">{customer.user.suspendedReason}</p>
        ) : null}
      </td>
      <td className="px-3 py-3 font-body font-bold">{customer.tokenBalance.toLocaleString()}</td>
      <td className="px-3 py-3 font-body">{customer.totalCreditsEarned.toLocaleString()}</td>
      <td className="px-3 py-3 font-body">{customer.totalGenerations.toLocaleString()}</td>
      <td className="px-3 py-3 font-body">{customer.apiRequests.toLocaleString()}</td>
      <td className="px-3 py-3 font-body">{customer.paymentOrders.toLocaleString()}</td>
      <td className="px-3 py-3 font-body">{customer.activeApiKeys.toLocaleString()}</td>
      <td className="px-3 py-3 font-body">{formatDate(customer.lastActivityAt ?? customer.user.createdAt)}</td>
    </tr>
  );
}


function filterCustomers(
  customers: AdminCustomerSummary[],
  query: string,
  statusFilter: "all" | "active" | "suspended" | "api",
): AdminCustomerSummary[] {
  const normalized = query.trim().toLowerCase();
  return customers.filter((customer) => {
    if (statusFilter === "active" && customer.user.suspendedAt) return false;
    if (statusFilter === "suspended" && !customer.user.suspendedAt) return false;
    if (statusFilter === "api" && customer.activeApiKeys <= 0) return false;
    if (!normalized) return true;

    const status = customer.user.suspendedAt ? "suspended" : "active";
    const lastActivity = formatDate(customer.lastActivityAt ?? customer.user.createdAt);
    const haystack = [
      customer.user.email,
      customer.user.id,
      status,
      customer.user.suspendedReason ?? "",
      customer.tokenBalance,
      customer.totalCreditsEarned,
      customer.totalGenerations,
      customer.apiRequests,
      customer.paymentOrders,
      customer.activeApiKeys,
      lastActivity,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalized);
  });
}
