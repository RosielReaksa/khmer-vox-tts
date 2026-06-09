"use client";

import Link from "next/link";

import { useAdminCachedJson } from "@/app/app/admin/admin-data-cache";
import {
  AdminPanelSkeleton,
  EmptyState,
  formatDate,
  formatUsd,
  InlineAdminError,
  MetricCard,
} from "@/app/app/admin/admin-shared";
import { RevenueChart, TokenSoldChart } from "@/app/app/admin/admin-charts";
import type {
  GenerationWithUser,
  PaymentOrderWithUser,
  PaymentSupportTicketWithOrder,
  PaymentWebhookEventWithOrder,
  TelegramPaymentEventWithOrder,
} from "@/lib/store";
import type { AdminCustomerSummary } from "@/lib/types";
import type { SystemStatus } from "@/lib/system-status";

type AdminOverviewData = {
  customers: AdminCustomerSummary[];
  orders: PaymentOrderWithUser[];
  supportTickets: PaymentSupportTicketWithOrder[];
  webhookEvents: PaymentWebhookEventWithOrder[];
  telegramEvents: TelegramPaymentEventWithOrder[];
  recentGenerations: GenerationWithUser[];
  failedGenerations: GenerationWithUser[];
  systemStatus: SystemStatus;
  generatedAt: string;
};

export function AdminOverviewClient() {
  const { data, error, loading, refreshing, refresh } = useAdminCachedJson<AdminOverviewData>(
    "admin:overview",
    "/api/admin/overview",
    { pollMs: 30_000, staleMs: 30_000 },
  );

  if (loading && !data) return <AdminPanelSkeleton label="Loading admin overview" />;

  const customers = data?.customers ?? [];
  const orders = data?.orders ?? [];
  const supportTickets = data?.supportTickets ?? [];
  const webhookEvents = data?.webhookEvents ?? [];
  const telegramEvents = data?.telegramEvents ?? [];
  const recentGenerations = data?.recentGenerations ?? [];
  const failedGenerations = data?.failedGenerations ?? [];
  const launchIssues =
    data?.systemStatus.launchChecklist
      .flatMap((group) => group.items)
      .filter((item) => item.required && item.status !== "ok") ?? [];

  const approvedOrders = orders.filter((order) => order.status === "approved");
  const pendingOrders = orders.filter((order) => order.status === "pending");
  const blockedWebhookEvents = webhookEvents.filter((event) => event.eventStatus !== "credited");
  const totalRevenueCents = approvedOrders.reduce((sum, order) => sum + order.totalPriceCents, 0);
  const pendingRevenueCents = pendingOrders.reduce((sum, order) => sum + order.totalPriceCents, 0);
  const tokensSold = approvedOrders.reduce((sum, order) => sum + order.tokens, 0);
  const tokenLiability = customers.reduce((sum, customer) => sum + customer.tokenBalance, 0);
  const apiRequests = customers.reduce((sum, customer) => sum + customer.apiRequests, 0);
  const suspended = customers.filter((customer) => customer.user.suspendedAt).length;

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-primary pb-5">
        <div>
          <p className="text-xs font-headline font-black uppercase tracking-[0.12em] text-on-surface-variant">
            Admin Command Center
          </p>
          <h1 className="mt-1 text-[38px] font-headline font-black uppercase tracking-tight text-primary leading-none">
            Business Overview
          </h1>
          <p className="mt-2 text-sm font-body text-on-surface-variant">
            Revenue, customer risk, generation activity, and launch readiness in one cached panel.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-none border-2 border-primary bg-primary-fixed px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
        >
          {refreshing ? "Refreshing..." : `Cached ${data ? formatDate(data.generatedAt) : ""}`}
        </button>
      </div>

      {error ? <InlineAdminError message={error} /> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Approved Revenue" value={formatUsd(totalRevenueCents)} note={`${approvedOrders.length} paid orders`} />
        <MetricCard label="Pending Revenue" value={formatUsd(pendingRevenueCents)} note={`${pendingOrders.length} waiting for payment`} />
        <MetricCard label="Tokens Sold" value={tokensSold.toLocaleString()} note="Credited from approved orders" />
        <MetricCard label="Token Liability" value={tokenLiability.toLocaleString()} note="Customer balances remaining" />
        <MetricCard label="Customers" value={customers.length.toLocaleString()} note={`${suspended} suspended`} />
        <MetricCard label="API Requests" value={apiRequests.toLocaleString()} note="All customer API generations" />
        <MetricCard label="Failed Generations" value={failedGenerations.length.toLocaleString()} note="Latest failed attempts shown" />
        <MetricCard label="Support Tickets" value={supportTickets.length.toLocaleString()} note="Open payment issues" />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <RevenueChart orders={orders} />
        <TokenSoldChart orders={orders} />
      </section>

      {launchIssues.length > 0 ? (
        <section className="rounded-none border-3 border-amber-800 bg-[#fffbeb] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-headline font-black uppercase text-amber-950">Launch blockers need attention</h2>
              <p className="mt-1 text-sm font-body text-amber-900">Fix these before opening the API to public users.</p>
            </div>
            <Link
              href="/app/admin/system"
              className="rounded-none border-2 border-primary bg-amber-200 px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] transition-all"
            >
              Open System Checks
            </Link>
          </div>
          <div className="mt-4 grid gap-2">
            {launchIssues.slice(0, 5).map((issue) => (
              <p key={issue.id} className="rounded-none border border-amber-600 bg-white px-4 py-3 text-sm font-body text-amber-950">
                <span className="font-bold uppercase tracking-wider text-amber-900">{issue.label}:</span> {issue.detail}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel title="Payment Queue" note="Pending and recent payment orders" href="/app/admin/payments" hrefLabel="Manage Payments">
          <PaymentList orders={[...pendingOrders, ...orders.filter((order) => order.status !== "pending")].slice(0, 8)} />
        </Panel>
        <Panel title="Payment Support" note="Open user payment help requests" href="/app/admin/payment-support" hrefLabel="Open Support">
          <SupportList tickets={supportTickets.slice(0, 8)} />
        </Panel>
        <Panel title="Generation Activity" note="Recent dashboard and API generations" href="/app/admin/usage" hrefLabel="Open Usage">
          <GenerationList generations={recentGenerations} />
        </Panel>
        <Panel title="Webhook Watch" note="Latest PayWay callback results" href="/app/admin/payment-webhooks" hrefLabel="Open Webhooks">
          <WebhookList events={webhookEvents} />
        </Panel>
        <Panel title="Telegram Monitor" note="PayWay group messages and parser decisions" href="/app/admin/payment-telegram" hrefLabel="Open Telegram">
          <TelegramList events={telegramEvents} />
        </Panel>
        <Panel title="Failure Queue" note="Failed generations and blocked callbacks" href="/app/admin/usage?status=failed" hrefLabel="View Failures">
          <GenerationList generations={failedGenerations} />
          {blockedWebhookEvents.length > 0 ? (
            <p className="mt-3 rounded-none border-2 border-error bg-error-container px-4 py-3 text-sm font-headline font-bold uppercase tracking-wide text-error">
              {blockedWebhookEvents.length} recent webhook callbacks did not credit tokens.
            </p>
          ) : null}
        </Panel>
      </section>
    </section>
  );
}

function Panel({
  title,
  note,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  note: string;
  href: string;
  hrefLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-none border-3 border-primary bg-surface p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-primary pb-3">
        <div>
          <h2 className="text-2xl font-headline font-black uppercase text-primary leading-none">{title}</h2>
          <p className="mt-2 text-xs font-body text-on-surface-variant">{note}</p>
        </div>
        <Link
          href={href}
          className="rounded-none border-2 border-primary bg-white px-3 py-1.5 text-xs font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] transition-all"
        >
          {hrefLabel}
        </Link>
      </div>
      <div className="mt-4 flex flex-col gap-2 min-w-0 w-full overflow-hidden">{children}</div>
    </section>
  );
}

function PaymentList({ orders }: { orders: PaymentOrderWithUser[] }) {
  if (orders.length === 0) return <EmptyState label="No payment orders yet." />;
  return orders.map((order) => (
    <Link
      key={order.id}
      href={`/app/admin/payments#${order.id}`}
      className="block min-w-0 rounded-none border border-primary bg-white px-4 py-3 text-sm hover:bg-surface-container-high transition-all shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)]"
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <p className="font-headline font-bold text-primary truncate min-w-0 flex-1">{order.userEmail}</p>
        <span className="shrink-0 border border-primary bg-surface px-2 py-0.5 text-[10px] font-headline font-bold uppercase tracking-wider text-primary">
          {order.status}
        </span>
      </div>
      <p className="mt-1 text-xs font-body text-on-surface-variant">
        {order.planName} x {order.quantity} - {formatUsd(order.totalPriceCents)} - {order.tokens.toLocaleString()} tokens
      </p>
    </Link>
  ));
}

function SupportList({ tickets }: { tickets: PaymentSupportTicketWithOrder[] }) {
  if (tickets.length === 0) return <EmptyState label="No open payment support tickets." />;
  return tickets.map((ticket) => (
    <Link
      key={ticket.id}
      href={`/app/admin/payment-support#${ticket.id}`}
      className="block min-w-0 rounded-none border border-primary bg-white px-4 py-3 text-sm hover:bg-surface-container-high transition-all shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)]"
    >
      <p className="font-headline font-bold text-primary truncate">{ticket.userEmail}</p>
      <p className="mt-1 truncate text-xs font-body text-on-surface-variant">
        {ticket.planName ?? "Payment"} x {ticket.quantity ?? "-"} - {ticket.userMessage}
      </p>
    </Link>
  ));
}

function GenerationList({ generations }: { generations: GenerationWithUser[] }) {
  if (generations.length === 0) return <EmptyState label="No generation activity yet." />;
  return generations.map((generation) => (
    <Link
      key={generation.id}
      href={`/app/admin/usage?q=${encodeURIComponent(generation.userEmail)}`}
      className="block min-w-0 rounded-none border border-primary bg-white px-4 py-3 text-sm hover:bg-surface-container-high transition-all shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)]"
    >
      <p className="font-headline font-bold text-primary truncate">{generation.userEmail}</p>
      <p className="mt-1 truncate text-xs font-body text-on-surface-variant">
        {generation.mode} / {generation.source} / {generation.status} - {generation.inputPreview || generation.errorMessage || "-"}
      </p>
    </Link>
  ));
}

function WebhookList({ events }: { events: PaymentWebhookEventWithOrder[] }) {
  if (events.length === 0) return <EmptyState label="No webhook events yet." />;
  return events.map((event) => (
    <Link
      key={event.id}
      href="/app/admin/payment-webhooks"
      className="block min-w-0 rounded-none border border-primary bg-white px-4 py-3 text-sm hover:bg-surface-container-high transition-all shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)]"
    >
      <p className="font-headline font-bold text-primary truncate">{event.userEmail ?? "unknown user"}</p>
      <p className="mt-1 truncate text-xs font-body text-on-surface-variant">{event.eventStatus} - {event.reason ?? "callback"}</p>
    </Link>
  ));
}

function TelegramList({ events }: { events: TelegramPaymentEventWithOrder[] }) {
  if (events.length === 0) return <EmptyState label="No Telegram payment events yet." />;
  return events.map((event) => (
    <Link
      key={event.id}
      href="/app/admin/payment-telegram"
      className="block min-w-0 rounded-none border border-primary bg-white px-4 py-3 text-sm hover:bg-surface-container-high transition-all shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)]"
    >
      <p className="font-headline font-bold text-primary truncate">{event.userEmail ?? event.senderName ?? "unknown sender"}</p>
      <p className="mt-1 truncate text-xs font-body text-on-surface-variant">{event.decisionStatus} - {event.decisionReason ?? "parsed"}</p>
    </Link>
  ));
}

