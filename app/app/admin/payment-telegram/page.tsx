import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";
import { listTelegramPaymentEventsForAdmin } from "@/lib/store";
import type { TelegramPaymentEventDecision, TelegramPaymentEventRecord } from "@/lib/types";
import { AdminAccessRequired, MetricCard } from "../admin-shared";

type AdminTelegramPaymentsPageProps = {
  searchParams?: Promise<{
    status?: string;
    orderId?: string;
    q?: string;
    dateRange?: string;
  }>;
};

const statusOptions: Array<TelegramPaymentEventDecision | "all"> = [
  "all",
  "ready_to_approve",
  "auto_approved",
  "manual_approved",
  "needs_review",
  "ignored",
  "duplicate",
  "error",
];

export default async function AdminTelegramPaymentsPage({
  searchParams,
}: AdminTelegramPaymentsPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }
  if (!isAdminEmail(user.email)) {
    return <AdminAccessRequired />;
  }

  const params = await searchParams;
  const status = statusOptions.includes(params?.status as TelegramPaymentEventDecision | "all")
    ? (params?.status as TelegramPaymentEventDecision | "all")
    : "all";
  const orderId = params?.orderId?.trim() || "";
  const q = params?.q?.trim()?.toLowerCase() || "";
  const dateRange = params?.dateRange || "all";

  const allEvents = await listTelegramPaymentEventsForAdmin({
    status,
    orderId: orderId || null,
    limit: 500,
  });

  let events = allEvents;
  if (q) {
    events = events.filter((e) => {
      return (
        (e.userEmail?.toLowerCase() || "").includes(q) ||
        (e.matchedOrderId?.toLowerCase() || "").includes(q) ||
        (e.senderName?.toLowerCase() || "").includes(q) ||
        (e.senderUsername?.toLowerCase() || "").includes(q) ||
        (e.parsedTransactionId?.toLowerCase() || "").includes(q) ||
        (e.parsedReference?.toLowerCase() || "").includes(q) ||
        (e.decisionReason?.toLowerCase() || "").includes(q) ||
        (e.rawText?.toLowerCase() || "").includes(q) ||
        (e.rawPayload?.toLowerCase() || "").includes(q)
      );
    });
  }

  if (dateRange !== "all") {
    const now = new Date();
    events = events.filter((e) => {
      const created = new Date(e.createdAt);
      if (isNaN(created.getTime())) return true;
      const diffMs = now.getTime() - created.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (dateRange === "today") return diffDays <= 1;
      if (dateRange === "yesterday") return diffDays > 1 && diffDays <= 2;
      if (dateRange === "week") return diffDays <= 7;
      if (dateRange === "month") return diffDays <= 30;
      return true;
    });
  }

  // Calculate metrics on the filtered dataset
  const readyCount = events.filter((event) => event.decisionStatus === "ready_to_approve").length;
  const reviewCount = events.filter((event) => event.decisionStatus === "needs_review").length;
  const approvedCount = events.filter(
    (event) => event.decisionStatus === "auto_approved" || event.decisionStatus === "manual_approved",
  ).length;
  const errorCount = events.filter((event) => event.decisionStatus === "error").length;

  // Keep a maximum of 150 display items
  const displayEvents = events.slice(0, 150);

  const returnParams = new URLSearchParams();
  if (status !== "all") returnParams.set("status", status);
  if (orderId) returnParams.set("orderId", orderId);
  if (q) returnParams.set("q", q);
  if (dateRange !== "all") returnParams.set("dateRange", dateRange);
  const returnTo = `/app/admin/payment-telegram${returnParams.size ? `?${returnParams.toString()}` : ""}`;

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[34px] font-headline font-black uppercase text-primary">
            Telegram Payment Monitor
          </h1>
          <p className="mt-1 text-sm font-body text-primary/70">
            Review PayWay group messages, parsed payment data, order matching, and approval decisions.
          </p>
        </div>
      </div>

      <section className="rounded-none border-2 border-primary bg-amber-50 p-5 text-sm font-body text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
        <p className="font-semibold">Auto approval is controlled by TELEGRAM_PAYMENT_AUTO_APPROVE.</p>
        <p className="mt-1">
          Keep it false while testing real PayWay messages. Ready events prove the parser can match an
          order, but tokens will not be credited until auto approval is enabled or an admin approves manually.
        </p>
      </section>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Events Shown" value={displayEvents.length.toLocaleString()} note="Latest 150 max" />
        <MetricCard label="Ready" value={readyCount.toLocaleString()} note="Matched, not auto credited" />
        <MetricCard label="Needs Review" value={reviewCount.toLocaleString()} note="Admin check required" />
        <MetricCard label="Auto Approved" value={approvedCount.toLocaleString()} note={`${errorCount} errors`} />
      </div>

      <section className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_180px_180px_1fr_auto] font-headline font-bold uppercase text-sm text-primary">
          <label className="grid gap-1">
            Status
            <select
              name="status"
              defaultValue={status}
              className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none focus:bg-surface-container-low font-body text-primary"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            Date Range
            <select
              name="dateRange"
              defaultValue={dateRange}
              className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none focus:bg-surface-container-low font-body text-primary"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
            </select>
          </label>
          <label className="grid gap-1">
            Order ID
            <input
              name="orderId"
              defaultValue={orderId}
              placeholder="Order ID"
              className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none focus:bg-surface-container-low font-body text-primary uppercase"
            />
          </label>
          <label className="grid gap-1">
            Search
            <input
              name="q"
              defaultValue={q}
              placeholder="Search sender, tx ID, reference, text..."
              className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none focus:bg-surface-container-low font-body text-primary"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-none border-2 border-primary bg-[#ffcc00] px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer"
            >
              Filter
            </button>
            <Link
              href="/app/admin/payment-telegram"
              className="rounded-none border-2 border-primary bg-white px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
            >
              Clear
            </Link>
          </div>
        </form>
      </section>

      <section className="min-w-0 rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-headline font-black uppercase text-primary">Message Decisions</h2>
            <p className="mt-1 text-sm font-body text-primary/70">
              Use this log to tune the parser before enabling automatic credit.
            </p>
          </div>
        </div>

        <div className="mt-4 max-w-full overflow-x-auto rounded-none border-2 border-primary bg-white">
          <table className="w-full min-w-[1460px] text-sm text-primary">
            <thead className="bg-[#f2ede5] text-left text-primary border-b-2 border-primary font-headline">
              <tr>
                <th className="px-3 py-2 font-bold uppercase">Time</th>
                <th className="px-3 py-2 font-bold uppercase">Decision</th>
                <th className="px-3 py-2 font-bold uppercase">Reason</th>
                <th className="px-3 py-2 font-bold uppercase">Sender</th>
                <th className="px-3 py-2 font-bold uppercase">Payment</th>
                <th className="px-3 py-2 font-bold uppercase">Order</th>
                <th className="px-3 py-2 font-bold uppercase">Transaction</th>
                <th className="px-3 py-2 font-bold uppercase">Message</th>
                <th className="px-3 py-2 font-bold uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayEvents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-primary/60 font-body">
                    No Telegram payment events found.
                  </td>
                </tr>
              ) : (
                displayEvents.map((event) => (
                  <tr key={event.id} className="border-t border-primary/20 hover:bg-[#fafbfe] text-primary">
                    <td className="px-3 py-2 font-body">{formatDateTime(event.createdAt)}</td>
                    <td className="px-3 py-2">
                      <DecisionPill status={event.decisionStatus} />
                    </td>
                    <td className="max-w-[210px] px-3 py-2 font-mono text-xs text-primary/80">
                      {event.decisionReason || "-"}
                    </td>
                    <td className="max-w-[210px] px-3 py-2 font-body">
                      <p className="truncate font-semibold">{event.senderName || event.senderUsername || "-"}</p>
                      <p className="mt-1 truncate text-xs text-primary/60">
                        {event.senderUsername ? `@${event.senderUsername}` : event.senderIsBot ? "bot" : "user"}
                      </p>
                    </td>
                    <td className="px-3 py-2 font-body">
                      <p className="font-bold">{formatParsedAmount(event)}</p>
                      <p className="mt-1 text-xs text-primary/60">{event.parsedStatus || "unknown"}</p>
                    </td>
                    <td className="max-w-[220px] px-3 py-2 font-body">
                      {event.matchedOrderId ? (
                        <Link
                          href={`/app/admin/payments#${event.matchedOrderId}`}
                          className="block truncate font-mono text-xs text-emerald-800 font-bold hover:underline"
                        >
                          {event.matchedOrderId}
                        </Link>
                      ) : (
                        "-"
                      )}
                      <p className="mt-1 truncate text-xs text-primary/60">
                        {event.userEmail || "-"} {event.orderStatus ? `- ${event.orderStatus}` : ""}
                      </p>
                    </td>
                    <td className="max-w-[240px] px-3 py-2 font-mono text-xs">
                      <p className="truncate font-semibold">{event.parsedTransactionId || "-"}</p>
                      <p className="mt-1 truncate text-xs text-primary/60">
                        {event.parsedReference || "-"}
                      </p>
                    </td>
                    <td className="max-w-[330px] px-3 py-2">
                      <details className="group">
                        <summary className="cursor-pointer text-emerald-800 font-headline font-bold uppercase text-xs">View Text</summary>
                        <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-none border border-primary bg-[#f2ede5] p-3 font-mono text-xs text-primary">
                          {event.rawText || event.rawPayload}
                        </pre>
                      </details>
                    </td>
                    <td className="px-3 py-2">
                      <TelegramEventActions event={event} returnTo={returnTo} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function TelegramEventActions({
  event,
  returnTo,
}: {
  event: TelegramPaymentEventRecord & { orderStatus: string | null };
  returnTo: string;
}) {
  const canApprove =
    Boolean(event.matchedOrderId) &&
    event.parsedAmount !== null &&
    Boolean(event.parsedCurrency) &&
    event.orderStatus === "pending" &&
    event.decisionStatus !== "auto_approved" &&
    event.decisionStatus !== "manual_approved" &&
    event.decisionStatus !== "ignored";
  const canIgnore =
    event.decisionStatus !== "auto_approved" &&
    event.decisionStatus !== "manual_approved" &&
    event.decisionStatus !== "ignored";

  if (!canApprove && !canIgnore) {
    return <span className="text-xs font-headline font-bold uppercase text-primary/50">No action</span>;
  }

  return (
    <div className="grid min-w-[150px] gap-2">
      {canApprove ? (
        <form action={`/api/admin/payment-telegram/${event.id}/approve`} method="post">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="adminNote" value="Approved from Telegram monitor." />
          <button
            type="submit"
            className="w-full rounded-none border-2 border-primary bg-[#def3e5] px-3 py-1.5 text-xs font-headline font-bold uppercase text-emerald-900 shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer"
          >
            Approve
          </button>
        </form>
      ) : null}
      {canIgnore ? (
        <form action={`/api/admin/payment-telegram/${event.id}/ignore`} method="post">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="adminNote" value="Ignored from Telegram monitor." />
          <button
            type="submit"
            className="w-full rounded-none border-2 border-primary bg-white px-3 py-1.5 text-xs font-headline font-bold uppercase text-primary shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer"
          >
            Ignore
          </button>
        </form>
      ) : null}
    </div>
  );
}

function DecisionPill({ status }: { status: TelegramPaymentEventDecision }) {
  const classes =
    status === "auto_approved" || status === "manual_approved"
      ? "bg-[#def3e5] text-emerald-900 border-emerald-900"
      : status === "ready_to_approve"
        ? "bg-blue-100 text-blue-900 border-blue-900"
        : status === "needs_review"
          ? "bg-amber-100 text-amber-900 border-amber-900"
          : status === "error"
            ? "bg-red-100 text-red-900 border-red-900"
            : "bg-[#eef2f7] text-zinc-700 border-zinc-550";

  return (
    <span className={`rounded-none border-2 px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider ${classes}`}>
      {status}
    </span>
  );
}

function formatParsedAmount(event: TelegramPaymentEventRecord): string {
  if (event.parsedAmount === null || !event.parsedCurrency) return "-";
  if (event.parsedCurrency === "USD") return `$${event.parsedAmount.toFixed(2)}`;
  return `${Math.round(event.parsedAmount).toLocaleString()} KHR`;
}

function formatDateTime(input: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(input)) + " UTC";
}
