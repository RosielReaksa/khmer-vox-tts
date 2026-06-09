import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";
import { listGenerationsForAdmin } from "@/lib/store";
import type { GenerationMode, GenerationSource, GenerationStatus } from "@/lib/types";
import type { GenerationWithUser } from "@/lib/store";
import { AdminAccessRequired, MetricCard } from "../admin-shared";
import { UsageAnalyticsCharts } from "../admin-charts";

type AdminUsagePageProps = {
  searchParams?: Promise<{
    mode?: string;
    source?: string;
    status?: string;
    q?: string;
  }>;
};

const modeOptions: Array<GenerationMode | "all"> = ["all", "tts", "clone"];
const sourceOptions: Array<GenerationSource | "all"> = ["all", "dashboard", "api_key"];
const statusOptions: Array<GenerationStatus | "all"> = ["all", "processing", "success", "failed"];

export default async function AdminUsagePage({ searchParams }: AdminUsagePageProps) {
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

  const generations = await listGenerationsForAdmin({
    limit: 200,
    mode,
    source,
    status,
    q,
  });

  const successCount = generations.filter((generation) => generation.status === "success").length;
  const failedCount = generations.filter((generation) => generation.status === "failed").length;
  const apiCount = generations.filter((generation) => generation.source === "api_key").length;
  const cloneCount = generations.filter((generation) => generation.mode === "clone").length;
  const chargedTokens = generations.reduce((sum, generation) => sum + generation.creditsCharged, 0);
  const avgLatency =
    generations.length === 0
      ? 0
      : Math.round(generations.reduce((sum, generation) => sum + generation.latencyMs, 0) / generations.length);

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[34px] font-headline font-black uppercase text-primary">Generation Usage</h1>
          <p className="mt-1 text-sm font-body text-primary/70">
            Inspect API usage, dashboard jobs, failed generations, latency, and token charging.
          </p>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Shown" value={generations.length.toLocaleString()} note="Latest 200 max" />
        <MetricCard label="Success" value={successCount.toLocaleString()} note="Generated audio" />
        <MetricCard label="Failed" value={failedCount.toLocaleString()} note="No audio output" />
        <MetricCard label="API Calls" value={apiCount.toLocaleString()} note="From public keys" />
        <MetricCard label="Clone Jobs" value={cloneCount.toLocaleString()} note="Voice sample used" />
        <MetricCard label="Tokens Charged" value={chargedTokens.toLocaleString()} note={`${avgLatency.toLocaleString()} ms avg`} />
      </section>

      <UsageAnalyticsCharts generations={generations} />

      <section className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_180px_180px_1fr_auto] font-headline font-bold uppercase text-sm text-primary">
          <SelectField label="Mode" name="mode" value={mode} options={modeOptions} />
          <SelectField label="Source" name="source" value={source} options={sourceOptions} />
          <SelectField label="Status" name="status" value={status} options={statusOptions} />
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
            <button
              type="submit"
              className="rounded-none border-2 border-primary bg-[#ffcc00] px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none cursor-pointer"
            >
              Filter
            </button>
            <Link
              href="/app/admin/usage"
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
            <h2 className="text-2xl font-headline font-black uppercase text-primary">Recent Generations</h2>
            <p className="mt-1 text-sm font-body text-primary/70">
              Use this to debug slow jobs, token disputes, failed upstream calls, and customer support reports.
            </p>
          </div>
        </div>
        <div className="mt-4 max-w-full overflow-x-auto rounded-none border-2 border-primary bg-white">
          <UsageTable generations={generations} />
        </div>
      </section>
    </section>
  );
}

function UsageTable({ generations }: { generations: GenerationWithUser[] }) {
  return (
    <table className="w-full min-w-[1240px] text-sm text-primary">
      <thead className="bg-[#f2ede5] text-left text-primary border-b-2 border-primary font-headline">
        <tr>
          <th className="px-3 py-2 font-bold uppercase">Time</th>
          <th className="px-3 py-2 font-bold uppercase">User</th>
          <th className="px-3 py-2 font-bold uppercase">Mode</th>
          <th className="px-3 py-2 font-bold uppercase">Source</th>
          <th className="px-3 py-2 font-bold uppercase">Status</th>
          <th className="px-3 py-2 font-bold uppercase">Chars</th>
          <th className="px-3 py-2 font-bold uppercase">Seconds</th>
          <th className="px-3 py-2 font-bold uppercase">Requested</th>
          <th className="px-3 py-2 font-bold uppercase">Charged</th>
          <th className="px-3 py-2 font-bold uppercase">Latency</th>
          <th className="px-3 py-2 font-bold uppercase">Preview / Error</th>
        </tr>
      </thead>
      <tbody>
        {generations.length === 0 ? (
          <tr>
            <td colSpan={11} className="px-3 py-8 text-center text-primary/60 font-body">
              No generations found.
            </td>
          </tr>
        ) : (
          generations.map((generation) => (
            <tr key={generation.id} className="border-t border-primary/20 hover:bg-[#fafbfe] text-primary">
              <td className="px-3 py-2 font-body">{formatDate(generation.createdAt)}</td>
              <td className="max-w-[220px] px-3 py-2 font-body">
                <Link
                  href={`/app/admin/customers/${generation.userId}`}
                  className="truncate font-bold text-emerald-800 hover:underline"
                >
                  {generation.userEmail}
                </Link>
              </td>
              <td className="px-3 py-2 font-body">{generation.mode}</td>
              <td className="px-3 py-2 font-body">{generation.source}</td>
              <td className="px-3 py-2">
                <span className={`rounded-none border-2 px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider ${
                  generationStatusClass(generation.status)
                }`}>
                  {generation.status}
                </span>
              </td>
              <td className="px-3 py-2 font-body">{generation.inputChars.toLocaleString()}</td>
              <td className="px-3 py-2 font-body">{generation.outputSeconds.toLocaleString()}</td>
              <td className="px-3 py-2 font-body">{generation.creditsRequested.toLocaleString()}</td>
              <td className="px-3 py-2 font-body">{generation.creditsCharged.toLocaleString()}</td>
              <td className="px-3 py-2 font-body">{generation.latencyMs.toLocaleString()} ms</td>
              <td className="max-w-[360px] px-3 py-2 font-body">
                <p className="truncate">{generation.inputPreview || generation.errorMessage || "-"}</p>
                {generation.errorMessage ? (
                  <p className="mt-1 truncate text-xs text-red-700 font-semibold">{generation.errorMessage}</p>
                ) : null}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
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
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function generationStatusClass(status: GenerationStatus): string {
  if (status === "success") return "bg-[#def3e5] text-emerald-900 border-emerald-900";
  if (status === "processing") return "bg-amber-100 text-amber-900 border-amber-900";
  return "bg-red-100 text-red-900 border-red-900";
}

function formatDate(input: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
