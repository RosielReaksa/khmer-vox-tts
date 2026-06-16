import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";
import { listApiErrorsPageForAdmin } from "@/lib/store";
import type { ApiErrorWithUser } from "@/lib/store";
import type { GenerationSource } from "@/lib/types";
import { AdminAccessRequired, MetricCard } from "../admin-shared";

type AdminErrorsPageProps = {
  searchParams?: Promise<{
    source?: string;
    statusGroup?: string;
    q?: string;
    from?: string;
    to?: string;
    page?: string;
    size?: string;
  }>;
};

const sourceOptions: Array<GenerationSource | "all"> = ["all", "dashboard", "api_key"];
const statusGroupOptions: Array<"all" | "4xx" | "5xx"> = ["all", "4xx", "5xx"];
const pageSizeOptions = [50, 100, 200, 500];

// Admin error log: every API/system error, including ones that never create a
// generation row (auth 401/402/403, rate-limit 429, validation 400, server 500).
// Paginated with a UTC date range so an admin can audit exactly what failed,
// for whom, and why.
export default async function AdminErrorsPage({ searchParams }: AdminErrorsPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }
  if (!isAdminEmail(user.email)) {
    return <AdminAccessRequired />;
  }

  const params = await searchParams;
  const source = sourceOptions.includes(params?.source as GenerationSource | "all")
    ? (params?.source as GenerationSource | "all")
    : "all";
  const statusGroup = statusGroupOptions.includes(params?.statusGroup as "all" | "4xx" | "5xx")
    ? (params?.statusGroup as "all" | "4xx" | "5xx")
    : "all";
  const q = params?.q?.trim() ?? "";
  const from = params?.from?.trim() ?? "";
  const to = params?.to?.trim() ?? "";

  const size = pageSizeOptions.includes(Number(params?.size)) ? Number(params?.size) : 100;
  const requestedPage = Number.parseInt(params?.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * size;

  const fromDate = from ? `${from}T00:00:00Z` : null;
  const toDate = to ? toExclusiveUtcDayEnd(to) : null;

  const { rows, total } = await listApiErrorsPageForAdmin({
    limit: size,
    offset,
    source,
    statusGroup,
    q,
    fromDate,
    toDate,
  });

  const totalPages = Math.max(1, Math.ceil(total / size));
  const serverErrors = rows.filter((r) => r.statusCode >= 500).length;
  const clientErrors = rows.filter((r) => r.statusCode >= 400 && r.statusCode < 500).length;
  const apiErrors = rows.filter((r) => r.source === "api_key").length;
  const shownFrom = total === 0 ? 0 : offset + 1;
  const shownTo = Math.min(offset + rows.length, total);

  const baseQuery = { source, statusGroup, q, from, to, size };
  const buildHref = (overrides: Record<string, string | number>) => {
    const merged: Record<string, string | number> = { ...baseQuery, ...overrides };
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value === "" || value === "all" || value === undefined || value === null) continue;
      search.set(key, String(value));
    }
    const qs = search.toString();
    return qs ? `/app/admin/errors?${qs}` : "/app/admin/errors";
  };

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[34px] font-headline font-black uppercase text-primary">API Error Log</h1>
          <p className="mt-1 text-sm font-body text-primary/70">
            Every error across the website &mdash; auth failures, rate limits, validation errors, and server crashes.
            Includes failures that never created a generation. Filter and page through the full history.
          </p>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total Matches" value={total.toLocaleString()} note="All filtered errors" />
        <MetricCard label="On This Page" value={rows.length.toLocaleString()} note={`${shownFrom}-${shownTo} of ${total.toLocaleString()}`} />
        <MetricCard label="Server (5xx)" value={serverErrors.toLocaleString()} note="This page" />
        <MetricCard label="Client (4xx)" value={clientErrors.toLocaleString()} note="This page" />
        <MetricCard label="From API" value={apiErrors.toLocaleString()} note="This page" />
      </section>

      <section className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[150px_150px_150px_150px_1fr_auto] font-headline font-bold uppercase text-sm text-primary">
          <SelectField label="Source" name="source" value={source} options={sourceOptions} />
          <SelectField label="Status" name="statusGroup" value={statusGroup} options={statusGroupOptions} />
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
              placeholder="Email, endpoint, message, code"
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
              href="/app/admin/errors"
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
            <h2 className="text-2xl font-headline font-black uppercase text-primary">Error Records</h2>
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
          <ErrorsTable rows={rows} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-body text-primary/70">
          <span>
            Showing {shownFrom.toLocaleString()}&ndash;{shownTo.toLocaleString()} of {total.toLocaleString()} errors.
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

function ErrorsTable({ rows }: { rows: ApiErrorWithUser[] }) {
  return (
    <table className="w-full min-w-[1240px] text-sm text-primary">
      <thead className="bg-[#f2ede5] text-left text-primary border-b-2 border-primary font-headline">
        <tr>
          <th className="px-3 py-2 font-bold uppercase">Time</th>
          <th className="px-3 py-2 font-bold uppercase">User</th>
          <th className="px-3 py-2 font-bold uppercase">Source</th>
          <th className="px-3 py-2 font-bold uppercase">Method</th>
          <th className="px-3 py-2 font-bold uppercase">Endpoint</th>
          <th className="px-3 py-2 font-bold uppercase">Status</th>
          <th className="px-3 py-2 font-bold uppercase">Code</th>
          <th className="px-3 py-2 font-bold uppercase">Message</th>
          <th className="px-3 py-2 font-bold uppercase">IP</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={9} className="px-3 py-8 text-center text-primary/60 font-body">
              No errors found for these filters.
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id} className="border-t border-primary/20 hover:bg-[#fafbfe] text-primary align-top">
              <td className="px-3 py-2 font-body whitespace-nowrap">{formatDate(row.createdAt)}</td>
              <td className="max-w-[200px] px-3 py-2 font-body">
                {row.userId ? (
                  <Link
                    href={`/app/admin/customers/${row.userId}`}
                    className="truncate font-bold text-emerald-800 hover:underline"
                  >
                    {row.userEmail ?? row.userId}
                  </Link>
                ) : (
                  <span className="text-primary/50">anonymous</span>
                )}
              </td>
              <td className="px-3 py-2">
                <span className={`rounded-none border-2 px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider ${sourceClass(row.source)}`}>
                  {row.source === "api_key" ? "API" : "Dashboard"}
                </span>
              </td>
              <td className="px-3 py-2 font-body uppercase">{row.method}</td>
              <td className="max-w-[240px] px-3 py-2 font-body truncate">{row.endpoint}</td>
              <td className="px-3 py-2">
                <span className={`rounded-none border-2 px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider ${statusClass(row.statusCode)}`}>
                  {row.statusCode}
                </span>
              </td>
              <td className="max-w-[160px] px-3 py-2 font-body truncate">{row.errorCode || "-"}</td>
              <td className="max-w-[360px] px-3 py-2 font-body">
                <p className="truncate">{row.errorMessage}</p>
                {row.inputPreview ? (
                  <p className="mt-1 truncate text-xs text-primary/50">{row.inputPreview}</p>
                ) : null}
              </td>
              <td className="max-w-[140px] px-3 py-2 font-body truncate">{row.ipAddress || "-"}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
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
  options: Array<string | number>;
}) {
  return (
    <label className="grid gap-1">
      {label}
      <select
        name={name}
        defaultValue={String(value)}
        className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none focus:bg-surface-container-low font-body text-primary"
      >
        {options.map((option) => (
          <option key={option} value={String(option)}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function sourceClass(source: GenerationSource): string {
  if (source === "api_key") return "bg-[#e7ecff] text-indigo-900 border-indigo-900";
  return "bg-[#fff3d6] text-amber-900 border-amber-900";
}

function statusClass(statusCode: number): string {
  if (statusCode >= 500) return "bg-red-100 text-red-900 border-red-900";
  if (statusCode === 429) return "bg-orange-100 text-orange-900 border-orange-900";
  return "bg-amber-100 text-amber-900 border-amber-900";
}

function toExclusiveUtcDayEnd(dateStr: string): string {
  const parsed = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return `${dateStr}T00:00:00Z`;
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString();
}

function formatDate(input: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
