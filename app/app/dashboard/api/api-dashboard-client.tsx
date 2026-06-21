"use client";

import { useEffect, useMemo } from "react";

import { ApiTabs } from "@/app/app/dashboard/api/api-tabs";
import { useCachedJson } from "@/app/app/dashboard/dashboard-data-cache";
import { VoxLoader } from "@/app/components/vox-loader";
import {
  formatCloneCreditRate,
  TTS_CREDITS_PER_SECOND,
  STANDARD_CLONE_CREDITS_PER_SECOND,
} from "@/lib/credit-rates";
import type {
  GenerationMode,
  GenerationSource,
  GenerationStatus,
} from "@/lib/types";

type ApiDashboardData = {
  apiAccess: {
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
  };
  usage: {
    requestsToday: number;
    requestsThisMonth: number;
    successRatePercent: number;
    last30DaysRequests: number;
  };
  apiKeys: Array<{
    id: string;
    name: string;
    keyPrefix: string;
    dailyTokenLimit: number | null;
    monthlyTokenLimit: number | null;
    maxConcurrentRequests: number | null;
    maxConcurrentJobs: number | null;
    maxQueuedJobs: number | null;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
    requestCount: number;
  }>;
  requestLogs: Array<{
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
  }>;
};

export function ApiDashboardClient() {
  const { data, error, loading, refresh } = useCachedJson<ApiDashboardData>(
    "dashboard:api",
    "/api/dashboard/api-data",
    { pollMs: 60000 },
  );
  const normalKeys = useMemo(() => {
    return (
      data?.apiKeys.filter(
        (key) =>
          key.maxConcurrentRequests === null &&
          key.maxConcurrentJobs === null &&
          key.maxQueuedJobs === null,
      ) ?? []
    );
  }, [data?.apiKeys]);
  const usage = data?.usage ?? {
    requestsToday: 0,
    requestsThisMonth: 0,
    successRatePercent: 100,
    last30DaysRequests: 0,
  };
  const hasProcessingRequest =
    data?.requestLogs.some((item) => item.status === "processing") ?? false;

  useEffect(() => {
    if (!hasProcessingRequest) return;
    const interval = window.setInterval(() => {
      void refresh();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [hasProcessingRequest, refresh]);

  const handleCreateKeyClick = () => {
    const tabButton = document.querySelector(
      'button[aria-controls="api-keys-panel"]',
    ) as HTMLButtonElement | null;
    if (tabButton && tabButton.getAttribute("aria-selected") !== "true") {
      tabButton.click();
    }
    setTimeout(() => {
      const input = document.getElementById(
        "new-key-name",
      ) as HTMLInputElement | null;
      if (input) {
        input.focus();
        input.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  };

  return (
    <section className="dashboard-enter grid gap-8 pb-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end pb-6 border-b-4 border-primary">
        <div>
          <h2 className="text-xs font-label font-bold text-[#4a4a4a] uppercase tracking-widest mb-2">
            Security &amp; Access
          </h2>
          <h1 className="text-5xl md:text-6xl font-headline font-black uppercase tracking-tighter text-primary">
            API KEYS
          </h1>
        </div>
        <button
          onClick={handleCreateKeyClick}
          className="mt-6 md:mt-0 px-6 py-4 bg-[#10b981] text-primary border-4 border-primary font-headline font-bold uppercase shadow-[4px_4px_0px_0px_#1a1a1a] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_#1a1a1a] active:translate-y-[4px] active:translate-x-[4px] active:shadow-none transition-all duration-150 flex items-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined font-bold">add</span>
          Create New Key
        </button>
      </header>

      {error ? <InlineError message={error} /> : null}
      {loading && !data ? (
        <VoxLoader variant="panel" label="Loading API dashboard..." />
      ) : null}

      <section
        className={`bg-white border-4 border-primary p-6 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative ${loading && !data ? "hidden" : ""}`}
      >
        <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
          API Usage
        </div>
        <p className="text-sm text-[#4a4a4a] font-body mb-6 mt-2">
          Monitor your API request statistics
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          <StatCard
            title="REQUESTS TODAY"
            value={usage.requestsToday.toLocaleString()}
            subtitle="API key requests today"
          />
          <StatCard
            title="REQUESTS THIS MONTH"
            value={usage.requestsThisMonth.toLocaleString()}
            subtitle="Total API requests this month"
          />
          <StatCard
            title="SUCCESS RATE"
            value={`${usage.successRatePercent}%`}
            subtitle={`Last 30 days (${usage.last30DaysRequests} reqs)`}
          />
        </div>
      </section>

      <section
        className={`bg-white border-4 border-primary p-6 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative ${loading && !data ? "hidden" : ""}`}
      >
        <div className="absolute -top-4 -left-4 bg-[#0055ff] text-[#f5f0e8] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase">
          Credit Pricing
        </div>
        <p className="text-sm text-[#4a4a4a] font-body mb-6 mt-2">
          How credits are deducted when using the API
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <article className="bg-[#f5f0e8] border-4 border-primary p-6 shadow-[4px_4px_0px_0px_#1a1a1a]">
            <p className="text-xs font-headline font-bold uppercase tracking-wider text-[#4a4a4a]">
              STANDARD SPEECH
            </p>
            <p className="mt-2 text-4xl font-headline font-black leading-none text-primary">
              {TTS_CREDITS_PER_SECOND}x
            </p>
            <p className="mt-2 text-sm text-[#4a4a4a] font-body">
              {TTS_CREDITS_PER_SECOND} credits per generated audio second via
              API
            </p>
          </article>
          <article className="bg-[#f5f0e8] border-4 border-primary p-6 shadow-[4px_4px_0px_0px_#1a1a1a]">
            <p className="text-xs font-headline font-bold uppercase tracking-wider text-[#4a4a4a]">
              VOICE CLONING
            </p>
            <p className="mt-2 text-4xl font-headline font-black leading-none text-primary">
              {STANDARD_CLONE_CREDITS_PER_SECOND}x
            </p>
            <p className="mt-2 text-sm text-[#4a4a4a] font-body">
              {formatCloneCreditRate(STANDARD_CLONE_CREDITS_PER_SECOND)} with
              clone mode
            </p>
          </article>
        </div>
      </section>

      {loading && !data ? null : (
        <ApiTabs
          initialKeys={normalKeys}
          requestLogs={data?.requestLogs ?? []}
          apiAccess={
            data?.apiAccess ?? {
              hasPaidApiAccess: false,
              currentPlanName: "Free",
              cloneCreditsPerSecond: STANDARD_CLONE_CREDITS_PER_SECOND,
              businessLimits: null,
            }
          }
        />
      )}
    </section>
  );
}

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <article className="bg-white border-4 border-primary p-6 shadow-[4px_4px_0px_0px_#1a1a1a] relative">
      <p className="text-xs font-headline font-bold uppercase tracking-wider text-[#4a4a4a]">
        {title}
      </p>
      <p className="mt-2 text-4xl font-headline font-black leading-none text-primary">
        {value}
      </p>
      <p className="mt-2 text-sm text-[#4a4a4a] font-body">{subtitle}</p>
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
