import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

import { VoxLoader } from "@/app/components/vox-loader";
import { HistoryRowActions } from "./history-row-actions";
import { getCurrentUser } from "@/lib/current-user";
import { getGenerationStats, listUserGenerations } from "@/lib/store";
import type { GenerationMode, GenerationStatus } from "@/lib/types";

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

type HistoryPageProps = {
  searchParams?: Promise<{
    mode?: string;
    q?: string;
  }>;
};

function parseMode(input: string | undefined): GenerationMode {
  return input === "clone" ? "clone" : "tts";
}

function generationErrorText(input: string | null): string {
  const message = input?.trim();
  if (!message) return "Generation failed before audio was created.";
  if (message === "[object Object]") {
    return "Upstream returned an unreadable error. Try again.";
  }
  return message;
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const params = await searchParams;
  const selectedMode = parseMode(params?.mode);
  const searchQuery = params?.q?.trim() ?? "";

  return (
    <section className="dashboard-enter flex flex-col gap-6">
      {/* Header Section */}
      <header className="border-b-4 border-primary pb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-4xl md:text-6xl font-black font-headline uppercase tracking-tighter text-primary">Generation History</h2>
          <p className="font-body text-base md:text-lg text-on-surface-variant mt-2 font-bold">Review and manage your synthesized audio logs.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          {/* Mode Switcher (Simplified Brutalist Tabs) */}
          <div className="flex gap-2 bg-surface p-1 border-2 border-primary">
            <Link
              href={`/app/dashboard/history?mode=tts${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
              className={`px-4 py-2 border border-primary font-headline font-bold uppercase text-xs transition-all ${
                selectedMode === "tts"
                  ? "bg-primary-fixed text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] -translate-y-0.5 translate-x-0.5"
                  : "bg-white text-primary hover:bg-[#faf7f2]"
              }`}
            >
              TTS
            </Link>
            <Link
              href={`/app/dashboard/history?mode=clone${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
              className={`px-4 py-2 border border-primary font-headline font-bold uppercase text-xs transition-all ${
                selectedMode === "clone"
                  ? "bg-primary-fixed text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] -translate-y-0.5 translate-x-0.5"
                  : "bg-white text-primary hover:bg-[#faf7f2]"
              }`}
            >
              Voice Cloning
            </Link>
          </div>

          {/* Search Input */}
          <form action="/app/dashboard/history" className="relative w-full sm:w-64">
            <input type="hidden" name="mode" value={selectedMode} />
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-primary">search</span>
            <input
              name="q"
              defaultValue={searchQuery}
              placeholder="SEARCH LOGS..."
              type="text"
              className="w-full pl-10 pr-4 py-3 bg-surface border-2 border-primary font-label font-bold uppercase focus:outline-none focus:ring-0 focus:border-primary focus:bg-surface-bright transition-colors placeholder:text-on-surface-variant text-sm"
            />
          </form>
        </div>
      </header>

      <Suspense fallback={<HistoryFallback selectedMode={selectedMode} searchQuery={searchQuery} />}>
        <HistoryData selectedMode={selectedMode} searchQuery={searchQuery} />
      </Suspense>
    </section>
  );
}

async function HistoryData({
  selectedMode,
  searchQuery,
}: {
  selectedMode: GenerationMode;
  searchQuery: string;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }

  const [stats, recentRows] = await Promise.all([
    getGenerationStats(user.id, selectedMode),
    listUserGenerations(user.id, {
      source: "all",
      mode: selectedMode,
      limit: searchQuery ? 100 : 30,
    }),
  ]);

  const recent = searchQuery
    ? recentRows.filter((item) =>
        `${item.inputPreview} ${item.errorMessage ?? ""} ${item.mode} ${item.status} ${item.source}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
      )
    : recentRows;

  return (
    <>
      {/* Metric Cards Section */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4 mb-6">
        <MetricCard title="Total Generations" value={stats.totalGenerations.toLocaleString()} note="All time" />
        <MetricCard title="Total Duration" value={formatDuration(stats.totalDurationSec)} note="Audio generated" />
        <MetricCard title="Avg. Duration" value={formatDuration(stats.avgDurationSec)} note="Per generation" />
        <MetricCard title="This Month" value={stats.thisMonthGenerations.toLocaleString()} note="Successful generations" />
      </div>

      {/* Table Header (Hidden on small screens, visual guide on large) */}
      <div className="hidden lg:grid grid-cols-12 gap-4 px-6 py-3 font-label font-black uppercase text-sm border-b-2 border-primary text-on-surface-variant">
        <div className="col-span-2">Date / Time</div>
        <div className="col-span-1">Source</div>
        <div className="col-span-4">Preview Text</div>
        <div className="col-span-2">Voice Model</div>
        <div className="col-span-1 text-right">Duration</div>
        <div className="col-span-1 text-right">Cost</div>
        <div className="col-span-1 text-center">Actions</div>
      </div>

      {/* Data Rows */}
      <div className="flex flex-col gap-4 mb-12">
        {recent.length === 0 ? (
          <div className="border-4 border-dashed border-primary bg-surface p-8 text-center mt-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
            <p className="text-sm font-label font-bold uppercase text-primary">No generation history found</p>
            <p className="mt-2 text-xs text-on-surface-variant font-body">
              Synthesize some speech in the workspace to see logs here.
            </p>
          </div>
        ) : (
          recent.map((item) => {
            const d = new Date(item.createdAt);
            const dateStr = d.toLocaleDateString("en-US", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }).toUpperCase();
            
            // Format to Indochina Time (ICT)
            const timeStr = d.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
              timeZone: "Asia/Bangkok",
            }) + " ICT";

            const isFailed = item.status === "failed";
            const isProcessing = item.status === "processing";
            const previewText = item.inputPreview || `${item.inputChars} characters`;
            const voiceModel = `${item.voice} - ${item.model}`;

            if (isFailed) {
              return (
                <div
                  key={item.id}
                  className="group relative border-4 border-error bg-error-container p-0 flex flex-col lg:grid lg:grid-cols-12 lg:gap-4 lg:items-center hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_#cc0000] transition-all duration-150"
                >
                  {/* Date & Time */}
                  <div className="p-4 lg:p-6 lg:col-span-2 border-b-2 lg:border-b-0 lg:border-r-2 border-error bg-surface font-body font-bold text-sm">
                    {dateStr}
                    <br />
                    <span className="text-error">{timeStr}</span>
                  </div>

                  {/* Source */}
                  <div className="p-4 lg:p-6 lg:col-span-1 flex items-center">
                    {item.source === "api_key" ? (
                      <span className="inline-block px-2 py-1 bg-primary text-on-primary font-label font-bold text-xs uppercase border-2 border-primary">
                        API
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-1 bg-surface-container-highest text-primary font-label font-bold text-xs uppercase border-2 border-primary">
                        WEB
                      </span>
                    )}
                  </div>

                  {/* Preview Text (Error Message) */}
                  <div className="p-4 lg:p-6 lg:col-span-4 font-body text-base font-bold text-error flex items-center gap-2">
                    <span className="material-symbols-outlined">warning</span>
                    FAILED: {generationErrorText(item.errorMessage).toUpperCase()}
                  </div>

                  {/* Voice Model */}
                  <div className="p-4 lg:p-6 lg:col-span-2 font-label font-bold text-sm uppercase opacity-50">
                    {voiceModel}
                  </div>

                  {/* Duration */}
                  <div className="p-4 lg:p-6 lg:col-span-1 font-body font-bold text-right lg:border-l-2 border-error border-dashed">
                    --
                  </div>

                  {/* Cost */}
                  <div className="p-4 lg:p-6 lg:col-span-1 font-body font-bold text-right">
                    0t
                  </div>

                  {/* Actions */}
                  <div className="p-4 lg:p-6 lg:col-span-1 flex justify-center gap-2 border-t-2 lg:border-t-0 lg:border-l-2 border-error bg-surface">
                    <button className="w-10 h-10 flex items-center justify-center border-2 border-outline-variant bg-surface-container opacity-50 cursor-not-allowed" disabled>
                      <span className="material-symbols-outlined">play_arrow</span>
                    </button>
                    <div
                      title={generationErrorText(item.errorMessage)}
                      className="w-10 h-10 flex items-center justify-center border-2 border-error bg-surface text-error hover:bg-error hover:text-surface transition-colors cursor-help"
                    >
                      <span className="material-symbols-outlined">description</span>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={item.id}
                className="group relative border-4 border-primary bg-surface p-0 flex flex-col lg:grid lg:grid-cols-12 lg:gap-4 lg:items-center hover:bg-surface-bright hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] transition-all duration-150"
              >
                {/* Date & Time */}
                <div className="p-4 lg:p-6 lg:col-span-2 border-b-2 lg:border-b-0 lg:border-r-2 border-primary bg-surface-container-low font-body font-bold text-sm">
                  {dateStr}
                  <br />
                  <span className="text-on-surface-variant">{timeStr}</span>
                </div>

                {/* Source */}
                <div className="p-4 lg:p-6 lg:col-span-1 flex items-center">
                  {item.source === "api_key" ? (
                    <span className="inline-block px-2 py-1 bg-primary text-on-primary font-label font-bold text-xs uppercase border-2 border-primary">
                      API
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-1 bg-surface-container-highest text-primary font-label font-bold text-xs uppercase border-2 border-primary">
                      WEB
                    </span>
                  )}
                </div>

                {/* Preview Text */}
                <div className="p-4 lg:p-6 lg:col-span-4 font-body text-base font-medium truncate" title={previewText}>
                  {previewText}
                </div>

                {/* Voice Model */}
                <div className="p-4 lg:p-6 lg:col-span-2 font-label font-bold text-sm uppercase">
                  {voiceModel}
                </div>

                {/* Duration */}
                <div className="p-4 lg:p-6 lg:col-span-1 font-body font-bold text-right lg:border-l-2 border-primary border-dashed">
                  {isProcessing ? "--" : `${item.outputSeconds}s`}
                </div>

                {/* Cost */}
                <div className="p-4 lg:p-6 lg:col-span-1 font-body font-bold text-right">
                  {item.creditsCharged.toLocaleString()}t
                </div>

                {/* Actions */}
                <div className="p-4 lg:p-6 lg:col-span-1 flex justify-center gap-2 border-t-2 lg:border-t-0 lg:border-l-2 border-primary bg-surface-container">
                  <HistoryRowActions itemId={item.id} hasAudio={!!item.hasAudio} />
                </div>
              </div>
            );
          })
        )}

        {/* Pagination Footer */}
        <div className="flex flex-col sm:flex-row justify-between items-center pt-8 border-t-4 border-primary gap-4 mt-8">
          <div className="font-label font-bold uppercase text-primary border-2 border-primary bg-surface px-4 py-2 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] text-xs">
            SHOWING {recent.length} OF {stats.totalGenerations.toLocaleString()} LOGS
          </div>
          <div className="flex gap-2">
            <button
              disabled
              className="px-4 py-2 border-2 border-primary bg-surface text-primary font-label font-bold uppercase text-xs flex items-center gap-2 hover:bg-primary hover:text-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-sm">arrow_left</span>
              PREV
            </button>
            <button
              disabled
              className="px-4 py-2 border-2 border-primary bg-surface text-primary font-label font-bold uppercase text-xs flex items-center gap-2 hover:bg-primary hover:text-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              NEXT
              <span className="material-symbols-outlined text-sm">arrow_right</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function HistoryFallback({
  selectedMode,
  searchQuery,
}: {
  selectedMode: GenerationMode;
  searchQuery: string;
}) {
  return (
    <>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4 mb-6">
        <MetricCard title="Total Generations" value="--" note="All time" />
        <MetricCard title="Total Duration" value="--" note="Audio generated" />
        <MetricCard title="Avg. Duration" value="--" note="Per generation" />
        <MetricCard title="This Month" value="--" note="Successful generations" />
      </div>

      <div className="flex flex-col gap-4">
        {/* Table Header */}
        <div className="hidden lg:grid grid-cols-12 gap-4 px-6 py-3 font-label font-black uppercase text-sm border-b-4 border-primary text-[#4a4a4a] mt-4">
          <div className="col-span-2">Date / Time</div>
          <div className="col-span-1">Source</div>
          <div className="col-span-4">Preview Text</div>
          <div className="col-span-2">Voice Model</div>
          <div className="col-span-1 text-right">Duration</div>
          <div className="col-span-1 text-right">Cost</div>
          <div className="col-span-1 text-center">Actions</div>
        </div>

        <div className="border-4 border-dashed border-primary bg-surface p-8 text-center mt-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
          <VoxLoader variant="inline" label="Loading history data..." />
        </div>
      </div>
    </>
  );
}

function MetricCard({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note: string;
}) {
  return (
    <article className="border-4 border-primary bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] hover:-translate-y-1 hover:shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] transition-all duration-150">
      <p className="text-4xl font-headline font-black text-primary leading-none tracking-tight">{value}</p>
      <p className="mt-3 text-xs font-headline font-black uppercase tracking-wider text-primary">{title}</p>
      <p className="mt-1 text-[11px] text-[#4a4a4a] font-body font-bold">{note}</p>
    </article>
  );
}
