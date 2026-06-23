"use client";

import { useCallback, useState } from "react";

import { useAdminCachedJson } from "@/app/app/admin/admin-data-cache";
import { Portal } from "@/app/components/portal";

import { AdminPanelSkeleton, InlineAdminError } from "@/app/app/admin/admin-shared";
import { adminPost } from "@/lib/admin-fetch";
import { formatUsd } from "@/lib/plans";
import type { PaymentOrderWithUser } from "@/lib/store";

type PaymentStatusFilter = PaymentOrderWithUser["status"] | "reported" | "pending_unreported" | "all";
type PendingDecision = {
  order: PaymentOrderWithUser;
  action: "approve" | "reject";
};

export function PaymentsAdminClient({
  initialOrders = [],
  autoVerificationEnabled,
}: {
  initialOrders?: PaymentOrderWithUser[];
  autoVerificationEnabled: boolean;
}) {
  const { data, error, loading, refreshing, refresh } = useAdminCachedJson<{ orders: PaymentOrderWithUser[] }>(
    "admin:payments",
    "/api/admin/payments?status=all",
    { pollMs: 15000, staleMs: 15000 },
  );
  const [manualOrders, setManualOrders] = useState<PaymentOrderWithUser[] | null>(
    initialOrders.length > 0 ? initialOrders : null,
  );
  const [adminNote, setAdminNote] = useState("");
  const [message, setMessage] = useState("");
  const [loadingOrder, setLoadingOrder] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentStatusFilter>("reported");
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => Date.now());

  const refreshOrders = useCallback(async () => {
    setManualOrders(null);
    await refresh();
    setLastUpdatedAt(Date.now());
  }, [refresh]);

  async function decide(orderId: string, action: "approve" | "reject") {
    setLoadingOrder(orderId);
    setMessage("");
    setPendingDecision(null);

    try {
      const response = await adminPost(`/api/admin/payments/${orderId}/${action}`, { adminNote });
      const data = (await response.json()) as {
        error?: string;
        order?: PaymentOrderWithUser;
      };

      if (!response.ok || !data.order) {
        setMessage(data.error ?? `Could not ${action} payment.`);
        return;
      }

      setManualOrders((prev) =>
        (prev ?? orders).map((order) =>
          order.id === orderId ? { ...order, ...data.order!, userEmail: order.userEmail } : order,
        ),
      );
      setMessage(`Payment ${action === "approve" ? "approved" : "rejected"}.`);
    } catch {
      setMessage(`Network error while trying to ${action} payment.`);
    } finally {
      setLoadingOrder("");
    }
  }

  async function recheck(orderId: string) {
    setLoadingOrder(orderId);
    setMessage("");

    try {
      const response = await adminPost(`/api/admin/payments/${orderId}/recheck`);
      const data = (await response.json()) as {
        error?: string;
        message?: string;
        order?: PaymentOrderWithUser;
      };

      if (!response.ok || !data.order) {
        setMessage(data.error ?? "Could not recheck payment.");
        return;
      }

      setManualOrders((prev) =>
        (prev ?? orders).map((order) =>
          order.id === orderId ? { ...order, ...data.order!, userEmail: order.userEmail } : order,
        ),
      );
      setMessage(data.message ?? "Payment recheck completed.");
    } catch {
      setMessage("Network error while rechecking payment.");
    } finally {
      setLoadingOrder("");
    }
  }

  async function copyOrderSummary(order: PaymentOrderWithUser) {
    const khqrAmount =
      order.khqrCurrency === "KHR"
        ? `${Math.round(order.khqrAmount ?? 0).toLocaleString()} KHR`
        : `$${(order.khqrAmount ?? order.totalPriceCents / 100).toFixed(2)}`;
    const summary = [
      `Order: ${order.id}`,
      `User: ${order.userEmail}`,
      `Plan: ${order.planName} x ${order.quantity}`,
      `Total: ${formatUsd(order.totalPriceCents)}`,
      `KHQR amount: ${khqrAmount}`,
      `Tokens: ${order.tokens.toLocaleString()}`,
      `KHQR hash: ${order.khqrMd5 || "-"}`,
      `Payment reference: ${order.paymentReference || order.providerReference || "-"}`,
      `Proof image: ${order.proofImageDataUrl ? "uploaded" : "not uploaded"}`,
      `Provider status: ${order.providerStatus || "-"}`,
      `User note: ${order.userNote || "-"}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(summary);
      setMessage("Payment match text copied.");
    } catch {
      setMessage("Could not copy payment match text.");
    }
  }

  const orders = manualOrders ?? data?.orders ?? initialOrders;
  const reportedPendingCount = orders.filter(isReportedPendingOrder).length;
  const pendingCount = orders.filter((order) => order.status === "pending").length;
  const unreportedPendingCount = orders.filter(
    (order) => order.status === "pending" && !isReportedPendingOrder(order),
  ).length;
  const approvedCount = orders.filter((order) => order.status === "approved").length;
  const rejectedCount = orders.filter((order) => order.status === "rejected").length;
  const expiredCount = orders.filter((order) => order.status === "expired").length;
  const cancelledCount = orders.filter((order) => order.status === "cancelled").length;
  const paidCount = orders.filter((order) => order.paidAt).length;
  const filteredOrders = orders.filter((order) => {
    if (statusFilter === "reported" && !isReportedPendingOrder(order)) return false;
    if (statusFilter === "pending_unreported" && (order.status !== "pending" || isReportedPendingOrder(order))) {
      return false;
    }
    if (
      statusFilter !== "all" &&
      statusFilter !== "reported" &&
      statusFilter !== "pending_unreported" &&
      order.status !== statusFilter
    ) {
      return false;
    }
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [
      order.id,
      order.userEmail,
      order.planName,
      order.khqrMd5,
      order.paymentReference,
      order.providerTransactionId,
      order.providerReference,
      order.userNote,
      order.adminNote,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  if (loading && orders.length === 0) {
    return <AdminPanelSkeleton label="Loading payment orders" />;
  }

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-primary pb-5">
        <div>
          <h1 className="text-[38px] font-headline font-black uppercase tracking-tight text-primary leading-none">Admin Payments</h1>
          <p className="mt-2 text-sm font-body text-on-surface-variant">
            Review payment orders and credit tokens after matching the receipt.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-none border-2 border-primary bg-[#faf7f2] px-4 py-2 text-xs font-headline font-bold uppercase tracking-wider">
            {reportedPendingCount} need approval / {pendingCount} pending / {paidCount} paid
          </div>
          <button
            type="button"
            onClick={() => void refreshOrders()}
            className="rounded-none border-2 border-primary bg-primary bg-primary-fixed px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
          >
            {refreshing ? "Refreshing..." : `Live: ${formatRelativeSeconds(lastUpdatedAt)}`}
          </button>
        </div>
      </div>

      {error ? <InlineAdminError message={error} /> : null}

      <article className="rounded-none border-3 border-primary bg-surface p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        {!autoVerificationEnabled ? (
          <div className="mb-4 border-2 border-amber-800 bg-[#fffbeb] px-4 py-3 text-xs font-body leading-6 text-amber-950">
            <span className="font-headline font-bold uppercase text-amber-900 tracking-wider">Manual confirmation mode is active.</span> This page opens on orders where the user already uploaded a receipt or reported paid.
            Approve only after the receipt/payment notice matches the order ID, amount, and user.
          </div>
        ) : null}
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto]">
          <label className="grid gap-1 text-xs font-headline font-bold uppercase text-primary">
            Search orders
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Email, order ID, KHQR hash, transaction, or note"
              className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none font-body text-sm text-primary focus:bg-surface-container-low"
            />
          </label>
          <div className="grid content-end">
            <div className="flex flex-wrap gap-2 rounded-none border-2 border-primary bg-white p-1 text-sm">
              {[
                ["reported", `${reportedPendingCount} Need Approval`],
                ["pending", `${pendingCount} Pending`],
                ["pending_unreported", `${unreportedPendingCount} No Proof`],
                ["approved", `${approvedCount} Approved`],
                ["rejected", `${rejectedCount} Rejected`],
                ["expired", `${expiredCount} Expired`],
                ["cancelled", `${cancelledCount} Cancelled`],
                ["all", `${orders.length} All`],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value as PaymentStatusFilter)}
                  className={`rounded-none px-3 py-1.5 text-xs font-headline font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    statusFilter === value
                      ? "bg-primary-fixed text-primary border border-primary shadow-[1px_1px_0px_0px_#1a1a1a]"
                      : "text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <label className="grid gap-1 text-xs font-headline font-bold uppercase text-primary">
          Admin note for next approve/reject action
          <input
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
            placeholder="Payment reference, Telegram message, or reason"
            className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none font-body text-sm text-primary focus:bg-surface-container-low"
          />
        </label>
        {message ? (
          <p className="mt-4 rounded-none border border-primary bg-white px-4 py-3 text-xs font-body text-primary">
            {message}
          </p>
        ) : null}
      </article>

      <section className="min-w-0 rounded-none border-3 border-primary bg-surface p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-primary pb-3">
          <div>
            <h2 className="text-2xl font-headline font-black uppercase text-[#1c212d] leading-none">Payment Orders</h2>
            <p className="mt-2 text-xs font-body text-on-surface-variant">
              Showing {filteredOrders.length.toLocaleString()} of {orders.length.toLocaleString()} orders.
            </p>
          </div>
          <p className="rounded-none border border-primary bg-white px-3 py-1.5 text-xs font-headline font-bold uppercase tracking-wider text-on-surface-variant">
            Default view hides pending orders without receipt proof.
          </p>
        </div>
        <div className="mt-4 max-w-full overflow-x-auto rounded-none border-2 border-primary bg-white">
          <table className="w-full min-w-[1480px] text-sm">
            <thead className="bg-[#f2ede5] text-left text-primary font-headline font-bold uppercase border-b-2 border-primary">
              <tr>
                <th className="px-3 py-2 font-semibold">Created</th>
                <th className="px-3 py-2 font-semibold">Order</th>
                <th className="px-3 py-2 font-semibold">User</th>
                <th className="px-3 py-2 font-semibold">Plan</th>
                <th className="px-3 py-2 font-semibold">Qty</th>
                <th className="px-3 py-2 font-semibold">Total</th>
                <th className="px-3 py-2 font-semibold">Tokens</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">KHQR Hash</th>
                <th className="px-3 py-2 font-semibold">PayWay</th>
                <th className="px-3 py-2 font-semibold">Paid</th>
                <th className="px-3 py-2 font-semibold">Proof</th>
                <th className="px-3 py-2 font-semibold">Decision</th>
                <th className="px-3 py-2 font-semibold">Origin</th>
                <th className="px-3 py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-3 py-8 text-center text-[#6a7282] font-body">
                    No payment orders match this filter.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    id={order.id}
                    className={`border-t border-primary text-[#202533] hover:bg-surface-container-low/40 ${
                      isReportedPendingOrder(order) ? "bg-[#def3e5]/30" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-body">{formatDateTime(order.createdAt)}</td>
                    <td className="max-w-[130px] truncate px-3 py-2 font-mono text-xs">
                      {order.id}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2 font-body">{order.userEmail}</td>
                    <td className="px-3 py-2 font-body font-bold">{order.planName}</td>
                    <td className="px-3 py-2 font-body">{order.quantity}</td>
                    <td className="px-3 py-2 font-body font-bold">{formatUsd(order.totalPriceCents)}</td>
                    <td className="px-3 py-2 font-body font-bold">{order.tokens.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={order.status} />
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2 font-mono text-xs text-[#5e6678]">
                      {order.khqrMd5 || order.paymentReference || "-"}
                    </td>
                    <td className="max-w-[170px] px-3 py-2 text-[#5e6678]">
                      {order.paymentProvider ? (
                        <div className="grid gap-1 font-body">
                          <span className="font-bold text-[#202533]">{order.paymentProvider}</span>
                          <span className="truncate font-mono text-xs">
                            {order.providerTransactionId || order.providerReference || "-"}
                          </span>
                          <span className="text-xs">
                            {order.providerStatus || order.providerStatusCode || "-"}
                          </span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="max-w-[160px] px-3 py-2 text-[#5e6678]">
                      {order.paidAt ? (
                        <div className="grid gap-1 font-body">
                          <span className="font-bold text-[#202533]">
                            {formatProviderAmount(order)}
                          </span>
                          <span className="text-xs">{formatDateTime(order.paidAt)}</span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="max-w-[160px] px-3 py-2 text-[#5e6678]">
                      {order.proofImageDataUrl ? (
                        <a
                          href={order.proofImageDataUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-none border border-accent-strong bg-accent-soft px-3 py-1 text-xs font-headline font-bold uppercase tracking-wider text-accent-strong"
                        >
                          View proof
                        </a>
                      ) : order.providerStatus === "user_reported_paid" ? (
                        <span className="rounded-none border border-amber-600 bg-amber-50 px-3 py-1 text-xs font-headline font-bold uppercase tracking-wider text-amber-800">
                          Reported paid
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="max-w-[190px] px-3 py-2 text-[#5e6678]">
                      {order.approvedAt ? (
                        <div className="grid gap-1 font-body">
                          <span className="font-bold text-emerald-700">Approved</span>
                          <span className="text-xs">{formatDateTime(order.approvedAt)}</span>
                          <span className="truncate font-mono text-xs">
                            {order.approvedByUserId ?? "auto"}
                          </span>
                        </div>
                      ) : order.rejectedAt ? (
                        <div className="grid gap-1 font-body">
                          <span className="font-bold text-red-700">Rejected</span>
                          <span className="text-xs">{formatDateTime(order.rejectedAt)}</span>
                          <span className="truncate font-mono text-xs">
                            {order.rejectedByUserId ?? "-"}
                          </span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="max-w-[190px] px-3 py-2 font-body text-[#5e6678]">
                      <OriginNote order={order} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void copyOrderSummary(order)}
                          className="rounded-none border-2 border-primary bg-white px-3 py-1 text-xs font-headline font-bold uppercase text-primary shadow-[1px_1px_0px_0px_#1a1a1a] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
                        >
                          Copy Match
                        </button>
                        {order.status === "pending" ? (
                          <>
                          <button
                            type="button"
                            disabled={loadingOrder !== ""}
                            onClick={() => setPendingDecision({ order, action: "approve" })}
                            className="rounded-none border-2 border-primary bg-primary-fixed text-primary px-3 py-1 text-xs font-headline font-bold uppercase tracking-wider shadow-[1px_1px_0px_0px_#1a1a1a] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-60 cursor-pointer"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={loadingOrder !== ""}
                            onClick={() => setPendingDecision({ order, action: "reject" })}
                            className="rounded-none border-2 border-red-700 bg-red-50 text-red-700 px-3 py-1 text-xs font-headline font-bold uppercase tracking-wider shadow-[1px_1px_0px_0px_rgba(185,28,28,0.2)] transition-all hover:bg-red-100 disabled:opacity-60 cursor-pointer"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            disabled={loadingOrder !== "" || !autoVerificationEnabled}
                            onClick={() => recheck(order.id)}
                            className="rounded-none border-2 border-primary bg-white px-3 py-1 text-xs font-headline font-bold uppercase text-primary disabled:opacity-60"
                          >
                            {autoVerificationEnabled ? "Recheck" : "Manual only"}
                          </button>
                          </>
                        ) : order.status === "expired" ? (
                          <span className="self-center text-xs font-headline font-bold uppercase text-[#6a7282]">Expired</span>
                        ) : (
                          <span className="self-center text-xs font-headline font-bold uppercase text-[#6a7282]">Decided</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      {pendingDecision ? (
        <DecisionModal
          decision={pendingDecision}
          adminNote={adminNote}
          loading={loadingOrder !== ""}
          onCancel={() => setPendingDecision(null)}
          onConfirm={() => decide(pendingDecision.order.id, pendingDecision.action)}
        />
      ) : null}
    </section>
  );
}

function formatProviderAmount(order: PaymentOrderWithUser): string {
  if (order.providerAmount === null || !order.providerCurrency) return "-";
  return order.providerCurrency === "USD"
    ? `$${order.providerAmount.toFixed(2)}`
    : `${Math.round(order.providerAmount).toLocaleString()} KHR`;
}

function formatKhqrAmount(order: PaymentOrderWithUser): string {
  if (order.khqrAmount === null || !order.khqrCurrency) return formatUsd(order.totalPriceCents);
  return order.khqrCurrency === "USD"
    ? `$${order.khqrAmount.toFixed(2)}`
    : `${Math.round(order.khqrAmount).toLocaleString()} KHR`;
}

function isReportedPendingOrder(order: PaymentOrderWithUser): boolean {
  return order.status === "pending" && Boolean(order.proofImageDataUrl || order.providerStatus === "user_reported_paid");
}

function OriginNote({ order }: { order: PaymentOrderWithUser }) {
  const report = getOriginReport(order);
  if (!report) return <span>-</span>;

  return (
    <span
      title={report.fullText}
      className={`inline-flex max-w-full items-center rounded-none border px-2 py-1 text-[11px] font-headline font-bold uppercase tracking-wider ${report.className}`}
    >
      <span className="truncate">{report.label}</span>
    </span>
  );
}

function getOriginReport(order: PaymentOrderWithUser): { label: string; fullText: string; className: string } | null {
  const adminNote = order.adminNote?.trim() ?? "";
  const userNote = order.userNote?.trim() ?? "";
  const fullText = userNote || adminNote || order.providerStatus || order.paymentProvider || "";
  const lowerAdmin = adminNote.toLowerCase();

  if (lowerAdmin.includes("cancelled by customer")) {
    return {
      label: "Customer cancelled",
      fullText: adminNote,
      className: "border-zinc-500 bg-zinc-100 text-zinc-700",
    };
  }

  if (lowerAdmin.includes("expired before payment")) {
    return {
      label: "QR expired",
      fullText: adminNote,
      className: "border-amber-700 bg-amber-50 text-amber-900",
    };
  }

  if (lowerAdmin.includes("auto approved by khqrcc")) {
    return {
      label: "KHQRcc verified",
      fullText: adminNote,
      className: "border-emerald-800 bg-[#def3e5] text-emerald-900",
    };
  }

  if (lowerAdmin.includes("auto approved by bakong")) {
    return {
      label: "Bakong verified",
      fullText: adminNote,
      className: "border-emerald-800 bg-[#def3e5] text-emerald-900",
    };
  }

  if (order.status === "rejected") {
    return {
      label: "Admin rejected",
      fullText: adminNote || "Rejected by admin.",
      className: "border-red-800 bg-red-50 text-red-800",
    };
  }

  if (order.providerStatus === "user_reported_paid") {
    return {
      label: "User reported paid",
      fullText: fullText || "User marked this payment as paid.",
      className: "border-amber-700 bg-amber-50 text-amber-900",
    };
  }

  if (order.proofImageDataUrl) {
    return {
      label: "Receipt uploaded",
      fullText: fullText || "User uploaded a payment receipt.",
      className: "border-amber-700 bg-amber-50 text-amber-900",
    };
  }

  if (order.paymentProvider === "khqrcc") {
    return {
      label: "KHQRcc checkout",
      fullText: fullText || "Order created from KHQRcc checkout.",
      className: "border-primary/40 bg-white text-primary",
    };
  }

  if (userNote) {
    return {
      label: trimOriginLabel(userNote),
      fullText: userNote,
      className: "border-primary/40 bg-white text-primary",
    };
  }

  if (adminNote) {
    return {
      label: trimOriginLabel(adminNote),
      fullText: adminNote,
      className: "border-primary/40 bg-white text-primary",
    };
  }

  return null;
}

function trimOriginLabel(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= 28) return clean;
  return `${clean.slice(0, 25)}...`;
}

function DecisionModal({
  decision,
  adminNote,
  loading,
  onCancel,
  onConfirm,
}: {
  decision: PendingDecision;
  adminNote: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isApprove = decision.action === "approve";
  const order = decision.order;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
        <section className="w-full max-w-xl rounded-none border-3 border-primary bg-[#faf7f2] p-6 shadow-[8px_8px_0px_0px_rgba(26,26,26,1)]">
          <p
            className={`w-fit rounded-none border-2 border-primary px-3 py-1 text-xs font-headline font-bold uppercase ${
              isApprove ? "bg-[#def3e5] text-emerald-800" : "bg-[#fee2e2] text-red-800"
            }`}
          >
            {isApprove ? "Confirm approval" : "Confirm rejection"}
          </p>
          <h2 className="mt-4 text-2xl font-headline font-black uppercase tracking-tight text-primary">
            {isApprove ? "Credit this user now?" : "Reject this payment order?"}
          </h2>
          <p className="mt-2 text-sm font-body leading-6 text-primary/80">
            {isApprove
              ? "Approve only when the ABA/PayWay or Telegram notice matches this order."
              : "Reject only when the payment is wrong, duplicated, expired, or cannot be matched."}
          </p>

          <div className="mt-4 grid gap-2 rounded-none border-2 border-primary bg-[#f2ede5] p-4 text-sm font-body">
            <MatchRow label="Order" value={order.id} mono />
            <MatchRow label="User" value={order.userEmail} />
            <MatchRow label="Plan" value={`${order.planName} x ${order.quantity}`} />
            <MatchRow label="Total" value={formatUsd(order.totalPriceCents)} />
            <MatchRow label="KHQR amount" value={formatKhqrAmount(order)} />
            <MatchRow label="Tokens" value={order.tokens.toLocaleString()} />
            <MatchRow label="KHQR hash" value={order.khqrMd5 ?? "-"} mono />
            <MatchRow label="Admin note" value={adminNote.trim() || "-"} />
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="rounded-none border-2 border-primary bg-white px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-60 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`rounded-none border-2 border-primary px-4 py-2 text-sm font-headline font-bold uppercase shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-60 cursor-pointer ${
                isApprove ? "bg-[#ffcc00] text-primary" : "bg-red-500 text-white"
              }`}
            >
              {loading ? "Working..." : isApprove ? "Approve and credit tokens" : "Reject order"}
            </button>
          </div>
        </section>
      </div>
    </Portal>
  );
}

function MatchRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <p className="flex justify-between gap-4">
      <span className="text-[#6a7282]">{label}</span>
      <span className={`max-w-[340px] truncate text-right font-semibold ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </p>
  );
}

function formatDateTime(input: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatRelativeSeconds(input: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - input) / 1000));
  return seconds <= 2 ? "now" : `${seconds}s ago`;
}

function StatusPill({ status }: { status: PaymentOrderWithUser["status"] }) {
  const styles: Record<PaymentOrderWithUser["status"], string> = {
    pending: "bg-amber-100 text-amber-900 border-amber-900",
    approved: "bg-[#def3e5] text-emerald-900 border-emerald-900",
    rejected: "bg-red-100 text-red-900 border-red-900",
    expired: "bg-zinc-100 text-zinc-750 border-zinc-500",
    cancelled: "bg-zinc-100 text-zinc-750 border-zinc-500",
  };
  return (
    <span className={`rounded-none border-2 px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider ${styles[status]}`}>
      {status}
    </span>
  );
}
