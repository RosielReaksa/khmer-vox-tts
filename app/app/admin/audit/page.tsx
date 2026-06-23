import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";
import { listAdminAuditLogsForAdmin } from "@/lib/store";
import type { AdminAuditLogRecord } from "@/lib/types";
import { AdminAccessRequired, MetricCard } from "../admin-shared";

const ACTION_OPTIONS = [
  "all",
  "adjust_tokens",
  "suspend_customer",
  "unsuspend_customer",
  "revoke_keys",
  "grant_business_access",
  "update_key_limits",
  "approve_payment",
  "reject_payment",
  "recheck_payment",
  "approve_telegram_payment",
  "ignore_telegram_payment",
  "resolve_support_ticket",
  "toggle_admin_status",
  "save_modal_config",
  "job_purge_queue",
  "job_process_next",
  "job_process_job",
  "job_reset_modal_pool",
  "job_cleanup_audio",
  "job_recover_stuck",
  "job_retry_webhook",
  "job_retry_jobs",
  "job_retry_job",
] as const;

const PAGE_SIZES = [50, 100, 200] as const;

type AuditPageProps = {
  searchParams?: Promise<{
    action?: string;
    q?: string;
    from?: string;
    to?: string;
    page?: string;
    size?: string;
  }>;
};

export default async function AdminAuditLogPage({ searchParams }: AuditPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }
  if (!isAdminEmail(user.email)) {
    return <AdminAccessRequired />;
  }

  const params = await searchParams;
  const action = ACTION_OPTIONS.includes(params?.action as (typeof ACTION_OPTIONS)[number])
    ? (params?.action as string)
    : "all";
  const q = params?.q?.trim() ?? "";
  const from = params?.from?.trim() ?? "";
  const to = params?.to?.trim() ?? "";
  const size = (PAGE_SIZES as readonly number[]).includes(Number(params?.size))
    ? Number(params?.size)
    : 100;
  const requestedPage = Number.parseInt(params?.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * size;

  const fromDate = from ? `${from}T00:00:00Z` : null;
  const toDate = to ? `${to}T23:59:59Z` : null;

  const adminUserId = q.includes("@") ? undefined : q || undefined;
  const actionFilter = action !== "all" ? action : undefined;

  const { rows, total } = await listAdminAuditLogsForAdmin({
    limit: size,
    offset,
    action: actionFilter,
    adminUserId,
    fromDate,
    toDate,
  });

  const totalPages = Math.max(1, Math.ceil(total / size));
  const shownFrom = total === 0 ? 0 : offset + 1;
  const shownTo = Math.min(offset + rows.length, total);

  const baseQuery: Record<string, string> = { action, q, from, to, size: String(size) };
  const buildHref = (overrides: Record<string, string | number>) => {
    const merged = { ...baseQuery, ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])) };
    for (const key of Object.keys(merged)) {
      if (merged[key] === "" || merged[key] === "all" || merged[key] === undefined) {
        delete merged[key];
      }
    }
    const qs = new URLSearchParams(merged).toString();
    return qs ? `/app/admin/audit?${qs}` : "/app/admin/audit";
  };

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[34px] font-headline font-black uppercase text-primary">Admin Audit Log</h1>
          <p className="mt-1 text-sm font-body text-primary/70">
            Every admin action is recorded here — token adjustments, suspensions, payment approvals, and system operations.
          </p>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Logged" value={total.toLocaleString()} note="All matching entries" />
        <MetricCard label="On This Page" value={rows.length.toLocaleString()} note={`${shownFrom}-${shownTo} of ${total.toLocaleString()}`} />
      </section>

      <section className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[200px_200px_200px_1fr_auto] font-headline font-bold uppercase text-sm text-primary">
          <SelectField label="Action" name="action" value={action} options={ACTION_OPTIONS as unknown as string[]} />
          <label className="grid gap-1">
            From (UTC)
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none focus:bg-surface-container-low font-body text-primary"
            />
          </label>
          <label className="grid gap-1">
            To (UTC)
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none focus:bg-surface-container-low font-body text-primary"
            />
          </label>
          <label className="grid gap-1">
            Search
            <input
              name="q"
              defaultValue={q}
              placeholder="Admin user ID..."
              className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none focus:bg-surface-container-low font-body text-primary"
            />
          </label>
          <div className="flex items-end gap-2">
            <input type="hidden" name="page" value="1" />
            <input type="hidden" name="size" value={size} />
            <button
              type="submit"
              className="rounded-none border-2 border-primary bg-[#ffcc00] px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer"
            >
              Filter
            </button>
            <Link
              href="/app/admin/audit"
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
            <h2 className="text-2xl font-headline font-black uppercase text-primary">Audit Records</h2>
            <p className="mt-1 text-sm font-body text-primary/70">
              Page {page.toLocaleString()} of {totalPages.toLocaleString()} &mdash; newest first.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PagerLink href={buildHref({ page: page - 1 })} disabled={page <= 1} label="Prev" />
            <PagerLink href={buildHref({ page: page + 1 })} disabled={page >= totalPages} label="Next" />
          </div>
        </div>
        <div className="mt-4 max-w-full overflow-x-auto rounded-none border-2 border-primary bg-white">
          <AuditTable rows={rows} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-body text-primary/70">
          <span>
            Showing {shownFrom.toLocaleString()}&ndash;{shownTo.toLocaleString()} of {total.toLocaleString()} records.
          </span>
          <div className="flex items-center gap-2">
            <PagerLink href={buildHref({ page: 1 })} disabled={page <= 1} label="First" />
            <PagerLink href={buildHref({ page: page - 1 })} disabled={page <= 1} label="Prev" />
            <PagerLink href={buildHref({ page: page + 1 })} disabled={page >= totalPages} label="Next" />
            <PagerLink href={buildHref({ page: totalPages })} disabled={page >= totalPages} label="Last" />
          </div>
        </div>
      </section>
    </section>
  );
}

function AuditTable({ rows }: { rows: AdminAuditLogRecord[] }) {
  return (
    <table className="w-full min-w-[1100px] text-sm text-primary">
      <thead className="bg-[#f2ede5] text-left text-primary border-b-2 border-primary font-headline">
        <tr>
          <th className="px-3 py-2 font-bold uppercase">Time</th>
          <th className="px-3 py-2 font-bold uppercase">Admin</th>
          <th className="px-3 py-2 font-bold uppercase">Action</th>
          <th className="px-3 py-2 font-bold uppercase">Target</th>
          <th className="px-3 py-2 font-bold uppercase">Detail</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={5} className="px-3 py-8 text-center text-primary/60 font-body">
              No audit records found for these filters.
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id} className="border-t border-primary/20 hover:bg-[#fafbfe] text-primary">
              <td className="px-3 py-2 font-body whitespace-nowrap">{formatDate(row.createdAt)}</td>
              <td className="max-w-[200px] px-3 py-2 font-body">
                <span className="truncate block" title={row.adminEmail}>
                  {row.adminEmail}
                </span>
              </td>
              <td className="px-3 py-2">
                <ActionPill action={row.action} />
              </td>
              <td className="max-w-[180px] px-3 py-2 font-body">
                <div className="truncate">
                  <span className="text-xs text-primary/60">{row.targetType}:</span>{" "}
                  <span className="font-mono text-xs">{shortId(row.targetId)}</span>
                </div>
              </td>
              <td className="max-w-[360px] px-3 py-2 font-body">
                <p className="truncate" title={row.detail}>
                  {row.detail}
                </p>
                {row.metadata ? (
                  <details className="group mt-1">
                    <summary className="cursor-pointer text-xs font-headline font-bold uppercase text-emerald-800">
                      Meta
                    </summary>
                    <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-none border border-primary bg-[#f2ede5] p-2 font-mono text-[10px] text-primary">
                      {formatMetadata(row.metadata)}
                    </pre>
                  </details>
                ) : null}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function ActionPill({ action }: { action: string }) {
  const colors: Record<string, string> = {
    adjust_tokens: "bg-blue-100 text-blue-900 border-blue-900",
    suspend_customer: "bg-red-100 text-red-900 border-red-900",
    unsuspend_customer: "bg-green-100 text-green-900 border-green-900",
    revoke_keys: "bg-orange-100 text-orange-900 border-orange-900",
    approve_payment: "bg-emerald-100 text-emerald-900 border-emerald-900",
    reject_payment: "bg-red-100 text-red-900 border-red-900",
    recheck_payment: "bg-amber-100 text-amber-900 border-amber-900",
    grant_business_access: "bg-purple-100 text-purple-900 border-purple-900",
  };
  const base = "rounded-none border-2 px-2 py-0.5 text-[10px] font-headline font-bold uppercase tracking-wider";
  const colorClass = colors[action] ?? "bg-zinc-100 text-zinc-900 border-zinc-900";
  return <span className={`${base} ${colorClass}`}>{action.replace(/_/g, " ")}</span>;
}

function PagerLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return (
      <span className="rounded-none border-2 border-primary/30 bg-white/60 px-3 py-1.5 text-xs font-headline font-bold uppercase text-primary/40">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-none border-2 border-primary bg-white px-3 py-1.5 text-xs font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
    >
      {label}
    </Link>
  );
}

function SelectField({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string;
  options: string[];
}) {
  return (
    <label className="grid gap-1">
      {label}
      <select
        name={name}
        defaultValue={value}
        className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none focus:bg-surface-container-low font-body text-primary"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option === "all" ? "All" : option.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatDate(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

function formatMetadata(metadata: string | null): string {
  if (!metadata) return "";
  try {
    return JSON.stringify(JSON.parse(metadata), null, 2);
  } catch {
    return metadata;
  }
}
