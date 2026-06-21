import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";
import {
  listBusinessApiRequestsForAdmin,
  reviewBusinessApiRequest,
  updateBusinessApiRequestSalesState,
} from "@/lib/store";
import type { BusinessApiRequestStatus, BusinessSalesStage } from "@/lib/types";
import { AdminBusinessClient } from "./admin-business-client";

type AdminBusinessPageProps = {
  searchParams?: Promise<{
    status?: string;
    stage?: string;
    q?: string;
    reviewed?: string;
    crm?: string;
  }>;
};

const statusOptions: Array<BusinessApiRequestStatus | "all"> = [
  "all",
  "pending",
  "approved",
  "rejected",
];
const salesStageValues: BusinessSalesStage[] = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
];
const salesStageOptions: Array<BusinessSalesStage | "all"> = [
  "all",
  ...salesStageValues,
];

import { MetricCard, AdminAccessRequired } from "@/app/app/admin/admin-shared";

async function reviewBusinessRequestAction(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) {
    redirect("/app/signin");
  }

  const requestId = readFormText(formData, "requestId");
  const statusValue = readFormText(formData, "status");
  const status =
    statusValue === "rejected"
      ? "rejected"
      : statusValue === "approved"
        ? "approved"
        : null;
  if (!requestId || !status) {
    redirect("/app/admin/business?status=all");
  }

  await reviewBusinessApiRequest({
    requestId,
    adminUserId: user.id,
    status,
    adminNote: readFormText(formData, "adminNote").slice(0, 500) || null,
    limits: {
      dailyTokenLimit: readOptionalLimit(formData, "dailyTokenLimit"),
      monthlyTokenLimit: readOptionalLimit(formData, "monthlyTokenLimit"),
      maxConcurrentRequests: readOptionalLimit(
        formData,
        "maxConcurrentRequests",
      ),
      maxConcurrentJobs: readOptionalLimit(formData, "maxConcurrentJobs"),
      maxQueuedJobs: readOptionalLimit(formData, "maxQueuedJobs"),
      cloneCreditRate: readCloneCreditRate(formData),
    },
    applyToActiveKeys: formData.get("applyToActiveKeys") === "on",
  });

  redirect(`/app/admin/business?status=all&reviewed=${status}`);
}

async function updateBusinessSalesAction(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) {
    redirect("/app/signin");
  }

  const requestId = readFormText(formData, "requestId");
  const salesStageValue = readFormText(formData, "salesStage");
  const returnTo = normalizeReturnTo(readFormText(formData, "returnTo"));
  if (!requestId || !isBusinessSalesStage(salesStageValue)) {
    redirect(returnTo);
  }

  await updateBusinessApiRequestSalesState({
    requestId,
    adminUserId: user.id,
    salesStage: salesStageValue,
    salesNote: readFormText(formData, "salesNote").slice(0, 1000) || null,
    followUpAt: readFormText(formData, "followUpAt") || null,
    markContacted: formData.get("markContacted") === "on",
  });

  redirect(appendQueryFlag(returnTo, "crm", "updated"));
}

export default async function AdminBusinessPage({
  searchParams,
}: AdminBusinessPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }
  if (!isAdminEmail(user.email)) {
    return <AdminAccessRequired />;
  }

  const params = await searchParams;
  const status = statusOptions.includes(
    params?.status as BusinessApiRequestStatus | "all",
  )
    ? (params?.status as BusinessApiRequestStatus | "all")
    : "all";
  const salesStage = salesStageOptions.includes(
    params?.stage as BusinessSalesStage | "all",
  )
    ? (params?.stage as BusinessSalesStage | "all")
    : "all";
  const q = params?.q?.trim() ?? "";
  const requests = await listBusinessApiRequestsForAdmin({
    limit: 200,
    status,
    salesStage,
    q,
  });
  const returnTo = buildBusinessReturnTo(status, salesStage, q);

  const pending = requests.filter(
    (request) => request.status === "pending",
  ).length;
  const approved = requests.filter(
    (request) => request.status === "approved",
  ).length;
  const rejected = requests.filter(
    (request) => request.status === "rejected",
  ).length;
  const followUpDue = requests.filter((request) =>
    isFollowUpDue(request.followUpAt),
  ).length;
  const activePipeline = requests.filter((request) =>
    ["new", "contacted", "qualified", "proposal"].includes(request.salesStage),
  ).length;
  const expectedTokens = requests.reduce(
    (sum, request) => sum + request.expectedMonthlyTokens,
    0,
  );
  const peakConcurrency = requests.reduce(
    (max, request) => Math.max(max, request.expectedPeakConcurrency),
    0,
  );

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-primary pb-5">
        <div>
          <h1 className="text-[38px] font-headline font-black uppercase tracking-tight text-primary leading-none">
            Business API
          </h1>
          <p className="mt-2 text-sm font-body text-on-surface-variant">
            Review high-volume API requests and apply per-key token,
            concurrency, and queue controls.
          </p>
        </div>
        <Link
          href="/app/admin/customers"
          className="rounded-none border-2 border-primary bg-white px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] transition-all"
        >
          Customer Controls
        </Link>
      </div>

      <ReviewNotice state={params?.reviewed} crm={params?.crm} />

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Shown"
          value={requests.length.toLocaleString()}
          note="Latest 200 max"
        />
        <MetricCard
          label="Pending"
          value={pending.toLocaleString()}
          note="Need review"
        />
        <MetricCard
          label="Approved"
          value={approved.toLocaleString()}
          note="Limits applied"
        />
        <MetricCard
          label="Rejected"
          value={rejected.toLocaleString()}
          note="Not approved"
        />
        <MetricCard
          label="Pipeline"
          value={activePipeline.toLocaleString()}
          note="Open sales stages"
        />
        <MetricCard
          label="Due"
          value={followUpDue.toLocaleString()}
          note="Follow-ups due"
        />
      </section>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {salesStageValues.map((stage) => (
          <MetricCard
            key={stage}
            label={stage}
            value={requests
              .filter((request) => request.salesStage === stage)
              .length.toLocaleString()}
            note="Shown requests"
          />
        ))}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <MetricCard
          label="Demand"
          value={expectedTokens.toLocaleString()}
          note={`${peakConcurrency} peak concurrency`}
        />
        <MetricCard
          label="CRM Filter"
          value={salesStage === "all" ? "All" : salesStage}
          note={
            status === "all" ? "All request statuses" : `${status} requests`
          }
        />
      </section>

      <AdminBusinessClient
        requests={requests}
        status={status}
        salesStage={salesStage}
        q={q}
        returnTo={returnTo}
        reviewAction={reviewBusinessRequestAction}
        updateSalesAction={updateBusinessSalesAction}
      />
    </section>
  );
}

function ReviewNotice({ state, crm }: { state?: string; crm?: string }) {
  if (crm === "updated") {
    return (
      <p className="rounded-none border-2 border-accent-strong bg-accent-soft px-4 py-3 text-sm font-headline font-bold uppercase tracking-wider text-accent-strong">
        Business CRM updated.
      </p>
    );
  }
  if (state !== "approved" && state !== "rejected") return null;
  return (
    <p className="rounded-none border-2 border-accent-strong bg-accent-soft px-4 py-3 text-sm font-headline font-bold uppercase tracking-wider text-accent-strong">
      Business request {state}.
    </p>
  );
}

function isFollowUpDue(input: string | null | undefined): boolean {
  if (!input) return false;
  const date = new Date(input);
  return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
}

function buildBusinessReturnTo(
  status: BusinessApiRequestStatus | "all",
  salesStage: BusinessSalesStage | "all",
  q: string,
): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (salesStage !== "all") params.set("stage", salesStage);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/app/admin/business?${query}` : "/app/admin/business";
}

function normalizeReturnTo(input: string): string {
  if (!input.startsWith("/app/admin/business")) return "/app/admin/business";
  return input;
}

function appendQueryFlag(path: string, key: string, value: string): string {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(key, value);
  return `${pathname}?${params.toString()}`;
}

function readFormText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalLimit(formData: FormData, key: string): number | null {
  const raw = readFormText(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function readCloneCreditRate(formData: FormData): number {
  const value = Number(readFormText(formData, "cloneCreditRate"));
  return value === 1 || value === 1.5 || value === 2 ? value : 1.5;
}

function isBusinessSalesStage(value: string): value is BusinessSalesStage {
  return salesStageValues.includes(value as BusinessSalesStage);
}
