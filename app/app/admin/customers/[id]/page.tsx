import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ApiKeyBusinessControls, CustomerActions } from "@/app/app/admin/customers/customer-actions";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";
import { getCustomerForAdmin } from "@/lib/store";
import type {
  ApiKeyRecord,
  GenerationRecord,
  PaymentOrderRecord,
  PaymentWebhookEventRecord,
  TokenTransactionRecord,
} from "@/lib/types";
import { AdminAccessRequired, MetricCard } from "../../admin-shared";

type CustomerDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminCustomerDetailPage({ params }: CustomerDetailPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }
  if (!isAdminEmail(user.email)) {
    return <AdminAccessRequired />;
  }

  const { id } = await params;
  const customer = await getCustomerForAdmin(id);
  if (!customer) {
    notFound();
  }

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-primary pb-5">
        <div>
          <h1 className="text-[38px] font-headline font-black uppercase tracking-tight text-primary leading-none">
            {customer.user.email}
          </h1>
          <p className="mt-2 font-mono text-xs text-[#6a7282]">{customer.user.id}</p>
        </div>
      </div>

      {customer.user.suspendedAt ? (
        <section className="rounded-none border-3 border-red-700 bg-red-50 p-5 text-red-800 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
          <p className="text-xs font-headline font-bold uppercase tracking-[0.12em] text-red-700">Suspended</p>
          <h2 className="mt-2 text-2xl font-headline font-black uppercase text-red-900 leading-none">Customer access is blocked</h2>
          <p className="mt-2 text-sm font-body text-red-800">
            Since {formatDate(customer.user.suspendedAt)}
            {customer.user.suspendedReason ? `: ${customer.user.suspendedReason}` : "."}
          </p>
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-5">
        <MetricCard label="Balance" value={customer.tokenBalance.toLocaleString()} note="Available tokens" />
        <MetricCard label="Credits Bought" value={customer.totalCreditsEarned.toLocaleString()} note="Positive credits earned" />
        <MetricCard label="Generations" value={customer.totalGenerations.toLocaleString()} note="Dashboard and API" />
        <MetricCard label="API Requests" value={customer.apiRequests.toLocaleString()} note="Calls from API keys" />
        <MetricCard label="Active Keys" value={customer.activeApiKeys.toLocaleString()} note="Usable public API keys" />
      </section>

      <CustomerActions
        customerId={customer.user.id}
        customerEmail={customer.user.email}
        isSuspended={Boolean(customer.user.suspendedAt)}
      />

      <section className="grid gap-5">
        <DataPanel title="Token Transactions" note="Latest 150 token changes">
          <TokenTable transactions={customer.tokenTransactions} />
        </DataPanel>
        <DataPanel title="API Keys and Business Limits" note="Per-key token caps, request concurrency, running jobs, queued jobs, and revoke state">
          <ApiKeyTable customerId={customer.user.id} apiKeys={customer.apiKeys} />
        </DataPanel>
        <DataPanel title="Payment Orders" note="All customer checkout orders">
          <PaymentTable orders={customer.paymentOrdersList} />
        </DataPanel>
        <DataPanel title="Recent Generations" note="Latest 100 generation attempts">
          <GenerationTable generations={customer.generations} />
        </DataPanel>
        <DataPanel title="Webhook Events" note="PayWay callbacks attached to this customer">
          <WebhookTable events={customer.webhookEvents} />
        </DataPanel>
      </section>
    </section>
  );
}

function DataPanel({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-none border-3 border-primary bg-surface p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <div className="border-b-2 border-primary pb-3">
        <h2 className="text-2xl font-headline font-black uppercase text-primary leading-none">{title}</h2>
        <p className="mt-2 text-xs font-body text-[#6a7282]">{note}</p>
      </div>
      <div className="mt-4 max-w-full overflow-x-auto rounded-none border-2 border-primary bg-white">{children}</div>
    </section>
  );
}


function TokenTable({ transactions }: { transactions: TokenTransactionRecord[] }) {
  return (
    <table className="w-full min-w-[820px] text-sm">
      <thead className="bg-[#f2ede5] text-left text-primary font-headline font-bold uppercase border-b-2 border-primary">
        <tr>
          <th className="px-3 py-2 font-semibold">Time</th>
          <th className="px-3 py-2 font-semibold">Amount</th>
          <th className="px-3 py-2 font-semibold">Type</th>
          <th className="px-3 py-2 font-semibold">Note</th>
        </tr>
      </thead>
      <tbody>
        {transactions.length === 0 ? (
          <EmptyRow colSpan={4} label="No token transactions." />
        ) : (
          transactions.map((transaction) => (
            <tr key={transaction.id} className="border-t border-primary text-[#202533] hover:bg-surface-container-low/40">
              <td className="px-3 py-2 font-body">{formatDate(transaction.createdAt)}</td>
              <td className={`px-3 py-2 font-body font-bold ${transaction.amount >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {transaction.amount > 0 ? "+" : ""}
                {transaction.amount.toLocaleString()}
              </td>
              <td className="px-3 py-2 font-body">{transaction.type}</td>
              <td className="max-w-[420px] px-3 py-2 font-body">{transaction.note ?? "-"}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function ApiKeyTable({ customerId, apiKeys }: { customerId: string; apiKeys: ApiKeyRecord[] }) {
  return (
    <table className="w-full min-w-[1320px] text-sm">
      <thead className="bg-[#f2ede5] text-left text-primary font-headline font-bold uppercase border-b-2 border-primary">
        <tr>
          <th className="px-3 py-2 font-semibold">Name</th>
          <th className="px-3 py-2 font-semibold">Prefix</th>
          <th className="px-3 py-2 font-semibold">Token Limits</th>
          <th className="px-3 py-2 font-semibold">Business Caps</th>
          <th className="px-3 py-2 font-semibold">Created</th>
          <th className="px-3 py-2 font-semibold">Last Used</th>
          <th className="px-3 py-2 font-semibold">Status</th>
          <th className="px-3 py-2 font-semibold">Admin Controls</th>
        </tr>
      </thead>
      <tbody>
        {apiKeys.length === 0 ? (
          <EmptyRow colSpan={8} label="No API keys." />
        ) : (
          apiKeys.map((key) => (
            <tr key={key.id} className="border-t border-primary text-[#202533] hover:bg-surface-container-low/40">
              <td className="px-3 py-2 font-headline font-bold text-primary">{key.name}</td>
              <td className="px-3 py-2 font-mono text-xs text-on-surface-variant">{key.keyPrefix}</td>
              <td className="px-3 py-2 text-xs font-body">
                Daily {formatTokenLimit(key.dailyTokenLimit)}
                <br />
                Monthly {formatTokenLimit(key.monthlyTokenLimit)}
              </td>
              <td className="px-3 py-2 text-xs font-body">
                Requests {formatBusinessLimit(key.maxConcurrentRequests)}
                <br />
                Running jobs {formatBusinessLimit(key.maxConcurrentJobs)}
                <br />
                Queued jobs {formatBusinessLimit(key.maxQueuedJobs)}
              </td>
              <td className="px-3 py-2 font-body">{formatDate(key.createdAt)}</td>
              <td className="px-3 py-2 font-body">{formatDate(key.lastUsedAt)}</td>
              <td className="px-3 py-2">
                {key.revokedAt ? (
                  <span className="rounded-none border border-zinc-400 bg-zinc-100 px-2 py-0.5 text-[10px] font-headline font-bold uppercase tracking-wider text-zinc-700">
                    revoked
                  </span>
                ) : (
                  <span className="rounded-none border border-accent-strong bg-accent-soft px-2 py-0.5 text-[10px] font-headline font-bold uppercase tracking-wider text-accent-strong">
                    active
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                <ApiKeyBusinessControls
                  customerId={customerId}
                  keyId={key.id}
                  revoked={Boolean(key.revokedAt)}
                  initialDailyTokenLimit={key.dailyTokenLimit}
                  initialMonthlyTokenLimit={key.monthlyTokenLimit}
                  initialMaxConcurrentRequests={key.maxConcurrentRequests}
                  initialMaxConcurrentJobs={key.maxConcurrentJobs}
                  initialMaxQueuedJobs={key.maxQueuedJobs}
                />
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function PaymentTable({ orders }: { orders: PaymentOrderRecord[] }) {
  return (
    <table className="w-full min-w-[980px] text-sm">
      <thead className="bg-[#f2ede5] text-left text-primary font-headline font-bold uppercase border-b-2 border-primary">
        <tr>
          <th className="px-3 py-2 font-semibold">Created</th>
          <th className="px-3 py-2 font-semibold">Order</th>
          <th className="px-3 py-2 font-semibold">Plan</th>
          <th className="px-3 py-2 font-semibold">Total</th>
          <th className="px-3 py-2 font-semibold">Tokens</th>
          <th className="px-3 py-2 font-semibold">Status</th>
          <th className="px-3 py-2 font-semibold">Paid</th>
          <th className="px-3 py-2 font-semibold">KHQR</th>
        </tr>
      </thead>
      <tbody>
        {orders.length === 0 ? (
          <EmptyRow colSpan={8} label="No payment orders." />
        ) : (
          orders.map((order) => (
            <tr key={order.id} className="border-t border-primary text-[#202533] hover:bg-surface-container-low/40">
              <td className="px-3 py-2 font-body">{formatDate(order.createdAt)}</td>
              <td className="max-w-[180px] px-3 py-2 font-mono text-xs">
                <Link href={`/app/admin/payments#${order.id}`} className="text-[#116d3c] hover:underline">
                  {order.id}
                </Link>
              </td>
              <td className="px-3 py-2 font-body">{order.planName} x {order.quantity}</td>
              <td className="px-3 py-2 font-body font-bold">{formatUsd(order.totalPriceCents)}</td>
              <td className="px-3 py-2 font-body font-bold">{order.tokens.toLocaleString()}</td>
              <td className="px-3 py-2 font-headline font-bold text-xs uppercase">{order.status}</td>
              <td className="px-3 py-2 font-body">{formatDate(order.paidAt)}</td>
              <td className="max-w-[160px] truncate px-3 py-2 font-mono text-xs text-on-surface-variant">{order.khqrMd5 ?? "-"}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function GenerationTable({ generations }: { generations: GenerationRecord[] }) {
  return (
    <table className="w-full min-w-[1080px] text-sm">
      <thead className="bg-[#f2ede5] text-left text-primary font-headline font-bold uppercase border-b-2 border-primary">
        <tr>
          <th className="px-3 py-2 font-semibold">Time</th>
          <th className="px-3 py-2 font-semibold">Mode</th>
          <th className="px-3 py-2 font-semibold">Source</th>
          <th className="px-3 py-2 font-semibold">Status</th>
          <th className="px-3 py-2 font-semibold">Chars</th>
          <th className="px-3 py-2 font-semibold">Charged</th>
          <th className="px-3 py-2 font-semibold">Latency</th>
          <th className="px-3 py-2 font-semibold">Preview</th>
        </tr>
      </thead>
      <tbody>
        {generations.length === 0 ? (
          <EmptyRow colSpan={8} label="No generations." />
        ) : (
          generations.map((generation) => (
            <tr key={generation.id} className="border-t border-primary text-[#202533] hover:bg-surface-container-low/40">
              <td className="px-3 py-2 font-body">{formatDate(generation.createdAt)}</td>
              <td className="px-3 py-2 font-headline font-bold text-xs uppercase">{generation.mode}</td>
              <td className="px-3 py-2 font-headline font-bold text-xs uppercase">{generation.source}</td>
              <td className="px-3 py-2 font-headline font-bold text-xs uppercase">{generation.status}</td>
              <td className="px-3 py-2 font-body">{generation.inputChars.toLocaleString()}</td>
              <td className="px-3 py-2 font-body font-bold">{generation.creditsCharged.toLocaleString()}</td>
              <td className="px-3 py-2 font-body">{generation.latencyMs.toLocaleString()} ms</td>
              <td className="max-w-[360px] px-3 py-2 font-body">
                <p className="truncate">{generation.inputPreview || generation.errorMessage || "-"}</p>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function WebhookTable({ events }: { events: PaymentWebhookEventRecord[] }) {
  return (
    <table className="w-full min-w-[900px] text-sm">
      <thead className="bg-[#f2ede5] text-left text-primary font-headline font-bold uppercase border-b-2 border-primary">
        <tr>
          <th className="px-3 py-2 font-semibold">Time</th>
          <th className="px-3 py-2 font-semibold">Result</th>
          <th className="px-3 py-2 font-semibold">Reason</th>
          <th className="px-3 py-2 font-semibold">Order</th>
          <th className="px-3 py-2 font-semibold">Amount</th>
          <th className="px-3 py-2 font-semibold">Provider Ref</th>
        </tr>
      </thead>
      <tbody>
        {events.length === 0 ? (
          <EmptyRow colSpan={6} label="No webhook events." />
        ) : (
          events.map((event) => (
            <tr key={event.id} className="border-t border-primary text-[#202533] hover:bg-surface-container-low/40">
              <td className="px-3 py-2 font-body">{formatDate(event.createdAt)}</td>
              <td className="px-3 py-2 font-headline font-bold text-xs uppercase">{event.eventStatus}</td>
              <td className="px-3 py-2 font-mono text-xs">{event.reason ?? "-"}</td>
              <td className="max-w-[180px] truncate px-3 py-2 font-mono text-xs">
                {event.paymentOrderId ?? event.orderId ?? "-"}
              </td>
              <td className="px-3 py-2 font-body">{formatProviderAmount(event)}</td>
              <td className="max-w-[180px] truncate px-3 py-2 font-mono text-xs text-on-surface-variant">
                {event.providerTransactionId ?? event.providerReference ?? "-"}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-[#6a7282] font-body">
        {label}
      </td>
    </tr>
  );
}

function formatDate(input: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTokenLimit(value: number | null): string {
  return value === null ? "unlimited" : value.toLocaleString();
}

function formatBusinessLimit(value: number | null): string {
  return value === null ? "default" : value.toLocaleString();
}

function formatProviderAmount(event: PaymentWebhookEventRecord): string {
  if (event.providerAmount === null || !event.providerCurrency) return "-";
  return event.providerCurrency === "USD"
    ? `$${event.providerAmount.toFixed(2)}`
    : `${Math.round(event.providerAmount).toLocaleString()} KHR`;
}

