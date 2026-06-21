"use client";

import Link from "next/link";
import { type FormEvent, useState, useMemo } from "react";

import {
  clearDashboardCache,
  useCachedJson,
} from "@/app/app/dashboard/dashboard-data-cache";
import { useDashboardUser } from "@/app/app/dashboard/dashboard-user-context";
import { KeyManager } from "@/app/app/dashboard/key-manager";
import { VoxLoader } from "@/app/components/vox-loader";
import { formatCloneCreditRate } from "@/lib/credit-rates";
import type {
  BatchJobRecord,
  BusinessApiRequestRecord,
  WebhookTestEventRecord,
} from "@/lib/types";

type BusinessDashboardData = {
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
  apiKeys: Array<{
    id: string;
    name: string;
    keyPrefix: string;
    revokedAt: string | null;
    dailyTokenLimit: number | null;
    monthlyTokenLimit: number | null;
    maxConcurrentRequests: number | null;
    maxConcurrentJobs: number | null;
    maxQueuedJobs: number | null;
    requestCount: number;
    createdAt: string;
    lastUsedAt: string | null;
  }>;
  batchJobs: BatchJobRecord[];
  businessRequests: BusinessApiRequestRecord[];
  webhookTests: WebhookTestEventRecord[];
};

type SetupStep = {
  title: string;
  body: string;
  done: boolean;
  href: string;
  action: string;
};

type MainAction = {
  badge: string;
  title: string;
  body: string;
  href: string;
  action: string;
  tone: "blocked" | "active" | "review" | "test" | "ready";
};

type SupportContact = {
  label: string;
  url: string;
};

const EMPTY_API_KEYS: BusinessDashboardData["apiKeys"] = [];
const EMPTY_BUSINESS_REQUESTS: BusinessApiRequestRecord[] = [];
const EMPTY_BATCH_JOBS: BatchJobRecord[] = [];
const EMPTY_WEBHOOK_TESTS: WebhookTestEventRecord[] = [];

export function BusinessOnboardingClient({
  supportContact,
}: {
  supportContact: SupportContact;
}) {
  const user = useDashboardUser();
  const { data, error, loading, refresh } =
    useCachedJson<BusinessDashboardData>(
      "dashboard:api",
      "/api/dashboard/api-data",
      { pollMs: 60000 },
    );

  const businessRequests = data?.businessRequests ?? EMPTY_BUSINESS_REQUESTS;
  const apiKeys = data?.apiKeys ?? EMPTY_API_KEYS;
  const businessKeys = useMemo(() => {
    return apiKeys.filter(
      (key) =>
        key.maxConcurrentRequests !== null ||
        key.maxConcurrentJobs !== null ||
        key.maxQueuedJobs !== null,
    );
  }, [apiKeys]);
  const batchJobs = data?.batchJobs ?? EMPTY_BATCH_JOBS;
  const webhookTests = data?.webhookTests ?? EMPTY_WEBHOOK_TESTS;
  const latestRequest = businessRequests[0] ?? null;
  const approvedRequest =
    businessRequests.find((request) => request.status === "approved") ?? null;
  const activeKeys = apiKeys.filter((key) => !key.revokedAt);
  const cloneCreditsPerSecond =
    data?.apiAccess.cloneCreditsPerSecond ??
    approvedRequest?.appliedCloneCreditRate ??
    2;
  const apiJobs = batchJobs.filter((job) => job.source === "api_key");
  const cloneJobs = apiJobs.filter((job) => job.mode === "clone");
  const successfulCloneJob = cloneJobs.some(
    (job) => job.status === "completed" || job.status === "partial",
  );
  const deliveredWebhookTests = webhookTests.filter(
    (event) => event.deliveryStatus === "delivered",
  );

  const isApproved = data?.apiAccess.currentPlanName === "Business API";

  const steps: SetupStep[] = [
    {
      title: "Business access",
      body: data?.apiAccess.hasPaidApiAccess
        ? `Access is active. Plan: ${data.apiAccess.currentPlanName}.`
        : "Buy a paid token pack or contact us for Business API access. Free accounts cannot use API keys.",
      done: data?.apiAccess.hasPaidApiAccess ?? false,
      href: "/app/dashboard/billing",
      action: data?.apiAccess.hasPaidApiAccess
        ? "View billing"
        : "Open billing",
    },
    {
      title: "Create an API key",
      body:
        activeKeys.length > 0
          ? `${activeKeys.length} active API key(s) ready for your backend.`
          : "Your app needs an API key before it can call the TTS endpoints.",
      done: activeKeys.length > 0,
      href: "/app/dashboard/api",
      action: "Create key",
    },
    {
      title: "Business limits approved",
      body: getRequestStepText(latestRequest, approvedRequest),
      done: Boolean(approvedRequest),
      href: "#business-request-form",
      action: approvedRequest ? "View request" : "Send request",
    },
    {
      title: "Test before launch",
      body:
        successfulCloneJob && deliveredWebhookTests.length > 0
          ? "Clone batch and webhook test are done."
          : "Run one clone batch and one webhook test before real customer traffic.",
      done: successfulCloneJob && deliveredWebhookTests.length > 0,
      href: "/app/dashboard/api",
      action: "Open tests",
    },
  ];
  const completed = steps.filter((step) => step.done).length;
  const mainAction = getMainAction({
    hasPaidAccess: data?.apiAccess.hasPaidApiAccess ?? false,
    hasApiKey: activeKeys.length > 0,
    latestRequest,
    approvedRequest,
    testsDone: successfulCloneJob && deliveredWebhookTests.length > 0,
  });

  return (
    <section className="dashboard-enter grid gap-8 pb-12 min-w-0">
      {/* Header section */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end pb-6 border-b-4 border-primary">
        <div>
          <p className="text-xs font-label font-bold text-[#4a4a4a] uppercase tracking-widest mb-2">
            {isApproved
              ? "Developer Settings & Advanced Tools"
              : "Premium High-Volume Features"}
          </p>
          <h1 className="text-5xl md:text-6xl font-headline font-black uppercase tracking-tighter text-primary">
            Business API
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
          <Link
            href="/docs#batch"
            className="bg-white text-primary border-4 border-primary font-headline font-bold uppercase text-xs py-3 px-5 shadow-[4px_4px_0px_0px_#1a1a1a] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_#1a1a1a] transition-all"
          >
            API docs
          </Link>
          <Link
            href="/support"
            className="bg-white text-primary border-4 border-primary font-headline font-bold uppercase text-xs py-3 px-5 shadow-[4px_4px_0px_0px_#1a1a1a] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_#1a1a1a] transition-all"
          >
            Get help
          </Link>
          <a
            href={supportContact.url}
            target="_blank"
            rel="noreferrer"
            className="bg-[#1a1a1a] text-[#f5f0e8] border-4 border-primary font-headline font-bold uppercase text-xs py-3 px-5 shadow-[4px_4px_0px_0px_#1a1a1a] hover:bg-[#ffcc00] hover:text-primary transition-all flex items-center justify-center"
          >
            Telegram Admin
          </a>
        </div>
      </header>

      {error ? <InlineError message={error} /> : null}
      {loading && !data ? (
        <VoxLoader variant="panel" label="Loading Business API..." />
      ) : null}

      <div className={`grid gap-8 ${loading && !data ? "hidden" : ""}`}>
        {isApproved ? (
          /* Approved Business Dashboard View */
          <ApprovedBusinessDashboard
            key={`${businessKeys.length}:${webhookTests[0]?.createdAt ?? "none"}`}
            apiKeys={businessKeys}
            batchJobs={batchJobs}
            businessRequests={businessRequests}
            webhookTests={webhookTests}
            apiAccess={data.apiAccess}
          />
        ) : (
          /* Unapproved Onboarding / Application View */
          <>
            <UnlockBusinessCard />

            <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <MainStatusCard
                action={mainAction}
                completed={completed}
                total={steps.length}
                tokenBalance={user.tokenBalance}
                planName={data?.apiAccess.currentPlanName ?? "Free"}
                cloneRate={formatCloneCreditRate(cloneCreditsPerSecond)}
              />
              <PlainHelpCard />
            </section>

            <SetupChecklist steps={steps} />

            <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <BusinessRequestForm
                supportContact={supportContact}
                apiAccess={
                  data?.apiAccess ?? {
                    hasPaidApiAccess: false,
                    currentPlanName: "Free",
                    cloneCreditsPerSecond: 2,
                    businessLimits: null,
                  }
                }
                refresh={async () => {
                  clearDashboardCache("dashboard:api");
                  await refresh();
                }}
              />
              <BusinessRequestHistory requests={businessRequests} />
            </section>
          </>
        )}
      </div>
    </section>
  );
}

/* ==============================================
   APPROVED BUSINESS VIEW COMPONENTS
   ============================================== */

function ApprovedBusinessDashboard({
  apiKeys,
  batchJobs,
  businessRequests,
  webhookTests,
  apiAccess,
}: {
  apiKeys: BusinessDashboardData["apiKeys"];
  batchJobs: BatchJobRecord[];
  businessRequests: BusinessApiRequestRecord[];
  webhookTests: WebhookTestEventRecord[];
  apiAccess: BusinessDashboardData["apiAccess"];
}) {
  const [testEvents, setTestEvents] = useState(webhookTests);
  const [keysList, setKeysList] = useState(apiKeys);

  const stats = useMemo(() => {
    const apiJobs = batchJobs.filter((job) => job.source === "api_key");
    return {
      apiJobs: apiJobs.length,
      cloneJobs: apiJobs.filter((job) => job.mode === "clone").length,
      activeJobs: apiJobs.filter(
        (job) => job.status === "queued" || job.status === "running",
      ).length,
      deliveredWebhookTests: testEvents.filter(
        (event) => event.deliveryStatus === "delivered",
      ).length,
    };
  }, [batchJobs, testEvents]);

  const latestWebhookUrl = useMemo(() => {
    return (
      businessRequests.find((request) => request.webhookUrl)?.webhookUrl ?? ""
    );
  }, [businessRequests]);

  return (
    <section className="grid gap-8 min-w-0">
      {/* Metrics Row */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <BusinessMetric
          label="API batch jobs"
          value={stats.apiJobs.toLocaleString()}
          note="Created by API keys"
        />
        <BusinessMetric
          label="Clone jobs"
          value={stats.cloneJobs.toLocaleString()}
          note="Reference-audio batches"
        />
        <BusinessMetric
          label="Queued/running"
          value={stats.activeJobs.toLocaleString()}
          note="Worker still processing"
        />
        <BusinessMetric
          label="Clone rate"
          value={formatCloneCreditRate(apiAccess.cloneCreditsPerSecond)}
          note={apiAccess.currentPlanName}
        />
        <BusinessMetric
          label="Webhook tests"
          value={stats.deliveredWebhookTests.toLocaleString()}
          note="Delivered samples"
        />
      </div>

      {/* Webhook Test Panel */}
      <section className="grid gap-8 min-w-0">
        <WebhookTestPanel
          latestWebhookUrl={latestWebhookUrl}
          webhookTests={testEvents}
          onCreated={(event) => {
            setTestEvents((current) => [event, ...current].slice(0, 20));
            clearDashboardCache("dashboard:api");
          }}
        />
      </section>

      {/* Business Key Limits */}
      <KeyManager
        initialKeys={keysList}
        apiAccess={apiAccess}
        onKeysChange={setKeysList}
        isBusiness={true}
      />

      {/* Business Batch Jobs */}
      <section className="bg-white border-4 border-primary p-4 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative min-w-0">
        <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
          Business Batch Jobs
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 mt-2">
          <p className="text-sm text-[#4a4a4a] font-body">
            API-created batch and clone jobs, webhook status, external IDs, and
            throughput.
          </p>
          <Link
            href="/app/dashboard/jobs"
            className="bg-[#1a1a1a] text-[#f5f0e8] font-headline font-bold uppercase text-xs py-2.5 px-5 border-2 border-primary shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#ffcc00] hover:text-primary transition-all cursor-pointer"
          >
            Open Jobs
          </Link>
        </div>

        <div className="smooth-scroll-region overflow-auto border-4 border-primary shadow-[4px_4px_0px_0px_#1a1a1a] bg-white">
          <table className="w-full min-w-[1180px] text-left border-collapse">
            <thead>
              <tr className="bg-[#eee9e0] border-b-4 border-primary font-headline uppercase text-xs">
                <th className="p-3 border-r-4 border-primary">Updated</th>
                <th className="p-3 border-r-4 border-primary">Job</th>
                <th className="p-3 border-r-4 border-primary">Mode</th>
                <th className="p-3 border-r-4 border-primary">Status</th>
                <th className="p-3 border-r-4 border-primary">Items</th>
                <th className="p-3 border-r-4 border-primary">Tokens</th>
                <th className="p-3 border-r-4 border-primary">External ID</th>
                <th className="p-3">Webhook</th>
              </tr>
            </thead>
            <tbody className="font-body text-sm font-semibold">
              {batchJobs.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="p-8 text-center text-[#4a4a4a] bg-white"
                  >
                    No business batch jobs yet.
                  </td>
                </tr>
              ) : (
                batchJobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b-4 border-primary hover:bg-[#eee9e0]/40 transition-colors"
                  >
                    <td className="p-3 border-r-4 border-primary">
                      {formatDateTime(job.updatedAt)}
                    </td>
                    <td className="p-3 border-r-4 border-primary max-w-[240px]">
                      <p className="truncate font-semibold">{job.title}</p>
                      <p className="truncate font-mono text-xs text-[#4a4a4a]">
                        {job.id}
                      </p>
                    </td>
                    <td className="p-3 border-r-4 border-primary uppercase font-headline">
                      {job.mode}
                    </td>
                    <td className="p-3 border-r-4 border-primary">
                      <BatchStatusPill status={job.status} />
                    </td>
                    <td className="p-3 border-r-4 border-primary">
                      {job.completedItems}/{job.totalItems}
                      {job.failedItems > 0 ? `, ${job.failedItems} failed` : ""}
                    </td>
                    <td className="p-3 border-r-4 border-primary">
                      {job.creditsCharged.toLocaleString()}
                    </td>
                    <td className="p-3 border-r-4 border-primary max-w-[180px] truncate font-mono text-xs">
                      {job.externalId || "-"}
                    </td>
                    <td className="p-3 max-w-[220px]">
                      {job.webhookCallbackUrl ? (
                        <div className="grid gap-1">
                          <span className="font-semibold">
                            {job.webhookStatus ?? "pending"}
                          </span>
                          <span className="text-xs text-[#4a4a4a]">
                            {job.webhookAttempts.toLocaleString()} attempts
                            {job.webhookLastError
                              ? `: ${job.webhookLastError}`
                              : ""}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[#4a4a4a]">none</span>
                      )}
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

function WebhookTestPanel({
  latestWebhookUrl,
  webhookTests,
  onCreated,
}: {
  latestWebhookUrl: string;
  webhookTests: WebhookTestEventRecord[];
  onCreated: (event: WebhookTestEventRecord) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      webhookUrl: readFormText(formData, "webhookUrl"),
      eventType:
        readFormText(formData, "eventType") === "failed"
          ? "failed"
          : "completed",
    };

    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/business/webhook-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        event?: WebhookTestEventRecord;
        error?: string;
      };
      if (!response.ok || !data.event) {
        throw new Error(data.error ?? "Could not send webhook test.");
      }
      onCreated(data.event);
      setMessage({
        type: data.event.deliveryStatus === "delivered" ? "success" : "error",
        text:
          data.event.deliveryStatus === "delivered"
            ? `Webhook delivered in ${data.event.latencyMs.toLocaleString()}ms.`
            : (data.event.errorMessage ?? "Webhook test failed."),
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not send webhook test.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-white border-4 border-primary p-4 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative min-w-0">
      <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
        Webhook Test Center
      </div>
      <p className="text-sm text-[#4a4a4a] font-body mb-6 mt-2">
        Send a signed sample completed/failed callback before using batch clone
        jobs.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="grid gap-1 text-sm font-headline font-bold uppercase text-primary">
          Webhook URL
          <input
            name="webhookUrl"
            required
            type="url"
            maxLength={2048}
            defaultValue={latestWebhookUrl}
            placeholder="https://example.com/voxtts/webhook"
            className="w-full border-[3px] border-primary bg-white p-2 font-body text-primary focus:outline-none focus:border-[#0055ff] transition-colors"
          />
        </label>
        <label className="grid gap-1 text-sm font-headline font-bold uppercase text-primary">
          Event
          <div className="relative">
            <select
              name="eventType"
              defaultValue="completed"
              className="w-full border-[3px] border-primary bg-white p-2 font-body text-primary appearance-none focus:outline-none focus:border-[#0055ff] transition-colors cursor-pointer"
            >
              <option value="completed">completed</option>
              <option value="failed">failed</option>
            </select>
            <span className="material-symbols-outlined absolute right-3 top-2.5 pointer-events-none select-none">
              expand_more
            </span>
          </div>
        </label>
        {message ? (
          <p
            className={`border-2 border-primary p-3 text-xs font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] ${
              message.type === "success"
                ? "bg-[#def3e5] text-emerald-800"
                : "bg-[#ffdad6] text-[#93000a]"
            }`}
          >
            {message.text}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="bg-[#1a1a1a] text-[#f5f0e8] font-headline font-bold uppercase text-xs py-2.5 px-6 border-2 border-primary shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#ffcc00] hover:text-primary transition-all cursor-pointer disabled:opacity-50"
        >
          {submitting ? "Sending..." : "Send Webhook Test"}
        </button>
      </form>

      <div className="smooth-scroll-region overflow-auto border-4 border-primary shadow-[4px_4px_0px_0px_#1a1a1a] bg-white mt-6">
        <table className="w-full min-w-[620px] text-left border-collapse">
          <thead>
            <tr className="bg-[#eee9e0] border-b-4 border-primary font-headline uppercase text-xs">
              <th className="p-3 border-r-4 border-primary">Time</th>
              <th className="p-3 border-r-4 border-primary">Event</th>
              <th className="p-3 border-r-4 border-primary">Status</th>
              <th className="p-3 border-r-4 border-primary">HTTP</th>
              <th className="p-3">Latency</th>
            </tr>
          </thead>
          <tbody className="font-body text-sm font-semibold">
            {webhookTests.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="p-6 text-center text-[#4a4a4a] bg-white"
                >
                  No webhook tests yet.
                </td>
              </tr>
            ) : (
              webhookTests.slice(0, 8).map((event) => (
                <tr
                  key={event.id}
                  className="border-b-4 border-primary hover:bg-[#eee9e0]/40 transition-colors"
                >
                  <td className="p-3 border-r-4 border-primary">
                    {formatDateTime(event.createdAt)}
                  </td>
                  <td className="p-3 border-r-4 border-primary">
                    {event.eventType}
                  </td>
                  <td className="p-3 border-r-4 border-primary">
                    <WebhookStatusPill status={event.deliveryStatus} />
                    {event.errorMessage ? (
                      <p className="mt-1 max-w-[260px] truncate text-xs text-red-700">
                        {event.errorMessage}
                      </p>
                    ) : null}
                  </td>
                  <td className="p-3 border-r-4 border-primary">
                    {event.httpStatus ?? "-"}
                  </td>
                  <td className="p-3">{event.latencyMs.toLocaleString()}ms</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BusinessMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="bg-white border-4 border-primary p-4 shadow-[4px_4px_0px_0px_#1a1a1a] relative">
      <p className="text-xs font-headline font-bold uppercase tracking-wider text-[#4a4a4a]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-headline font-black leading-none text-primary">
        {value}
      </p>
      <p className="mt-2 text-xs text-[#4a4a4a] font-body">{note}</p>
    </article>
  );
}

/* ==============================================
   UNAPPROVED ONBOARDING & REQUEST COMPONENTS
   ============================================== */

function UnlockBusinessCard() {
  return (
    <article className="bg-[#ffcc00] border-4 border-primary p-6 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative text-primary">
      <h3 className="text-2xl font-headline font-black uppercase tracking-tight mb-2">
        Unlock Business API
      </h3>
      <div className="font-body text-sm space-y-3 font-semibold text-[#1a1a1a]">
        <p>
          Need production-grade throughput? The Business API provides advanced
          features tailored for developers and businesses:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Higher Rates:</strong> Dedicated throughput up to 100
            concurrent requests.
          </li>
          <li>
            <strong>Lower Clone Rates:</strong> Highly optimized 1.5 tokens per
            generated second clone rate.
          </li>
          <li>
            <strong>Batch &amp; Voice Clone Jobs:</strong> Process massive voice
            cloning tasks asynchronously.
          </li>
          <li>
            <strong>Webhook Callbacks:</strong> Get status notifications pushed
            directly to your server.
          </li>
        </ul>
        <p className="pt-2">
          Fill out the access request form below. Our administrative team will
          review your application and adjust your limits.
        </p>
      </div>
    </article>
  );
}

function MainStatusCard({
  action,
  completed,
  total,
  tokenBalance,
  planName,
  cloneRate,
}: {
  action: MainAction;
  completed: number;
  total: number;
  tokenBalance: number;
  planName: string;
  cloneRate: string;
}) {
  const percent = Math.round((completed / total) * 100);

  return (
    <article className="bg-[#1a1a1a] border-4 border-primary p-6 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative text-white flex flex-col justify-between h-full">
      <div>
        <span
          className={`inline-flex border-2 border-white px-3 py-1 text-xs font-headline font-bold uppercase tracking-wider ${
            action.tone === "ready" || action.tone === "active"
              ? "bg-[#10b981] text-primary"
              : "bg-[#e63b2e] text-[#f5f0e8]"
          }`}
        >
          {action.badge}
        </span>
        <h2 className="mt-4 text-3xl font-headline font-black uppercase tracking-tight leading-none">
          {action.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#ccc5b9] font-body">
          {action.body}
        </p>

        <div className="mt-6 h-4 border-2 border-white bg-white/10 relative overflow-hidden">
          <div
            className="h-full bg-[#ffcc00]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-[#ccc5b9] font-headline uppercase font-bold">
          {percent}% Completed
        </p>

        <div className="mt-6 grid gap-3 grid-cols-2">
          <SmallDarkStat
            label="Setup Status"
            value={`${completed}/${total} done`}
          />
          <SmallDarkStat label="Current Plan" value={planName} />
          <SmallDarkStat
            label="Available Tokens"
            value={tokenBalance.toLocaleString()}
          />
          <SmallDarkStat label="Clone Credit Rate" value={cloneRate} />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3 pt-4 border-t border-white/20">
        <Link
          href={action.href}
          className="bg-[#ffcc00] text-primary font-headline font-bold uppercase text-xs py-3 px-5 border-2 border-primary shadow-[2px_2px_0px_0px_#fff] hover:bg-white hover:text-primary transition-all"
        >
          {action.action}
        </Link>
        <Link
          href="/app/dashboard/api"
          className="bg-transparent text-white border-2 border-white font-headline font-bold uppercase text-xs py-3 px-5 hover:bg-white/10 transition-all"
        >
          API keys page
        </Link>
      </div>
    </article>
  );
}

function PlainHelpCard() {
  return (
    <article className="bg-[#eee9e0] border-4 border-primary p-6 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] h-full flex flex-col justify-between">
      <div>
        <p className="text-xs font-headline font-bold uppercase tracking-wider text-[#4a4a4a]">
          Simple explanation
        </p>
        <h2 className="mt-2 text-2xl font-headline font-black uppercase text-primary">
          What is Business API?
        </h2>
        <div className="mt-4 space-y-4 text-sm font-semibold leading-relaxed text-[#1a1a1a] font-body">
          <p className="border-l-4 border-primary pl-3">
            <strong>Business API</strong> is for customers who need high-volume
            automated speech generation and voice cloning from their own backend
            systems.
          </p>
          <p className="border-l-4 border-primary pl-3">
            <strong>Business Clone Rate:</strong> Once approved, the voice
            cloning credit rate drops to a dedicated{" "}
            <strong>1.5 tokens/sec</strong> (or lower for high prepaid tiers).
          </p>
          <p className="border-l-4 border-primary pl-3">
            <strong>Webhook Callbacks:</strong> Get automatic status
            notifications on your server as soon as batch jobs complete.
          </p>
        </div>
      </div>
      <div className="pt-4 mt-6 border-t-2 border-primary/20">
        <p className="text-xs text-[#4a4a4a] font-body">
          *Admin review is required to set safe rate limits and enable advanced
          capabilities.
        </p>
      </div>
    </article>
  );
}

function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  return (
    <section className="bg-white border-4 border-primary p-4 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative min-w-0">
      <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
        Do these 4 steps
      </div>
      <p className="text-sm text-[#4a4a4a] font-body mb-6 mt-2">
        Easy checklist to prepare your application for voice cloning and
        callback webhooks.
      </p>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => (
          <article
            key={step.title}
            className="bg-white border-4 border-primary p-4 shadow-[4px_4px_0px_0px_#1a1a1a] flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-3 border-b-2 border-primary pb-3 mb-3">
                <span
                  className={`flex h-9 w-9 items-center justify-center border-2 border-primary font-headline font-bold uppercase text-sm ${step.done ? "bg-[#10b981] text-primary" : "bg-[#eee9e0] text-[#1a1a1a]"}`}
                >
                  {step.done ? "✓" : index + 1}
                </span>
                <span
                  className={`border-2 border-primary px-2 py-0.5 text-xs font-headline font-bold uppercase ${step.done ? "bg-[#def3e5] text-emerald-800" : "bg-[#ffdad6] text-[#93000a]"}`}
                >
                  {step.done ? "done" : "todo"}
                </span>
              </div>
              <h3 className="font-headline font-bold uppercase text-base text-primary">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#4a4a4a] font-body">
                {step.body}
              </p>
            </div>
            <Link
              href={step.href}
              className="mt-4 w-full bg-[#1a1a1a] text-[#f5f0e8] font-headline font-bold uppercase text-xs py-2 px-3 border-2 border-primary shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#ffcc00] hover:text-primary transition-all text-center"
            >
              {step.action}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function BusinessRequestForm({
  supportContact,
  refresh,
  apiAccess,
}: {
  supportContact: SupportContact;
  refresh: () => Promise<void>;
  apiAccess: BusinessDashboardData["apiAccess"];
}) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      companyName: readFormText(formData, "companyName"),
      appName: readFormText(formData, "appName"),
      useCase: readFormText(formData, "useCase"),
      expectedMonthlyTokens: readFormInt(formData, "expectedMonthlyTokens"),
      expectedPeakConcurrency: readFormInt(formData, "expectedPeakConcurrency"),
      webhookUrl: readOptionalFormText(formData, "webhookUrl"),
      contactTelegram: readOptionalFormText(formData, "contactTelegram"),
      contactEmail: readOptionalFormText(formData, "contactEmail") || undefined,
    };

    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/business/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not submit business request.");
      }
      form.reset();
      await refresh();
      setMessage({
        type: "success",
        text: "Request sent. Admin will review it before production launch.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not submit business request.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      id="business-request-form"
      className="bg-white border-4 border-primary p-4 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative min-w-0"
    >
      <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
        Business Access Request
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 mt-2 mb-6 border-b-2 border-primary pb-4">
        <p className="text-sm text-[#4a4a4a] font-body">
          Request higher token caps, queue limits, and webhook support for
          production API use.
        </p>
        <span className="bg-[#f5f0e8] border-2 border-primary px-2 py-0.5 text-xs font-bold uppercase font-headline text-primary">
          {apiAccess.currentPlanName}
        </span>
      </div>

      {!apiAccess.hasPaidApiAccess ? (
        <p className="border-2 border-primary bg-[#ffdad6] p-3 text-xs font-bold text-[#93000a] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] mb-4">
          Free accounts can prepare a request, but API keys stay disabled until
          payment/admin approval.
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput
            name="companyName"
            label="Company or customer name"
            placeholder="Khmer Vox customer system"
            required
          />
          <TextInput
            name="appName"
            label="App or product name"
            placeholder="Dubbing dashboard"
            required
          />
        </div>
        <label className="grid gap-1 text-sm font-headline font-bold uppercase text-primary">
          What will you build?
          <textarea
            name="useCase"
            required
            minLength={20}
            maxLength={2000}
            rows={4}
            placeholder="Describe expected clone voice usage, batch size, customers, and callback needs."
            className="w-full border-[3px] border-primary bg-white p-2 font-body text-primary focus:outline-none focus:border-[#0055ff] transition-colors resize-y"
          />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <NumberInput
            name="expectedMonthlyTokens"
            label="Estimated monthly tokens"
            defaultValue={100000}
            max={100000000}
          />
          <NumberInput
            name="expectedPeakConcurrency"
            label="Jobs at the same time"
            defaultValue={3}
            max={100}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput
            name="webhookUrl"
            label="Webhook URL (optional)"
            placeholder="https://your-app.com/tts-callback"
            type="url"
          />
          <TextInput
            name="contactTelegram"
            label="Telegram (optional)"
            placeholder="@username"
          />
        </div>
        <TextInput
          name="contactEmail"
          label="Contact email"
          placeholder="Leave blank to use your account email"
          type="email"
        />
        {message ? <FormMessage message={message} /> : null}

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="bg-[#1a1a1a] text-[#f5f0e8] font-headline font-bold uppercase text-xs py-2.5 px-6 border-2 border-primary shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#ffcc00] hover:text-primary transition-all cursor-pointer disabled:opacity-50"
          >
            {submitting ? "Sending..." : "Submit request"}
          </button>
          <a
            href={supportContact.url}
            target="_blank"
            rel="noreferrer"
            className="bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-2.5 px-5 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#eee9e0] transition-all flex items-center justify-center"
          >
            Telegram Admin
          </a>
        </div>
      </form>
    </section>
  );
}

function BusinessRequestHistory({
  requests,
}: {
  requests: BusinessApiRequestRecord[];
}) {
  return (
    <section className="bg-white border-4 border-primary p-4 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative h-full flex flex-col min-w-0">
      <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
        Business Request Status
      </div>
      <p className="text-sm text-[#4a4a4a] font-body mb-6 mt-2 border-b-2 border-primary pb-4">
        Admin review history and approved limits for your account.
      </p>

      <div className="flex-1 space-y-4 overflow-y-auto max-h-[550px] pr-2 smooth-scroll-region">
        {requests.length === 0 ? (
          <div className="border-4 border-dashed border-primary/30 p-8 text-center bg-[#fafbfe]">
            <p className="font-headline font-bold text-base text-primary">
              No request sent yet.
            </p>
            <p className="mt-2 text-sm leading-6 text-[#6a7282] font-body">
              Send the form on the left. After admin approval, your custom
              high-volume Business limits will appear here.
            </p>
          </div>
        ) : (
          requests.map((request) => (
            <article
              key={request.id}
              className="bg-white border-3 border-primary p-4 shadow-[3px_3px_0px_0px_#1a1a1a]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-primary pb-3 mb-3">
                <div>
                  <h3 className="font-headline font-bold uppercase text-base text-primary">
                    {request.appName}
                  </h3>
                  <p className="text-xs text-[#4a4a4a] font-body">
                    {request.companyName}
                  </p>
                </div>
                <StatusPill value={request.status} />
              </div>
              <p className="text-sm leading-relaxed text-[#1a1a1a] font-body font-semibold">
                {request.status === "approved"
                  ? "Approved! You can now start using your high-volume developer limits."
                  : request.status === "rejected"
                    ? "Not approved. Contact admin on Telegram for options."
                    : "Review pending. Our admin team will check this within 24 hours."}
              </p>
              <div className="mt-3 space-y-1.5 text-xs text-[#4a4a4a] font-body leading-5 border-t border-primary/20 pt-3">
                <p>
                  Expected monthly tokens:{" "}
                  <strong>
                    {request.expectedMonthlyTokens.toLocaleString()}
                  </strong>
                </p>
                {request.appliedCloneCreditRate ? (
                  <p>
                    Approved clone rate:{" "}
                    <strong>
                      {formatCloneCreditRate(request.appliedCloneCreditRate)}
                    </strong>
                  </p>
                ) : null}
                <p>
                  Submitted:{" "}
                  <strong>{formatDateTime(request.createdAt)}</strong>
                </p>
              </div>
              {request.adminNote ? (
                <p className="mt-3 bg-[#eee9e0] border-2 border-primary p-2.5 text-xs text-primary font-body">
                  <strong>Admin note:</strong> {request.adminNote}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

/* ==============================================
   GENERIC HELPER COMPONENTS & UTILS
   ============================================== */

function BatchStatusPill({ status }: { status: BatchJobRecord["status"] }) {
  const className =
    status === "completed"
      ? "bg-[#10b981] text-primary"
      : status === "failed"
        ? "bg-[#e63b2e] text-[#f5f0e8]"
        : status === "needs_review"
          ? "bg-[#0055ff] text-[#f5f0e8]"
          : status === "partial"
            ? "bg-[#ffcc00] text-primary"
            : "bg-[#e8e3da] text-primary";
  return (
    <span
      className={`inline-block px-2 py-0.5 border-2 border-primary font-label text-xs uppercase ${className}`}
    >
      {status}
    </span>
  );
}

function WebhookStatusPill({
  status,
}: {
  status: WebhookTestEventRecord["deliveryStatus"];
}) {
  const className =
    status === "delivered"
      ? "bg-[#10b981] text-primary"
      : "bg-[#e63b2e] text-[#f5f0e8]";
  return (
    <span
      className={`inline-block px-2 py-0.5 border-2 border-primary font-label text-xs uppercase ${className}`}
    >
      {status}
    </span>
  );
}

function StatusPill({ value }: { value: BusinessApiRequestRecord["status"] }) {
  const className =
    value === "approved"
      ? "bg-[#10b981] text-primary"
      : value === "rejected"
        ? "bg-[#e63b2e] text-[#f5f0e8]"
        : "bg-[#ffcc00] text-primary";
  return (
    <span
      className={`inline-block px-2.5 py-0.5 border-2 border-primary font-label text-xs uppercase ${className}`}
    >
      {value}
    </span>
  );
}

function SmallDarkStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-white/10 bg-white/5 p-3">
      <p className="text-xs font-headline font-bold uppercase tracking-wider text-[#ccc5b9]">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-headline font-bold text-white">
        {value}
      </p>
    </div>
  );
}

function TextInput({
  name,
  label,
  placeholder,
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  placeholder: string;
  type?: "text" | "url" | "email";
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-headline font-bold uppercase text-primary">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        minLength={required ? 2 : undefined}
        maxLength={type === "url" ? 2048 : 180}
        placeholder={placeholder}
        className="w-full border-[3px] border-primary bg-white p-2 font-body text-primary focus:outline-none focus:border-[#0055ff] transition-colors"
      />
    </label>
  );
}

function NumberInput({
  name,
  label,
  defaultValue,
  max,
}: {
  name: string;
  label: string;
  defaultValue: number;
  max: number;
}) {
  return (
    <label className="grid gap-1 text-sm font-headline font-bold uppercase text-primary">
      {label}
      <input
        name={name}
        required
        type="number"
        min={1}
        max={max}
        defaultValue={defaultValue}
        className="w-full border-[3px] border-primary bg-white p-2 font-body text-primary focus:outline-none focus:border-[#0055ff] transition-colors"
      />
    </label>
  );
}

function FormMessage({
  message,
}: {
  message: { type: "success" | "error"; text: string };
}) {
  return (
    <p
      className={`border-2 border-primary p-3 text-xs font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] ${
        message.type === "success"
          ? "border border-emerald-200 bg-[#def3e5] text-emerald-800"
          : "border border-red-200 bg-[#ffdad6] text-[#93000a]"
      }`}
    >
      {message.text}
    </p>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p className="border-2 border-[#e63b2e] bg-[#ffdad6] text-[#93000a] p-3 text-xs font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
      {message}
    </p>
  );
}

function getRequestStepText(
  latestRequest: BusinessApiRequestRecord | null,
  approvedRequest: BusinessApiRequestRecord | null,
) {
  if (approvedRequest) return "Admin approved your business request.";
  if (latestRequest?.status === "pending")
    return "Request sent. Admin is reviewing it.";
  if (latestRequest?.status === "rejected")
    return "Request was not approved. Contact support and submit again.";
  return "Tell us your expected usage so admin can set safe limits.";
}

function getMainAction({
  hasPaidAccess,
  hasApiKey,
  latestRequest,
  approvedRequest,
  testsDone,
}: {
  hasPaidAccess: boolean;
  hasApiKey: boolean;
  latestRequest: BusinessApiRequestRecord | null;
  approvedRequest: BusinessApiRequestRecord | null;
  testsDone: boolean;
}): MainAction {
  if (!hasPaidAccess) {
    return {
      badge: "Need access",
      title: "Buy API tokens first",
      body: "Business API is only available for paid users. Buy a token pack, then create your API key.",
      href: "/app/dashboard/billing",
      action: "Open billing",
      tone: "blocked",
    };
  }
  if (!hasApiKey) {
    return {
      badge: "Access active",
      title: "Create an API key to start using Business API",
      body: "Your Business API access is active. Your app still needs an API key before it can call the clone voice and batch endpoints.",
      href: "/app/dashboard/api",
      action: "Create API key",
      tone: "active",
    };
  }
  if (!latestRequest) {
    return {
      badge: "Access active",
      title: "Send a business limits request",
      body: "Your paid API access is active. Tell us your monthly usage and same-time job needs so admin can set safer high-volume limits.",
      href: "#business-request-form",
      action: "Send request",
      tone: "active",
    };
  }
  if (!approvedRequest) {
    return {
      badge: "Admin review",
      title: "Admin is reviewing your request",
      body: "You can still test the API, but wait for approval before sending high-volume customer traffic.",
      href: "/support",
      action: "Contact support",
      tone: "review",
    };
  }
  if (!testsDone) {
    return {
      badge: "Access active",
      title: "Test before real customers",
      body: "Run one clone batch and one webhook test so you know your app receives completed audio correctly.",
      href: "/app/dashboard/api",
      action: "Open tests",
      tone: "test",
    };
  }
  return {
    badge: "Ready",
    title: "Business API is ready",
    body: "Your account is ready for controlled production use. Monitor jobs and token usage during launch.",
    href: "/app/dashboard/jobs",
    action: "View jobs",
    tone: "ready",
  };
}

function formatDateTime(input: string | null | undefined): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function readFormText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalFormText(formData: FormData, key: string): string | null {
  return readFormText(formData, key) || null;
}

function readFormInt(formData: FormData, key: string): number {
  const value = Number(readFormText(formData, key));
  return Number.isFinite(value) ? Math.round(value) : 0;
}
