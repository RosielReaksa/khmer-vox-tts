"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { KeyManager } from "@/app/app/dashboard/key-manager";
import { clearDashboardCache } from "@/app/app/dashboard/dashboard-data-cache";
import { formatCloneCreditRate } from "@/lib/credit-rates";
import type {
  BatchJobRecord,
  BusinessApiRequestRecord,
  GenerationMode,
  GenerationSource,
  GenerationStatus,
  WebhookTestEventRecord,
} from "@/lib/types";

type ApiKeyItem = {
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
};

type RequestLogItem = {
  id: string;
  createdAt: string;
  mode: GenerationMode;
  source: GenerationSource;
  status: GenerationStatus;
  inputChars: number;
  inputPreview: string;
  outputSeconds: number;
  creditsCharged: number;
};

type ApiTabsProps = {
  initialKeys: ApiKeyItem[];
  requestLogs: RequestLogItem[];
  batchJobs: BatchJobRecord[];
  businessRequests: BusinessApiRequestRecord[];
  webhookTests: WebhookTestEventRecord[];
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
};

type ActiveTab = "keys" | "logs";

export function ApiTabs({
  initialKeys,
  requestLogs,
  batchJobs,
  businessRequests,
  webhookTests,
  apiAccess,
}: ApiTabsProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("keys");
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>(initialKeys);

  // Sync the key list when fresh server data arrives (e.g. after a poll or
  // cache invalidation). Previously the parent forced a full remount via a
  // changing `key` prop to push new data in, but that also destroyed the
  // one-time raw-key reveal panel before the user could copy it. Syncing via
  // effect keeps KeyManager mounted so the reveal + its 5-minute timer survive.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setApiKeys(initialKeys);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [initialKeys]);

  return (
    <section className="grid gap-6">
      <div
        role="tablist"
        aria-label="API tools"
        className="flex flex-wrap gap-4"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "keys"}
          aria-controls="api-keys-panel"
          onClick={() => setActiveTab("keys")}
          className={tabClass(activeTab === "keys")}
        >
          API Keys
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "logs"}
          aria-controls="request-logs-panel"
          onClick={() => setActiveTab("logs")}
          className={tabClass(activeTab === "logs")}
        >
          Request Logs
        </button>
      </div>

      <div id="api-keys-panel" role="tabpanel" hidden={activeTab !== "keys"}>
        <KeyManager initialKeys={apiKeys} apiAccess={apiAccess} onKeysChange={setApiKeys} isBusiness={false} />
      </div>

      <div id="request-logs-panel" role="tabpanel" hidden={activeTab !== "logs"}>
        <RequestLogsTable requestLogs={requestLogs} />
      </div>
    </section>
  );
}

function UnlockBusinessCard() {
  return (
    <article className="bg-[#ffcc00] border-4 border-primary p-6 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative text-primary">
      <h3 className="text-2xl font-headline font-black uppercase tracking-tight mb-2">
        Unlock Business API
      </h3>
      <div className="font-body text-sm space-y-3 font-semibold text-[#1a1a1a]">
        <p>
          Need production-grade throughput? The Business API provides advanced features tailored for developers and businesses:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Higher Rates:</strong> Dedicated throughput up to 100 concurrent requests.</li>
          <li><strong>Lower Clone Rates:</strong> Highly optimized 1.5 tokens per generated second clone rate.</li>
          <li><strong>Batch &amp; Voice Clone Jobs:</strong> Process massive voice cloning tasks asynchronously.</li>
          <li><strong>Webhook Callbacks:</strong> Get status notifications pushed directly to your server.</li>
        </ul>
        <p className="pt-2">
          Fill out the access request form below. Our administrative team will review your application and adjust your limits.
        </p>
      </div>
    </article>
  );
}

function BusinessApiPanel({
  apiKeys,
  batchJobs,
  businessRequests,
  webhookTests,
  apiAccess,
  onCreateKey,
}: {
  apiKeys: ApiKeyItem[];
  batchJobs: BatchJobRecord[];
  businessRequests: BusinessApiRequestRecord[];
  webhookTests: WebhookTestEventRecord[];
  apiAccess: ApiTabsProps["apiAccess"];
  onCreateKey: () => void;
}) {
  const [testEvents, setTestEvents] = useState(webhookTests);
  const [requestsList, setRequestsList] = useState(businessRequests);

  const stats = useMemo(() => {
    const apiJobs = batchJobs.filter((job) => job.source === "api_key");
    return {
      apiJobs: apiJobs.length,
      cloneJobs: apiJobs.filter((job) => job.mode === "clone").length,
      activeJobs: apiJobs.filter((job) => job.status === "queued" || job.status === "running").length,
      deliveredWebhookTests: testEvents.filter((event) => event.deliveryStatus === "delivered").length,
    };
  }, [batchJobs, testEvents]);

  const latestWebhookUrl = useMemo(() => {
    return requestsList.find((request) => request.webhookUrl)?.webhookUrl ?? "";
  }, [requestsList]);

  // If approved Business user:
  if (apiAccess.currentPlanName === "Business API") {
    return (
      <section className="grid gap-8 min-w-0">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <BusinessMetric label="API batch jobs" value={stats.apiJobs.toLocaleString()} note="Created by API keys" />
          <BusinessMetric label="Clone jobs" value={stats.cloneJobs.toLocaleString()} note="Reference-audio batches" />
          <BusinessMetric label="Queued/running" value={stats.activeJobs.toLocaleString()} note="Worker still processing" />
          <BusinessMetric label="Clone rate" value={formatCloneCreditRate(apiAccess.cloneCreditsPerSecond)} note={apiAccess.currentPlanName} />
          <BusinessMetric label="Webhook tests" value={stats.deliveredWebhookTests.toLocaleString()} note="Delivered samples" />
        </div>

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

        <section className="bg-white border-4 border-primary p-4 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative min-w-0">
          <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
            Business Key Limits
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 mt-2">
            <p className="text-sm text-[#4a4a4a] font-body">
              Daily/monthly token caps and concurrency settings applied to each API key.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onCreateKey}
                className="bg-[#1a1a1a] text-[#f5f0e8] font-headline font-bold uppercase text-xs py-2.5 px-5 border-2 border-primary shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#ffcc00] hover:text-primary transition-all cursor-pointer"
              >
                Create API key
              </button>
              <Link
                href="/docs#batch"
                className="bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-2.5 px-5 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#eee9e0] transition-all"
              >
                Batch API docs
              </Link>
            </div>
          </div>

          <div className="smooth-scroll-region overflow-auto border-4 border-primary shadow-[4px_4px_0px_0px_#1a1a1a] bg-white">
            <table className="w-full min-w-[1040px] text-left border-collapse">
              <thead>
                <tr className="bg-[#eee9e0] border-b-4 border-primary font-headline uppercase text-xs">
                  <th className="p-3 border-r-4 border-primary">Key</th>
                  <th className="p-3 border-r-4 border-primary">Prefix</th>
                  <th className="p-3 border-r-4 border-primary">Requests</th>
                  <th className="p-3 border-r-4 border-primary">Daily tokens</th>
                  <th className="p-3 border-r-4 border-primary">Monthly tokens</th>
                  <th className="p-3 border-r-4 border-primary">Concurrent requests</th>
                  <th className="p-3 border-r-4 border-primary">Running jobs</th>
                  <th className="p-3 border-r-4 border-primary">Queued jobs</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="font-body text-sm font-semibold">
                {apiKeys.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-[#4a4a4a] bg-white">
                      <div className="grid justify-items-center gap-3">
                        <div>
                          <p className="font-headline font-bold text-base text-primary">No API keys yet.</p>
                          <p className="mt-1 text-sm text-[#4a4a4a]">
                            Create one API key before your business app can call TTS endpoints.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={onCreateKey}
                          className="bg-[#1a1a1a] text-[#f5f0e8] font-headline font-bold uppercase text-xs py-2.5 px-5 border-2 border-primary shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#ffcc00] hover:text-primary transition-all cursor-pointer"
                        >
                          Create API key
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  apiKeys.map((key) => (
                    <tr key={key.id} className="border-b-4 border-primary hover:bg-[#eee9e0]/40 transition-colors">
                      <td className="p-3 border-r-4 border-primary font-headline text-base">{key.name}</td>
                      <td className="p-3 border-r-4 border-primary font-mono text-xs">{key.keyPrefix}</td>
                      <td className="p-3 border-r-4 border-primary">{key.requestCount.toLocaleString()}</td>
                      <td className="p-3 border-r-4 border-primary">{formatLimit(key.dailyTokenLimit)}</td>
                      <td className="p-3 border-r-4 border-primary">{formatLimit(key.monthlyTokenLimit)}</td>
                      <td className="p-3 border-r-4 border-primary">{formatLimit(key.maxConcurrentRequests)}</td>
                      <td className="p-3 border-r-4 border-primary">{formatLimit(key.maxConcurrentJobs)}</td>
                      <td className="p-3 border-r-4 border-primary">{formatLimit(key.maxQueuedJobs)}</td>
                      <td className="p-3">
                        <span className={`inline-block px-2 py-0.5 border-2 border-primary font-label text-xs uppercase ${
                          key.revokedAt ? "bg-[#e63b2e] text-[#f5f0e8]" : "bg-[#10b981] text-primary"
                        }`}>
                          {key.revokedAt ? "revoked" : "active"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border-4 border-primary p-6 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative">
          <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
            Business Batch Jobs
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 mt-2">
            <p className="text-sm text-[#4a4a4a] font-body">
              API-created batch and clone jobs, webhook status, external IDs, and throughput.
            </p>
            <a
              href="/app/dashboard/jobs"
              onClick={(e) => {
                e.preventDefault();
                const spaNav = document.querySelector('aside a[title="Batch Jobs"]') as HTMLAnchorElement | null;
                spaNav?.click();
              }}
              className="bg-[#1a1a1a] text-[#f5f0e8] font-headline font-bold uppercase text-xs py-2.5 px-5 border-2 border-primary shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#ffcc00] hover:text-primary transition-all cursor-pointer"
            >
              Open Jobs
            </a>
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
                    <td colSpan={8} className="p-8 text-center text-[#4a4a4a] bg-white">
                      No business batch jobs yet.
                    </td>
                  </tr>
                ) : (
                  batchJobs.map((job) => (
                    <tr key={job.id} className="border-b-4 border-primary hover:bg-[#eee9e0]/40 transition-colors">
                      <td className="p-3 border-r-4 border-primary">{formatDateTime(job.updatedAt)}</td>
                      <td className="p-3 border-r-4 border-primary max-w-[240px]">
                        <p className="truncate font-semibold">{job.title}</p>
                        <p className="truncate font-mono text-xs text-[#4a4a4a]">{job.id}</p>
                      </td>
                      <td className="p-3 border-r-4 border-primary uppercase font-headline">{job.mode}</td>
                      <td className="p-3 border-r-4 border-primary">
                        <BatchStatusPill status={job.status} />
                      </td>
                      <td className="p-3 border-r-4 border-primary">
                        {job.completedItems}/{job.totalItems}
                        {job.failedItems > 0 ? `, ${job.failedItems} failed` : ""}
                      </td>
                      <td className="p-3 border-r-4 border-primary">{job.creditsCharged.toLocaleString()}</td>
                      <td className="p-3 border-r-4 border-primary max-w-[180px] truncate font-mono text-xs">
                        {job.externalId || "-"}
                      </td>
                      <td className="p-3 max-w-[220px]">
                        {job.webhookCallbackUrl ? (
                          <div className="grid gap-1">
                            <span className="font-semibold">{job.webhookStatus ?? "pending"}</span>
                            <span className="text-xs text-[#4a4a4a]">
                              {job.webhookAttempts.toLocaleString()} attempts
                              {job.webhookLastError ? `: ${job.webhookLastError}` : ""}
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

  // If normal/standard user:
  return (
    <section className="grid gap-8">
      <UnlockBusinessCard />
      <BusinessRequestForm
        apiAccess={apiAccess}
        onCreated={(newRequest) => {
          setRequestsList((curr) => [newRequest, ...curr]);
          clearDashboardCache("dashboard:api");
        }}
      />
      <BusinessRequestHistory requests={requestsList} />
    </section>
  );
}

function BusinessRequestForm({
  apiAccess,
  onCreated,
}: {
  apiAccess: ApiTabsProps["apiAccess"];
  onCreated: (request: BusinessApiRequestRecord) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
        request?: BusinessApiRequestRecord;
        error?: string;
      };
      if (!response.ok || !data.request) {
        throw new Error(data.error ?? "Could not submit business request.");
      }
      onCreated(data.request);
      form.reset();
      setMessage({ type: "success", text: "Business API request submitted for admin review." });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Could not submit business request.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-white border-4 border-primary p-6 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative">
      <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
        Business Access Request
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 mt-2 mb-6">
        <p className="text-sm text-[#4a4a4a] font-body">
          Request higher token caps, queue limits, and webhook support for production API use.
        </p>
        <span className="bg-[#f5f0e8] border-2 border-primary px-2 py-0.5 text-xs font-bold uppercase">
          {apiAccess.currentPlanName}
        </span>
      </div>

      {!apiAccess.hasPaidApiAccess ? (
        <p className="border-2 border-primary bg-[#ffdad6] p-3 text-xs font-bold text-[#93000a] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] mb-4">
          Free accounts can prepare a request, but API keys stay disabled until payment/admin approval.
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-headline font-bold uppercase text-primary">
            Company or customer name
            <input
              name="companyName"
              required
              minLength={2}
              maxLength={120}
              placeholder="Khmer Vox customer system"
              className="w-full border-[3px] border-primary bg-white p-2 font-body text-primary focus:outline-none focus:border-[#0055ff] transition-colors"
            />
          </label>
          <label className="grid gap-1 text-sm font-headline font-bold uppercase text-primary">
            App or product name
            <input
              name="appName"
              required
              minLength={2}
              maxLength={120}
              placeholder="Dubbing dashboard"
              className="w-full border-[3px] border-primary bg-white p-2 font-body text-primary focus:outline-none focus:border-[#0055ff] transition-colors"
            />
          </label>
        </div>
        <label className="grid gap-1 text-sm font-headline font-bold uppercase text-primary">
          Use case
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
          <label className="grid gap-1 text-sm font-headline font-bold uppercase text-primary">
            Expected monthly tokens
            <input
              name="expectedMonthlyTokens"
              required
              type="number"
              min={1}
              max={100000000}
              defaultValue={100000}
              className="w-full border-[3px] border-primary bg-white p-2 font-body text-primary focus:outline-none focus:border-[#0055ff] transition-colors"
            />
          </label>
          <label className="grid gap-1 text-sm font-headline font-bold uppercase text-primary">
            Peak concurrency
            <input
              name="expectedPeakConcurrency"
              required
              type="number"
              min={1}
              max={100}
              defaultValue={3}
              className="w-full border-[3px] border-primary bg-white p-2 font-body text-primary focus:outline-none focus:border-[#0055ff] transition-colors"
            />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-headline font-bold uppercase text-primary">
            Webhook URL
            <input
              name="webhookUrl"
              type="url"
              maxLength={2048}
              placeholder="https://example.com/voxtts/webhook"
              className="w-full border-[3px] border-primary bg-white p-2 font-body text-primary focus:outline-none focus:border-[#0055ff] transition-colors"
            />
          </label>
          <label className="grid gap-1 text-sm font-headline font-bold uppercase text-primary">
            Telegram
            <input
              name="contactTelegram"
              maxLength={120}
              placeholder="@username"
              className="w-full border-[3px] border-primary bg-white p-2 font-body text-primary focus:outline-none focus:border-[#0055ff] transition-colors"
            />
          </label>
        </div>
        <label className="grid gap-1 text-sm font-headline font-bold uppercase text-primary">
          Contact email
          <input
            name="contactEmail"
            type="email"
            maxLength={180}
            placeholder="Leave blank to use your account email"
            className="w-full border-[3px] border-primary bg-white p-2 font-body text-primary focus:outline-none focus:border-[#0055ff] transition-colors"
          />
        </label>
        {message ? (
          <p
            className={`border-2 border-primary p-3 text-xs font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] ${
              message.type === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border border-red-200 bg-red-50 text-red-700"
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
          {submitting ? "Submitting..." : "Submit Request"}
        </button>
      </form>
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
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      webhookUrl: readFormText(formData, "webhookUrl"),
      eventType: readFormText(formData, "eventType") === "failed" ? "failed" : "completed",
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
            : data.event.errorMessage ?? "Webhook test failed.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Could not send webhook test.",
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
        Send a signed sample completed/failed callback before using batch clone jobs.
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
                <td colSpan={5} className="p-6 text-center text-[#4a4a4a] bg-white">
                  No webhook tests yet.
                </td>
              </tr>
            ) : (
              webhookTests.slice(0, 8).map((event) => (
                <tr key={event.id} className="border-b-4 border-primary hover:bg-[#eee9e0]/40 transition-colors">
                  <td className="p-3 border-r-4 border-primary">{formatDateTime(event.createdAt)}</td>
                  <td className="p-3 border-r-4 border-primary">{event.eventType}</td>
                  <td className="p-3 border-r-4 border-primary">
                    <WebhookStatusPill status={event.deliveryStatus} />
                    {event.errorMessage ? (
                      <p className="mt-1 max-w-[260px] truncate text-xs text-red-700">{event.errorMessage}</p>
                    ) : null}
                  </td>
                  <td className="p-3 border-r-4 border-primary">{event.httpStatus ?? "-"}</td>
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

function BusinessRequestHistory({ requests }: { requests: BusinessApiRequestRecord[] }) {
  return (
    <section className="bg-white border-4 border-primary p-6 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative">
      <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
        Business Request Status
      </div>
      <p className="text-sm text-[#4a4a4a] font-body mb-6 mt-2">Admin review history and approved limits for your account.</p>

      <div className="smooth-scroll-region overflow-auto border-4 border-primary shadow-[4px_4px_0px_0px_#1a1a1a] bg-white">
        <table className="w-full min-w-[1080px] text-left border-collapse">
          <thead>
            <tr className="bg-[#eee9e0] border-b-4 border-primary font-headline uppercase text-xs">
              <th className="p-3 border-r-4 border-primary">Submitted</th>
              <th className="p-3 border-r-4 border-primary">Company/App</th>
              <th className="p-3 border-r-4 border-primary">Expected</th>
              <th className="p-3 border-r-4 border-primary">Webhook</th>
              <th className="p-3 border-r-4 border-primary">Status</th>
              <th className="p-3 border-r-4 border-primary">Approved Limits</th>
              <th className="p-3">Admin Note</th>
            </tr>
          </thead>
          <tbody className="font-body text-sm font-semibold">
            {requests.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[#4a4a4a] bg-white">
                  No business requests yet.
                </td>
              </tr>
            ) : (
              requests.map((request) => (
                <tr key={request.id} className="border-b-4 border-primary hover:bg-[#eee9e0]/40 transition-colors">
                  <td className="p-3 border-r-4 border-primary">{formatDateTime(request.createdAt)}</td>
                  <td className="p-3 border-r-4 border-primary max-w-[260px]">
                    <p className="font-semibold">{request.companyName}</p>
                    <p className="text-xs text-[#4a4a4a]">{request.appName}</p>
                  </td>
                  <td className="p-3 border-r-4 border-primary">
                    <p>{request.expectedMonthlyTokens.toLocaleString()} tokens/mo</p>
                    <p className="text-xs text-[#4a4a4a]">{request.expectedPeakConcurrency} peak concurrency</p>
                  </td>
                  <td className="p-3 border-r-4 border-primary max-w-[260px] truncate font-mono text-xs">
                    {request.webhookUrl ?? "-"}
                  </td>
                  <td className="p-3 border-r-4 border-primary">
                    <BusinessRequestStatusPill status={request.status} />
                    {request.reviewedAt ? (
                      <p className="mt-1 text-xs text-[#4a4a4a]">Reviewed {formatDateTime(request.reviewedAt)}</p>
                    ) : null}
                  </td>
                  <td className="p-3 border-r-4 border-primary text-xs leading-5 text-[#4a4a4a]">
                    <p>Daily: {formatLimit(request.appliedDailyTokenLimit)}</p>
                    <p>Monthly: {formatLimit(request.appliedMonthlyTokenLimit)}</p>
                    <p>Requests: {formatLimit(request.appliedMaxConcurrentRequests)}</p>
                    <p>Jobs: {formatLimit(request.appliedMaxConcurrentJobs)}</p>
                    <p>Queue: {formatLimit(request.appliedMaxQueuedJobs)}</p>
                    <p>Clone rate: {request.appliedCloneCreditRate ? formatCloneCreditRate(request.appliedCloneCreditRate) : "-"}</p>
                  </td>
                  <td className="p-3 max-w-[260px] text-[#4a4a4a]">{request.adminNote ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RequestLogsTable({ requestLogs }: { requestLogs: RequestLogItem[] }) {
  return (
    <section className="bg-white border-4 border-primary p-6 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative">
      <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
        Request Logs
      </div>
      <p className="text-sm text-[#4a4a4a] font-body mb-6 mt-2">Recent API-key generation requests</p>

      <div className="smooth-scroll-region overflow-auto border-4 border-primary shadow-[4px_4px_0px_0px_#1a1a1a] bg-white">
        <table className="w-full min-w-[860px] text-left border-collapse">
          <thead>
            <tr className="bg-[#eee9e0] border-b-4 border-primary font-headline uppercase text-xs">
              <th className="p-3 border-r-4 border-primary">Time</th>
              <th className="p-3 border-r-4 border-primary">Mode</th>
              <th className="p-3 border-r-4 border-primary">Status</th>
              <th className="p-3 border-r-4 border-primary">Input</th>
              <th className="p-3 border-r-4 border-primary">Preview</th>
              <th className="p-3 border-r-4 border-primary">Duration</th>
              <th className="p-3">Credits</th>
            </tr>
          </thead>
          <tbody className="font-body text-sm font-semibold">
            {requestLogs.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[#4a4a4a] bg-white">
                  No API requests yet.
                </td>
              </tr>
            ) : (
              requestLogs.map((item) => (
                <tr key={item.id} className="border-b-4 border-primary hover:bg-[#eee9e0]/40 transition-colors">
                  <td className="p-3 border-r-4 border-primary">{formatDateTime(item.createdAt)}</td>
                  <td className="p-3 border-r-4 border-primary uppercase font-headline">{item.mode}</td>
                  <td className="p-3 border-r-4 border-primary">
                    <span
                      className={`inline-block px-2 py-1 border-2 border-primary font-label text-xs uppercase ${generationStatusClass(item.status)}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="p-3 border-r-4 border-primary">{item.inputChars.toLocaleString()} chars</td>
                  <td className="p-3 border-r-4 border-primary max-w-[300px] truncate">{item.inputPreview}</td>
                  <td className="p-3 border-r-4 border-primary">{item.outputSeconds}s</td>
                  <td className="p-3">{item.creditsCharged.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BusinessMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="bg-white border-4 border-primary p-4 shadow-[4px_4px_0px_0px_#1a1a1a] relative">
      <p className="text-xs font-headline font-bold uppercase tracking-wider text-[#4a4a4a]">{label}</p>
      <p className="mt-2 text-3xl font-headline font-black leading-none text-primary">{value}</p>
      <p className="mt-2 text-xs text-[#4a4a4a] font-body">{note}</p>
    </article>
  );
}

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
  return <span className={`inline-block px-2 py-0.5 border-2 border-primary font-label text-xs uppercase ${className}`}>{status}</span>;
}

function BusinessRequestStatusPill({ status }: { status: BusinessApiRequestRecord["status"] }) {
  const className =
    status === "approved"
      ? "bg-[#10b981] text-primary"
      : status === "rejected"
        ? "bg-[#e63b2e] text-[#f5f0e8]"
        : "bg-[#ffcc00] text-primary";
  return <span className={`inline-block px-2 py-0.5 border-2 border-primary font-label text-xs uppercase ${className}`}>{status}</span>;
}

function WebhookStatusPill({ status }: { status: WebhookTestEventRecord["deliveryStatus"] }) {
  const className = status === "delivered" ? "bg-[#10b981] text-primary" : "bg-[#e63b2e] text-[#f5f0e8]";
  return <span className={`inline-block px-2 py-0.5 border-2 border-primary font-label text-xs uppercase ${className}`}>{status}</span>;
}

function formatLimit(value: number | null): string {
  return value === null ? "default" : value.toLocaleString();
}

function tabClass(active: boolean): string {
  return `font-headline font-bold uppercase text-sm px-6 py-3 border-4 border-primary transition-all shadow-[4px_4px_0px_0px_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0px_0px_#1a1a1a] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none cursor-pointer ${
    active ? "bg-[#ffcc00] text-primary" : "bg-white text-primary"
  }`;
}

function formatDateTime(input: string | null | undefined): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function generationStatusClass(status: GenerationStatus): string {
  if (status === "success") return "bg-[#10b981] text-primary";
  if (status === "processing") return "bg-[#ffcc00] text-primary";
  return "bg-[#e63b2e] text-[#f5f0e8]";
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
