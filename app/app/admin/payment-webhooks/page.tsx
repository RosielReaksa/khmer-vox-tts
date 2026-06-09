import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";
import { listPaymentWebhookEventsForAdmin } from "@/lib/store";
import type {
  PaymentWebhookEventStatus,
  PaymentWebhookEventRecord,
} from "@/lib/types";
import { AdminAccessRequired, MetricCard } from "../admin-shared";

type PaymentWebhooksPageProps = {
  searchParams?: Promise<{
    status?: string;
    orderId?: string;
    q?: string;
    dateRange?: string;
  }>;
};

const statusOptions: Array<PaymentWebhookEventStatus | "all"> = [
  "all",
  "credited",
  "not_credited",
  "invalid",
  "error",
];

export default async function AdminPaymentWebhooksPage({ searchParams }: PaymentWebhooksPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }
  if (!isAdminEmail(user.email)) {
    return <AdminAccessRequired />;
  }

  const params = await searchParams;
  const status = statusOptions.includes(params?.status as PaymentWebhookEventStatus | "all")
    ? (params?.status as PaymentWebhookEventStatus | "all")
    : "all";
  const orderId = params?.orderId?.trim() || "";
  const q = params?.q?.trim()?.toLowerCase() || "";
  const dateRange = params?.dateRange || "all";

  const allEvents = await listPaymentWebhookEventsForAdmin({
    status,
    orderId: orderId || null,
    limit: 500,
  });

  let events = allEvents;
  if (q) {
    events = events.filter((e) => {
      return (
        (e.userEmail?.toLowerCase() || "").includes(q) ||
        (e.orderId?.toLowerCase() || "").includes(q) ||
        (e.paymentOrderId?.toLowerCase() || "").includes(q) ||
        (e.providerTransactionId?.toLowerCase() || "").includes(q) ||
        (e.providerReference?.toLowerCase() || "").includes(q) ||
        (e.reason?.toLowerCase() || "").includes(q)
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

  events = events.slice(0, 150);

  const creditedCount = events.filter((event) => event.eventStatus === "credited").length;
  const blockedCount = events.filter((event) => event.eventStatus !== "credited").length;

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[34px] font-headline font-black uppercase text-primary">Webhook Events</h1>
          <p className="mt-1 text-sm font-body text-primary/70">
            Audit every PayWay callback, signature result, amount check, and token credit decision.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Events Shown" value={events.length.toLocaleString()} note="Latest 150 max" />
        <MetricCard label="Credited" value={creditedCount.toLocaleString()} note="Tokens added" />
        <MetricCard label="Blocked" value={blockedCount.toLocaleString()} note="No token credit" />
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
              placeholder="Search email, transaction, reference, reason..."
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
              href="/app/admin/payment-webhooks"
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
            <h2 className="text-2xl font-headline font-black uppercase text-primary">PayWay Callback Log</h2>
            <p className="mt-1 text-sm font-body text-primary/70">
              Use this when a customer says they paid but did not receive credits.
            </p>
          </div>
        </div>

        <div className="mt-4 max-w-full overflow-x-auto rounded-none border-2 border-primary bg-white">
          <table className="w-full min-w-[1180px] text-sm text-primary">
            <thead className="bg-[#f2ede5] text-left text-primary border-b-2 border-primary font-headline">
              <tr>
                <th className="px-3 py-2 font-bold uppercase">Time</th>
                <th className="px-3 py-2 font-bold uppercase">Result</th>
                <th className="px-3 py-2 font-bold uppercase">Reason</th>
                <th className="px-3 py-2 font-bold uppercase">Order</th>
                <th className="px-3 py-2 font-bold uppercase">User</th>
                <th className="px-3 py-2 font-bold uppercase">Payment</th>
                <th className="px-3 py-2 font-bold uppercase">Provider Status</th>
                <th className="px-3 py-2 font-bold uppercase">Signature</th>
                <th className="px-3 py-2 font-bold uppercase">Payload</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-primary/60 font-body">
                    No webhook events found.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id} className="border-t border-primary/20 hover:bg-[#fafbfe] text-primary">
                    <td className="px-3 py-2 font-body">{formatDateTime(event.createdAt)}</td>
                    <td className="px-3 py-2">
                      <EventStatusPill status={event.eventStatus} />
                    </td>
                    <td className="max-w-[190px] px-3 py-2">
                      <span className="font-mono text-xs text-primary/80">{event.reason || "-"}</span>
                    </td>
                    <td className="max-w-[180px] px-3 py-2 font-body">
                      {event.orderId ? (
                        <Link
                          href={`/app/admin/payments#${event.orderId}`}
                          className="block truncate font-mono text-xs text-emerald-800 font-bold hover:underline"
                        >
                          {event.orderId}
                        </Link>
                      ) : (
                        "-"
                      )}
                      {event.orderStatus ? (
                        <p className="mt-1 text-xs text-primary/60">{event.orderStatus}</p>
                      ) : null}
                    </td>
                    <td className="max-w-[210px] truncate px-3 py-2 font-body">{event.userEmail || "-"}</td>
                    <td className="px-3 py-2 font-body">
                      <p className="font-bold">{formatProviderAmount(event)}</p>
                      <p className="mt-1 max-w-[170px] truncate font-mono text-xs text-primary/60">
                        {event.providerTransactionId || event.providerReference || "-"}
                      </p>
                    </td>
                    <td className="max-w-[170px] px-3 py-2 font-body">
                      <p className="truncate">{event.providerStatus || "-"}</p>
                      <p className="mt-1 font-mono text-xs text-primary/60">
                        {event.providerStatusCode || "-"}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <SignaturePill event={event} />
                    </td>
                    <td className="max-w-[260px] px-3 py-2">
                      <details className="group">
                        <summary className="cursor-pointer text-emerald-800 font-headline font-bold uppercase text-xs">View Payload</summary>
                        <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-none border border-primary bg-[#f2ede5] p-3 font-mono text-xs text-primary">
                          {event.providerPayload || event.rawBody || "-"}
                        </pre>
                      </details>
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

function formatDateTime(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatProviderAmount(event: PaymentWebhookEventRecord): string {
  if (event.providerAmount === null || !event.providerCurrency) return "-";
  return event.providerCurrency === "USD"
    ? `$${event.providerAmount.toFixed(2)}`
    : `${Math.round(event.providerAmount).toLocaleString()} KHR`;
}

function EventStatusPill({ status }: { status: PaymentWebhookEventStatus }) {
  const styles: Record<PaymentWebhookEventStatus, string> = {
    credited: "bg-[#def3e5] text-emerald-900 border-emerald-900",
    not_credited: "bg-amber-100 text-amber-900 border-amber-900",
    invalid: "bg-red-100 text-red-900 border-red-900",
    error: "bg-zinc-100 text-zinc-750 border-zinc-550",
  };
  return (
    <span className={`rounded-none border-2 px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider ${styles[status]}`}>
      {status}
    </span>
  );
}

function SignaturePill({ event }: { event: PaymentWebhookEventRecord }) {
  if (!event.signatureConfigured) {
    return (
      <span className="rounded-none border-2 border-amber-900 bg-amber-100 px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider text-amber-900">
        not configured
      </span>
    );
  }
  return event.signatureValid ? (
    <span className="rounded-none border-2 border-emerald-900 bg-[#def3e5] px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider text-emerald-900">
      valid
    </span>
  ) : (
    <span className="rounded-none border-2 border-red-900 bg-red-100 px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider text-red-900">
      invalid
    </span>
  );
}
