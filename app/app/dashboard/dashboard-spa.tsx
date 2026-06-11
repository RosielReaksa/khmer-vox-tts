"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiDashboardClient } from "@/app/app/dashboard/api/api-dashboard-client";
import { BillingClient } from "@/app/app/dashboard/billing/billing-client";
import { BusinessOnboardingClient } from "@/app/app/dashboard/business/business-onboarding-client";
import { useCachedJson } from "@/app/app/dashboard/dashboard-data-cache";
import { useDashboardUser } from "@/app/app/dashboard/dashboard-user-context";
import { BatchJobsPanel } from "@/app/app/dashboard/jobs/batch-jobs-panel";
import { SettingsPanel } from "@/app/app/dashboard/settings/settings-panel";
import { SpeechWorkspace } from "@/app/app/dashboard/speech-workspace";
import { AnalyticsClient } from "@/app/app/dashboard/analytics/analytics-client";
import { VoicesPanel } from "@/app/app/dashboard/voices/voices-panel";
import { HistoryRowActions } from "./history/history-row-actions";
import { VoxLoader } from "@/app/components/vox-loader";
import type { TokenPackPlan } from "@/lib/plans";
import type {
  GenerationMode,
  GenerationSource,
  GenerationStatus,
  PaymentOrderRecord,
  PaymentSupportTicketRecord,
} from "@/lib/types";

type DashboardSpaProps = {
  activePath: string;
  onNavigate: (href: string) => void;
};

type BillingDashboardData = {
  orders: PaymentOrderRecord[];
  supportTickets: PaymentSupportTicketRecord[];
  plans: TokenPackPlan[];
  currentBalance: number;
  totalCreditsEarned: number;
  apiAccess?: {
    hasPaidApiAccess: boolean;
    currentPlanName: string;
    cloneCreditsPerSecond: number;
    businessLimits: {
      dailyTokenLimit: number | null;
      monthlyTokenLimit: number | null;
      maxConcurrentRequests: number | null;
      maxConcurrentJobs: number | null;
      maxQueuedJobs: number | null;
      cloneCreditRate: number;
    } | null;
  } | null;
  paymentInfo: {
    khqrName: string;
    khqrAccount: string;
    telegramHandle: string;
    staticQrImageUrl: string;
    autoVerificationEnabled: boolean;
    checkoutMode: "local_khqr" | "payway_qr" | "static_payway_qr" | "khqrcc_qr";
    initialAdminActive: boolean;
  };
};

type HistoryDashboardData = {
  stats: {
    totalGenerations: number;
    totalDurationSec: number;
    avgDurationSec: number;
    thisMonthGenerations: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  recent: Array<{
    id: string;
    createdAt: string;
    mode: GenerationMode;
    source: GenerationSource;
    status: GenerationStatus;
    inputChars: number;
    inputPreview: string;
    outputSeconds: number;
    creditsCharged: number;
    errorMessage: string | null;
    hasAudio: boolean;
    voice: string;
    model: string;
  }>;
};

function generationErrorText(input: string | null): string {
  const message = input?.trim();
  if (!message) return "Generation failed before audio was created.";
  if (message === "[object Object]") {
    return "Upstream returned an unreadable error before the error parser fix. Try again to see the real message.";
  }
  return message;
}

export function DashboardSpa({ activePath, onNavigate }: DashboardSpaProps) {
  const { pathname, searchParams } = useMemo(() => parseActivePath(activePath), [activePath]);

  if (pathname === "/app/dashboard/voice-cloning") {
    return (
      <SpeechWorkspace
        key="clone"
        mode="clone"
        title="Voice Cloning"
        actionLabel="Generate Clone Speech"
        onNavigate={onNavigate}
      />
    );
  }

  if (pathname === "/app/dashboard/voices") {
    return <VoicesPanel onNavigate={onNavigate} />;
  }

  if (pathname === "/app/dashboard/history") {
    const mode = searchParams.get("mode") === "clone" ? "clone" : "tts";
    const q = searchParams.get("q")?.trim() ?? "";
    return <HistoryPanel key={`${mode}:${q}`} mode={mode} searchQuery={q} onNavigate={onNavigate} />;
  }

  if (pathname === "/app/dashboard/jobs") {
    return <BatchJobsPanel />;
  }

  if (pathname === "/app/dashboard/business") {
    return <BusinessOnboardingClient supportContact={telegramContact("https://t.me/OfficalVoxTTS")} />;
  }

  if (pathname === "/app/dashboard/api") {
    return <ApiDashboardClient />;
  }

  if (pathname === "/app/dashboard/billing") {
    return <BillingPanel />;
  }

  if (pathname === "/app/dashboard/analytics") {
    return <AnalyticsClient />;
  }

  if (pathname === "/app/dashboard/settings") {
    return <SettingsPanel />;
  }

  return (
    <SpeechWorkspace
      key="tts"
      mode="tts"
      title="Generate Speech"
      actionLabel="Generate Speech"
      onNavigate={onNavigate}
    />
  );
}

function BillingPanel() {
  const user = useDashboardUser();
  const { tokenBalance, setTokenBalance } = user;
  const { data, error, loading } = useCachedJson<BillingDashboardData>(
    "dashboard:billing",
    "/api/dashboard/billing",
    { pollMs: 30000 },
  );
  useEffect(() => {
    if (typeof data?.currentBalance === "number" && data.currentBalance !== tokenBalance) {
      setTokenBalance(data.currentBalance);
    }
  }, [data?.currentBalance, setTokenBalance, tokenBalance]);
  const totalCreditsEarned = data?.totalCreditsEarned ?? 0;
  const currentBalance = data?.currentBalance ?? tokenBalance;
  const totalCredits = Math.max(totalCreditsEarned, currentBalance);
  const usedCredits = Math.max(0, totalCredits - currentBalance);
  const usagePercent = totalCredits > 0 ? Math.min(100, Math.round((usedCredits / totalCredits) * 100)) : 0;
  const plans = data?.plans ?? [];
  const orders = data?.orders ?? [];
  const supportTickets = data?.supportTickets ?? [];
  const latestPaidOrder = getLatestApprovedOrder(orders);
  const apiAccess = data?.apiAccess;
  const currentPlanName = apiAccess?.currentPlanName ?? (latestPaidOrder?.planName ?? "Free");
  const currentPlanNote = apiAccess?.currentPlanName === "Business API"
    ? "Custom business plan access active"
    : (latestPaidOrder
        ? `${latestPaidOrder.planName} x ${latestPaidOrder.quantity} paid pack`
        : "Free trial credits");
  const paymentInfo = data?.paymentInfo ?? {
    khqrName: "KHQRcc ABA Pay",
    khqrAccount: "KHQRcc ABA Pay",
    telegramHandle: "https://t.me/OfficalVoxTTS",
    staticQrImageUrl: "",
    autoVerificationEnabled: false,
    checkoutMode: "khqrcc_qr" as const,
    initialAdminActive: true,
  };

  return (
    <section className="dashboard-enter flex flex-col gap-6">
      <header className="border-b-4 border-primary pb-6">
        <h1 className="text-4xl md:text-6xl font-black font-headline uppercase tracking-tighter text-primary">Billing</h1>
        <p className="font-body text-base md:text-lg text-on-surface-variant mt-2 font-bold">Manage your plans, token packs, and check payment history.</p>
      </header>
      {error ? <InlineError message={error} /> : null}
      {loading && !data ? <VoxLoader variant="panel" label="Loading billing..." /> : null}

      <div className={`grid gap-6 xl:grid-cols-2 ${loading && !data ? "hidden" : ""}`}>
        <article className="border-4 border-primary bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] relative flex flex-col justify-between">
          <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#ffcc00] border-4 border-outline"></div>
          <div>
            <p className="text-[10px] font-headline font-black uppercase tracking-wider text-[#4a4a4a]">CURRENT PLAN</p>
            <div className="mt-2 flex items-center justify-between border-b-2 border-outline pb-4 mb-4">
              <div>
                <h2 className="text-3xl font-headline font-black uppercase text-primary">{currentPlanName}</h2>
                <p className="mt-1 text-xs font-body font-bold text-on-surface-variant">{currentPlanNote}</p>
              </div>
              <span className="border-2 border-primary bg-[#def3e5] px-3 py-1 text-xs font-headline font-black uppercase text-[#0d5f2e]">
                {apiAccess?.hasPaidApiAccess || latestPaidOrder ? "Paid" : "Active"}
              </span>
            </div>
            <div className="flex items-center gap-6">
              <div className="grid h-24 w-24 shrink-0 place-items-center border-4 border-primary bg-[#faf7f2] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] text-center">
                <div>
                  <p className="text-2xl font-headline font-black text-primary leading-none">{usagePercent}%</p>
                  <p className="text-[10px] font-headline font-black uppercase text-[#4a4a4a] mt-1">used</p>
                </div>
              </div>
              <div className="grid gap-2 text-xs font-headline font-bold uppercase text-on-surface-variant min-w-0 flex-1">
                <p className="flex items-center justify-between gap-4">
                  <span>Total Earned</span>
                  <span className="font-black text-primary">{totalCredits.toLocaleString()}</span>
                </p>
                <p className="flex items-center justify-between gap-4">
                  <span>Used</span>
                  <span className="font-black text-primary">{usedCredits.toLocaleString()}</span>
                </p>
                <p className="flex items-center justify-between gap-4">
                  <span>Remaining</span>
                  <span className="font-black text-[#0055ff]">{currentBalance.toLocaleString()}</span>
                </p>
              </div>
            </div>
          </div>
          <div className="mt-6">
            <div className="h-4 border-2 border-primary bg-[#eee9e0]">
              <div
                className="h-full bg-[#ffcc00] border-r-2 border-primary transition-[width] duration-500 ease-out"
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <p className="mt-2 text-right text-xs font-headline font-black uppercase text-primary">
              {currentBalance.toLocaleString()} tokens left
            </p>
          </div>
        </article>

        <article className="border-4 border-primary bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] flex flex-col justify-between">
          <div>
            <h2 className="text-2xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-2 mb-2">Payment Method</h2>
            <p className="text-xs font-body font-bold text-on-surface-variant">Accepted payment methods for token packs</p>
            <div className="mt-4 flex items-center justify-between border-2 border-primary bg-[#faf7f2] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center border-2 border-primary bg-[#e63b2e] text-xs font-headline font-black uppercase text-white shadow-[1px_1px_0px_0px_rgba(26,26,26,1)]">
                  KHQR
                </div>
                <div>
                  <p className="text-xs font-headline font-black uppercase text-primary">
                    KHQRcc ABA Pay
                  </p>
                  <p className="text-[10px] font-body font-medium text-on-surface-variant leading-relaxed">
                    Automatic QR checkout and verification
                  </p>
                </div>
              </div>
              <span className="border-2 border-primary bg-[#def3e5] px-2 py-0.5 text-[10px] font-headline font-black uppercase text-[#0d5f2e]">
                {paymentInfo.autoVerificationEnabled ? "Auto check" : "Not configured"}
              </span>
            </div>
          </div>
          {!paymentInfo.autoVerificationEnabled ? (
            <p className="mt-4 border-2 border-outline bg-[#ffdad6] p-4 text-xs font-bold text-[#93000a] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] leading-relaxed">
              KHQRcc checkout is selected, but the server is missing KHQRCC_PROFILE_ID or KHQRCC_SECRET_KEY.
            </p>
          ) : null}
        </article>
      </div>

      {loading && !data ? null : (
        <BillingClient
          key="billing-client"
          plans={plans}
          initialOrders={orders}
          initialSupportTickets={supportTickets}
          paymentInfo={paymentInfo}
          currentBalance={currentBalance}
          apiAccess={apiAccess ?? { hasPaidApiAccess: false, currentPlanName: "Free", cloneCreditsPerSecond: 2, businessLimits: null }}
        />
      )}
    </section>
  );
}

function HistoryPanel({
  mode,
  searchQuery,
  onNavigate,
}: {
  mode: GenerationMode;
  searchQuery: string;
  onNavigate: (href: string) => void;
}) {
  const [query, setQuery] = useState(searchQuery);
  const [page, setPage] = useState(1);
  const key = `dashboard:history:${mode}:${searchQuery}:${page}`;
  const url = `/api/dashboard/history?mode=${encodeURIComponent(mode)}${
    searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""
  }&page=${page}`;
  const { data, error, loading, refresh } = useCachedJson<HistoryDashboardData>(key, url);
  const stats = data?.stats ?? {
    totalGenerations: 0,
    totalDurationSec: 0,
    avgDurationSec: 0,
    thisMonthGenerations: 0,
  };
  const pagination = data?.pagination ?? { page: 1, pageSize: 30, total: 0, totalPages: 1 };
  const recent = data?.recent ?? [];
  const hasProcessing = recent.some((item) => item.status === "processing");

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh();
    }, hasProcessing ? 3000 : 30000);
    return () => window.clearInterval(interval);
  }, [hasProcessing, refresh]);

  function setMode(nextMode: GenerationMode) {
    setPage(1);
    onNavigate(`/app/dashboard/history?mode=${nextMode}`);
  }

  function onSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    const nextQuery = query.trim();
    onNavigate(
      `/app/dashboard/history?mode=${mode}${nextQuery ? `&q=${encodeURIComponent(nextQuery)}` : ""}`,
    );
  }

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
            <button
              type="button"
              onClick={() => setMode("tts")}
              className={`px-4 py-2 border border-primary font-headline font-bold uppercase text-xs transition-all cursor-pointer ${
                mode === "tts"
                  ? "bg-primary-fixed text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] -translate-y-0.5 translate-x-0.5"
                  : "bg-white text-primary hover:bg-[#faf7f2]"
              }`}
            >
              TTS
            </button>
            <button
              type="button"
              onClick={() => setMode("clone")}
              className={`px-4 py-2 border border-primary font-headline font-bold uppercase text-xs transition-all cursor-pointer ${
                mode === "clone"
                  ? "bg-primary-fixed text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] -translate-y-0.5 translate-x-0.5"
                  : "bg-white text-primary hover:bg-[#faf7f2]"
              }`}
            >
              Voice Cloning
            </button>
          </div>

          {/* Search Input */}
          <form onSubmit={onSearch} className="flex gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-primary">search</span>
              <input
                name="q"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="SEARCH LOGS..."
                type="text"
                className="w-full pl-10 pr-4 py-3 bg-surface border-2 border-primary font-label font-bold uppercase focus:outline-none focus:ring-0 focus:border-primary focus:bg-surface-bright transition-colors placeholder:text-on-surface-variant text-sm"
              />
            </div>
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  onNavigate(`/app/dashboard/history?mode=${mode}`);
                }}
                className="bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-2 px-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#faf7f2] transition-all cursor-pointer"
              >
                Clear
              </button>
            ) : null}
          </form>
        </div>
      </header>

      {error ? <InlineError message={error} /> : null}

      {/* Metric Cards Section */}
      <div className={`grid gap-6 md:grid-cols-2 xl:grid-cols-4 mb-6 ${loading && !data ? "hidden" : ""}`}>
        <MetricCard title="Total Generations" value={stats.totalGenerations.toLocaleString()} note="All time" />
        <MetricCard title="Total Duration" value={formatDuration(stats.totalDurationSec)} note="Audio generated" />
        <MetricCard title="Avg. Duration" value={formatDuration(stats.avgDurationSec)} note="Per generation" />
        <MetricCard title="This Month" value={stats.thisMonthGenerations.toLocaleString()} note="Successful generations" />
      </div>

      {loading && !data ? (
        <div className="border-4 border-dashed border-primary bg-surface p-8 text-center mt-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
          <VoxLoader variant="panel" label="Loading history..." />
        </div>
      ) : (
        <>
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
                      className="group relative border-4 border-error bg-error-container p-0 flex flex-col lg:grid lg:grid-cols-12 lg:gap-4 lg:items-center hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_#cc0000] transition-all duration-150 min-w-0"
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
                      <div className="p-4 lg:p-6 lg:col-span-4 font-body text-base font-bold text-error flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined">warning</span>
                        FAILED: {generationErrorText(item.errorMessage).toUpperCase()}
                      </div>

                      {/* Voice Model */}
                      <div className="p-4 lg:p-6 lg:col-span-2 font-label font-bold text-sm uppercase opacity-50">
                        {voiceModel}
                      </div>

                      {/* Duration */}
                      <div className="p-4 lg:p-6 lg:col-span-1 font-body font-bold text-left lg:text-right lg:border-l-2 border-error border-dashed">
                        <span className="lg:hidden text-[#4a4a4a] mr-2">Duration:</span>
                        --
                      </div>

                      {/* Cost */}
                      <div className="p-4 lg:p-6 lg:col-span-1 font-body font-bold text-left lg:text-right">
                        <span className="lg:hidden text-[#4a4a4a] mr-2">Cost:</span>
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
                    className="group relative border-4 border-primary bg-surface p-0 flex flex-col lg:grid lg:grid-cols-12 lg:gap-4 lg:items-center hover:bg-surface-bright hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] transition-all duration-150 min-w-0"
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
                    <div className="p-4 lg:p-6 lg:col-span-4 font-body text-base font-medium truncate min-w-0" title={previewText}>
                      {previewText}
                    </div>

                    {/* Voice Model */}
                    <div className="p-4 lg:p-6 lg:col-span-2 font-label font-bold text-sm uppercase">
                      {voiceModel}
                    </div>

                    {/* Duration */}
                    <div className="p-4 lg:p-6 lg:col-span-1 font-body font-bold text-left lg:text-right lg:border-l-2 border-primary border-dashed">
                      <span className="lg:hidden text-[#4a4a4a] mr-2">Duration:</span>
                      {isProcessing ? "--" : `${item.outputSeconds}s`}
                    </div>

                    {/* Cost */}
                    <div className="p-4 lg:p-6 lg:col-span-1 font-body font-bold text-left lg:text-right">
                      <span className="lg:hidden text-[#4a4a4a] mr-2">Cost:</span>
                      {item.creditsCharged.toLocaleString()}t
                    </div>

                    <div className="p-4 lg:p-6 lg:col-span-1 flex justify-center gap-2 border-t-2 lg:border-t-0 lg:border-l-2 border-primary bg-surface-container">
                      <HistoryRowActions itemId={item.id} hasAudio={!!item.hasAudio} />
                    </div>
                  </div>
                );
              })
            )}

            {/* Pagination Footer */}
            {pagination.totalPages > 1 ? (
              <div className="flex flex-col sm:flex-row justify-between items-center pt-8 border-t-4 border-primary gap-4 mt-8">
                <div className="font-label font-bold uppercase text-primary border-2 border-primary bg-surface px-4 py-2 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] text-xs">
                  SHOWING {((pagination.page - 1) * pagination.pageSize + 1).toLocaleString()}-
                  {Math.min(pagination.page * pagination.pageSize, pagination.total).toLocaleString()} OF{" "}
                  {pagination.total.toLocaleString()} LOGS
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-4 py-2 border-2 border-primary bg-surface text-primary font-label font-bold uppercase text-xs flex items-center gap-2 hover:bg-primary hover:text-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_left</span>
                    PREV
                  </button>
                  <button
                    type="button"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-4 py-2 border-2 border-primary bg-surface text-primary font-label font-bold uppercase text-xs flex items-center gap-2 hover:bg-primary hover:text-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    NEXT
                    <span className="material-symbols-outlined text-sm">arrow_right</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
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

function InlineError({ message }: { message: string }) {
  return (
    <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </p>
  );
}

function telegramContact(rawValue: string): { label: string; url: string } {
  const fallbackUrl = "https://t.me/OfficalVoxTTS";
  const raw = rawValue.trim() || fallbackUrl;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const username = raw.replace(/\/+$/, "").split("/").pop()?.replace(/^@/, "") || "OfficalVoxTTS";
    return { label: `@${username}`, url: raw };
  }
  const username = raw.replace(/^@/, "") || "OfficalVoxTTS";
  return { label: `@${username}`, url: `https://t.me/${username}` };
}

function getLatestApprovedOrder(orders: PaymentOrderRecord[]): PaymentOrderRecord | null {
  return (
    orders
      .filter((order) => order.status === "approved")
      .sort((a, b) => paymentOrderTime(b) - paymentOrderTime(a))[0] ?? null
  );
}

function paymentOrderTime(order: PaymentOrderRecord): number {
  return new Date(order.approvedAt ?? order.paidAt ?? order.updatedAt ?? order.createdAt).getTime();
}

function parseActivePath(path: string): { pathname: string; searchParams: URLSearchParams } {
  const [pathname, search = ""] = path.split("?");
  return {
    pathname,
    searchParams: new URLSearchParams(search),
  };
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function tabClass(active: boolean): string {
  return `click-soft rounded-full px-4 py-1.5 ${
    active ? "bg-[#f3f5fa] text-[#171b24]" : "text-[#6a7282] hover:bg-[#f6f8fb] hover:text-[#171b24]"
  }`;
}

function generationStatusClass(status: GenerationStatus): string {
  if (status === "success") return "bg-emerald-100 text-emerald-700";
  if (status === "processing") return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-700";
}
