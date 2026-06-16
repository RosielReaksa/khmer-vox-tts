import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";
import { listGenerationsPageForAdmin } from "@/lib/store";
import type { GenerationWithUser } from "@/lib/store";
import type { GenerationMode, GenerationSource, GenerationStatus } from "@/lib/types";
import { AdminAccessRequired, MetricCard } from "../admin-shared";

type AdminActivityPageProps = {
  searchParams?: Promise<{
    mode?: string;
    source?: string;
    status?: string;
    q?: string;
    from?: string;
    to?: string;
    page?: string;
    size?: string;
  }>;
};

const modeOptions: Array<GenerationMode | "all"> = ["all", "tts", "clone"];
const sourceOptions: Array<GenerationSource | "all"> = ["all", "dashboard", "api_key"];
const statusOptions: Array<GenerationStatus | "all"> = ["all", "processing", "success", "failed"];
const pageSizeOptions = [50, 100, 200, 500];

// The activity log is a system-wide, deep-history view of every audio generation
// (dashboard + API + batch segments). Unlike the Usage page (latest-200 snapshot),
// this paginates through the full history and supports a UTC date range so an
// admin can audit exactly what a user or API key did at any point in time.
export default async function AdminActivityPage({ searchParams }: AdminActivityPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }
  if (!isAdminEmail(user.email)) {
    return <AdminAccessRequired />;
  }

  const params = await searchParams;
  const mode = modeOptions.includes(params?.mode as GenerationMode | "all")
    ? (params?.mode as GenerationMode | "all")
    : "all";
  const source = sourceOptions.includes(params?.source as GenerationSource | "all")
    ? (params?.source as GenerationSource | "all")
    : "all";
  const status = statusOptions.includes(params?.status as GenerationStatus | "all")
    ? (params?.status as GenerationStatus | "all")
    : "all";
  const q = params?.q?.trim() ?? "";
  const from = params?.from?.trim() ?? "";
  const to = params?.to?.trim() ?? "";

  const size = pageSizeOptions.includes(Number(params?.size)) ? Number(params?.size) : 100;
  const requestedPage = Number.parseInt(params?.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * size;

  // Date inputs are <input type="date"> (YYYY-MM-DD, UTC). "to" is made exclusive
  // by advancing one day so the chosen end date is included in full.
  const fromDate = from ? `${from}T00:00:00Z` : null;
  const toDate = to ? toExclusiveUtcDayEnd(to) : null;

  const { rows, total } = await listGenerationsPageForAdmin({
    limit: size,
    offset,
    mode,
    source,
    status,
    q,
    fromDate,
    toDate,
  });

  const totalPages = Math.max(1, Math.ceil(total / size));
  const successCount = rows.filter((r) => r.status === "success").length;
  const failedCount = rows.filter((r) => r.status === "failed").length;
  const apiCount = rows.filter((r) => r.source === "api_key").length;
  const chargedTokens = rows.reduce((sum, r) => sum + r.creditsCharged, 0);
  const shownFrom = total === 0 ? 0 : offset + 1;
  const shownTo = Math.min(offset + rows.length, total);

  const baseQuery = { mode, source, status, q, from, to, size };
  const buildHref = (overrides: Record<string, string | number>) => {
    const merged: Record<string, string | number> = { ...baseQuery, ...overrides };
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value === "" || value === "all" || value === undefined || value === null) continue;
      search.set(key, String(value));
    }
    const qs = search.toString();
    return qs ? `/app/admin/activity?${qs}` : "/app/admin/activity";
  };

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[34px] font-headline font-black uppercase text-primary">System Activity Log</h1>
          <p className="mt-1 text-sm font-body text-primary/70">
            Full history of every audio generation across the website &mdash; dashboard, public API, and batch jobs.
            Filter by source, type, status, date range, or search, and page through the complete record.
          </p>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Total Matches" value={total.toLocaleString()} note="All filtered records" />
        <MetricCard label="On This Page" value={rows.length.toLocaleString()} note={`${shownFrom}-${shownTo} of ${total.toLocaleString()}`} />
        <MetricCard label="Success" value={successCount.toLocaleString()} note="This page" />
        <MetricCard label="Failed" value={failedCount.toLocaleString()} note="This page" />
        <MetricCard label="API Calls" value={apiCount.toLocaleString()} note="This page" />
        <MetricCard label="Tokens (page)" value={chargedTokens.toLocaleString()} note="Charged this page" />
      </section>

      <section className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[150px_150px_150px_150px_150px_1fr_auto] font-headline font-bold uppercase text-sm text-primary">
          <SelectField label="Type" name="mode" value={mode} options={modeOptions} />
          <SelectField label="Source" name="source" value={source} options={sourceOptions} />
          <SelectField label="Status" name="status" value={status} options={statusOptions} />
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
              placeholder="Email, preview, model, voice"
              className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none focus:bg-surface-container-low font-body text-primary"
            />
          </label>
          <div className="flex items-end gap-2">
            {/* Reset to page 1 whenever filters change. */}
            <input type="hidden" name="page" value="1" />
            <input type="hidden" name="size" value={size} />
            <button
              type="submit"
              className="rounded-none border-2 border-primary bg-[#ffcc00] px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer"
            >
              Filter
            </button>
            <Link
              href="/app/admin/activity"
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
            <h2 className="text-2xl font-headline font-black uppercase text-primary">Activity Records</h2>
            <p className="mt-1 text-sm font-body text-primary/70">
              Page {page.toLocaleString()} of {totalPages.toLocaleString()} &mdash; newest first.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PagerLink
              href={buildHref({ page: page - 1 })}
              disabled={page <= 1}
              label="Prev"
            />
            <PagerLink
              href={buildHref({ page: page + 1 })}
              disabled={page >= totalPages}
              label="Next"
            />
          </div>
        </div>
        <div className="mt-4 max-w-full overflow-x-auto rounded-none border-2 border-primary bg-white">
          <ActivityTable rows={rows} />
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

function ActivityTable({ rows }: { rows: GenerationWithUser[] }) {
  return (
    <table className="w-full min-w-[1240px] text-sm text-primary">
      <thead className="bg-[#f2ede5] text-left text-primary border-b-2 border-primary font-headline">
        <tr>
          <th className="px-3 py-2 font-bold uppercase">Time</th>
          <th className="px-3 py-2 font-bold uppercase">User</th>
          <th className="px-3 py-2 font-bold uppercase">Type</th>
          <th className="px-3 py-2 font-bold uppercase">Source</th>
          <th className="px-3 py-2 font-bold uppercase">Status</th>
          <th className="px-3 py-2 font-bold uppercase">Model</th>
          <th className="px-3 py-2 font-bold uppercase">Chars</th>
          <th className="px-3 py-2 font-bold uppercase">Seconds</th>
          <th className="px-3 py-2 font-bold uppercase">Charged</th>
          <th className="px-3 py-2 font-bold uppercase">Latency</th>
          <th className="px-3 py-2 font-bold uppercase">Preview / Error</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={11} className="px-3 py-8 text-center text-primary/60 font-body">
              No activity found for these filters.
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id} className="border-t border-primary/20 hover:bg-[#fafbfe] text-primary">
              <td className="px-3 py-2 font-body whitespace-nowrap">{formatDate(row.createdAt)}</td>
              <td className="max-w-[220px] px-3 py-2 font-body">
                <Link
                  href={`/app/admin/customers/${row.userId}`}
                  className="truncate font-bold text-emerald-800 hover:underline"
                >
                  {row.userEmail}
                </Link>
              </td>
              <td className="px-3 py-2 font-body uppercase">{row.mode}</td>
              <td className="px-3 py-2">
                <span className={`rounded-none border-2 px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider ${sourceClass(row.source)}`}>
                  {row.source === "api_key" ? "API" : "Dashboard"}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className={`rounded-none border-2 px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider ${generationStatusClass(row.status)}`}>
                  {row.status}
                </span>
              </td>
              <td className="max-w-[160px] px-3 py-2 font-body truncate">{row.model || "-"}</td>
              <td className="px-3 py-2 font-body">{row.inputChars.toLocaleString()}</td>
              <td className="px-3 py-2 font-body">{row.outputSeconds.toLocaleString()}</td>
              <td className="px-3 py-2 font-body">{row.creditsCharged.toLocaleString()}</td>
              <td className="px-3 py-2 font-body whitespace-nowrap">{row.latencyMs.toLocaleString()} ms</td>
              <td className="max-w-[360px] px-3 py-2 font-body">
                <p className="truncate">{row.inputPreview || row.errorMessage || "-"}</p>
                {row.errorMessage ? (
                  <p className="mt-1 truncate text-xs text-red-700 font-semibold">{row.errorMessage}</p>
                ) : null}
              </td>
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

function generationStatusClass(status: GenerationStatus): string {
  if (status === "success") return "bg-[#def3e5] text-emerald-900 border-emerald-900";
  if (status === "processing") return "bg-amber-100 text-amber-900 border-amber-900";
  return "bg-red-100 text-red-900 border-red-900";
}

// Advance a YYYY-MM-DD date by one UTC day so the chosen end date is fully
// included by the exclusive upper-bound comparison in the store.
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
