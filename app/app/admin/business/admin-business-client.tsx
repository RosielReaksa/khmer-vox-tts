"use client";

import Link from "next/link";
import { useState } from "react";

import { formatCloneCreditRate } from "@/lib/credit-rates";
import type { BusinessApiRequestWithUser } from "@/lib/store";
import type { BusinessApiRequestStatus, BusinessSalesStage } from "@/lib/types";

type AdminBusinessClientProps = {
  requests: BusinessApiRequestWithUser[];
  status: BusinessApiRequestStatus | "all";
  salesStage: BusinessSalesStage | "all";
  q: string;
  returnTo: string;
  reviewAction: (formData: FormData) => void;
  updateSalesAction: (formData: FormData) => void;
};

const statusOptions: Array<BusinessApiRequestStatus | "all"> = ["all", "pending", "approved", "rejected"];
const salesStageValues: BusinessSalesStage[] = ["new", "contacted", "qualified", "proposal", "won", "lost"];
const salesStageOptions: Array<BusinessSalesStage | "all"> = ["all", ...salesStageValues];

export function AdminBusinessClient({
  requests,
  status,
  salesStage,
  q,
  returnTo,
  reviewAction,
  updateSalesAction,
}: AdminBusinessClientProps) {
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [selectedRequestForReview, setSelectedRequestForReview] = useState<BusinessApiRequestWithUser | null>(null);

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const rejectedCount = requests.filter((r) => r.status === "rejected").length;
  const followUpDueCount = requests.filter((r) => isFollowUpDue(r.followUpAt)).length;
  const activePipeline = requests.filter((r) =>
    ["new", "contacted", "qualified", "proposal"].includes(r.salesStage),
  ).length;

  const expectedTokens = requests.reduce((sum, r) => sum + r.expectedMonthlyTokens, 0);
  const peakConcurrency = requests.reduce((max, r) => Math.max(max, r.expectedPeakConcurrency), 0);

  // Compute stats per sales stage for the funnel overview
  const stageTotals = salesStageValues.reduce((acc, stage) => {
    acc[stage] = requests.filter((r) => r.salesStage === stage).reduce((sum, r) => sum + r.expectedMonthlyTokens, 0);
    return acc;
  }, {} as Record<BusinessSalesStage, number>);
  const maxTotal = Math.max(...Object.values(stageTotals), 1);

  return (
    <div className="grid gap-5">
      {/* View Selector Toggle & Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border-2 border-primary p-3 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] rounded-none">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setViewMode("board")}
            className={`rounded-none border-2 border-primary px-4 py-2 text-xs font-headline font-bold uppercase tracking-wider transition-all cursor-pointer ${
              viewMode === "board"
                ? "bg-[#ffcc00] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] translate-x-0.5 -translate-y-0.5"
                : "bg-white hover:bg-surface-container-high"
            }`}
          >
            Board View
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`rounded-none border-2 border-primary px-4 py-2 text-xs font-headline font-bold uppercase tracking-wider transition-all cursor-pointer ${
              viewMode === "list"
                ? "bg-[#ffcc00] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] translate-x-0.5 -translate-y-0.5"
                : "bg-white hover:bg-surface-container-high"
            }`}
          >
            List View
          </button>
        </div>

        <div className="flex flex-wrap gap-4 text-xs font-headline font-bold text-primary uppercase">
          <div className="flex gap-1.5 items-center">
            <span className="text-primary/60">Filtered:</span>
            <span>{requests.length} Requests</span>
          </div>
          <div className="flex gap-1.5 items-center">
            <span className="text-primary/60">Demand:</span>
            <span>{expectedTokens.toLocaleString()} tokens</span>
          </div>
          <div className="flex gap-1.5 items-center">
            <span className="text-primary/60">Max Peak:</span>
            <span>{peakConcurrency} Concurrency</span>
          </div>
        </div>
      </div>

      {/* Visual Pipeline Funnel Overview */}
      <section className="grid grid-cols-2 sm:grid-cols-6 gap-3 rounded-none border-3 border-primary bg-white p-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] font-headline uppercase text-primary">
        {salesStageValues.map((stage) => {
          const total = stageTotals[stage];
          const count = requests.filter((r) => r.salesStage === stage).length;
          const percent = Math.max(8, Math.round((total / maxTotal) * 100));
          return (
            <div
              key={stage}
              className="flex flex-col rounded-none border border-primary bg-white p-3 justify-between shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
            >
              <div>
                <span className="text-[10px] font-bold text-primary/75">{stage}</span>
                <div className="text-base font-black mt-1 leading-none truncate" title={total.toLocaleString()}>
                  {total.toLocaleString()}
                </div>
                <span className="text-[10px] font-body text-primary/60 normal-case">{count} leads</span>
              </div>
              <div className="w-full bg-[#faf7f2] border border-primary h-2 mt-3 rounded-none overflow-hidden">
                <div
                  className={`h-full border-r border-primary ${
                    stage === "won"
                      ? "bg-[#def3e5]"
                      : stage === "lost"
                        ? "bg-red-200"
                        : "bg-[#ffcc00]"
                  }`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </section>

      {/* Filter Form Block */}
      <section className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <form className="grid gap-3 md:grid-cols-[170px_190px_1fr_auto]">
          <label className="grid gap-1 text-xs font-headline font-bold uppercase text-primary">
            Status
            <select
              name="status"
              defaultValue={status}
              className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none font-body text-sm text-primary focus:bg-surface-container-low focus:border-primary"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-headline font-bold uppercase text-primary">
            Sales stage
            <select
              name="stage"
              defaultValue={salesStage}
              className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none font-body text-sm text-primary focus:bg-surface-container-low focus:border-primary"
            >
              {salesStageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-headline font-bold uppercase text-primary">
            Search
            <input
              name="q"
              defaultValue={q}
              placeholder="Email, company, app, contact, use case"
              className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none font-body text-sm text-primary focus:bg-surface-container-low focus:border-primary"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-none border-2 border-primary bg-primary bg-primary-fixed px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
            >
              Filter
            </button>
            <Link
              href="/app/admin/business"
              className="rounded-none border-2 border-primary bg-white px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] transition-all"
            >
              Clear
            </Link>
          </div>
        </form>
      </section>

      {/* Main Board vs List views */}
      {viewMode === "board" ? (
        <section className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 items-start">
          {salesStageValues.map((stage) => {
            const stageRequests = requests.filter((r) => r.salesStage === stage);
            return (
              <div
                key={stage}
                className="flex flex-col min-w-0 rounded-none border-3 border-primary bg-[#faf7f2] p-3 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] min-h-[600px]"
              >
                {/* Column Header */}
                <div className="border-b-2 border-primary pb-2 mb-3">
                  <h3 className="font-headline font-black uppercase text-base text-primary leading-none truncate">
                    {stage}
                  </h3>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] font-body text-primary/70">
                    <span>{stageRequests.length} Leads</span>
                    <span className="font-bold">
                      {stageRequests.reduce((sum, r) => sum + r.expectedMonthlyTokens, 0).toLocaleString()} tokens
                    </span>
                  </div>
                </div>

                {/* Cards Container */}
                <div className="flex flex-col gap-3 min-h-0 flex-1">
                  {stageRequests.length === 0 ? (
                    <div className="text-center text-xs font-body text-primary/50 py-8 border border-dashed border-primary/30 bg-white">
                      No leads
                    </div>
                  ) : (
                    stageRequests.map((req) => (
                      <KanbanCard
                        key={req.id}
                        request={req}
                        onSelectReview={setSelectedRequestForReview}
                        updateSalesAction={updateSalesAction}
                        returnTo={returnTo}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="grid gap-4">
          {requests.length === 0 ? (
            <div className="rounded-none border-2 border-dashed border-primary bg-white p-8 text-center text-sm font-body text-on-surface-variant">
              No business API requests found.
            </div>
          ) : (
            requests.map((request) => (
              <BusinessRequestListRow
                key={request.id}
                request={request}
                returnTo={returnTo}
                updateSalesAction={updateSalesAction}
                reviewAction={reviewAction}
              />
            ))
          )}
        </section>
      )}

      {/* Review & Edit Modal */}
      {selectedRequestForReview && (
        <ReviewModal
          request={selectedRequestForReview}
          onClose={() => setSelectedRequestForReview(null)}
          updateSalesAction={updateSalesAction}
          reviewAction={reviewAction}
          returnTo={returnTo}
        />
      )}
    </div>
  );
}

function KanbanCard({
  request,
  onSelectReview,
  updateSalesAction,
  returnTo,
}: {
  request: BusinessApiRequestWithUser;
  onSelectReview: (req: BusinessApiRequestWithUser) => void;
  updateSalesAction: (formData: FormData) => void;
  returnTo: string;
}) {
  const followUpDue = isFollowUpDue(request.followUpAt);
  const currentStageIndex = salesStageValues.indexOf(request.salesStage);

  const prevStage = currentStageIndex > 0 ? salesStageValues[currentStageIndex - 1] : null;
  const nextStage = currentStageIndex < salesStageValues.length - 1 ? salesStageValues[currentStageIndex + 1] : null;

  return (
    <article className="rounded-none border-2 border-primary bg-white p-3 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all text-primary">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-headline font-black text-sm uppercase truncate w-full" title={request.companyName}>
          {request.companyName}
        </h4>
        <BusinessStatusPill status={request.status} />
      </div>
      <p className="text-[10px] font-body text-primary/60 truncate mt-1">{request.appName}</p>

      <div className="mt-3 flex items-center justify-between text-[11px] font-headline font-bold uppercase text-primary/80 border-t border-primary/10 pt-2">
        <span>Demand:</span>
        <span className="font-black text-primary">{request.expectedMonthlyTokens.toLocaleString()}</span>
      </div>

      {request.followUpAt && (
        <div
          className={`mt-2 rounded-none border px-2 py-1 text-[10px] font-headline font-bold uppercase tracking-wider ${
            followUpDue ? "bg-red-50 border-red-700 text-red-700" : "bg-amber-50 border-amber-800 text-amber-800"
          }`}
        >
          {followUpDue ? "Follow-up Overdue" : `Follow-up: ${formatDateTime(request.followUpAt).slice(5, 16)}`}
        </div>
      )}

      {/* Card Controls */}
      <div className="mt-3 flex flex-wrap items-center justify-between border-t border-primary/10 pt-2 gap-1.5">
        <div className="flex gap-1">
          {prevStage && (
            <form action={updateSalesAction}>
              <input type="hidden" name="requestId" value={request.id} />
              <input type="hidden" name="salesStage" value={prevStage} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                title={`Move to ${prevStage}`}
                className="rounded-none border border-primary bg-white px-2 py-0.5 text-xs font-bold hover:bg-[#ffcc00] cursor-pointer transition-all"
              >
                &larr;
              </button>
            </form>
          )}
          {nextStage && (
            <form action={updateSalesAction}>
              <input type="hidden" name="requestId" value={request.id} />
              <input type="hidden" name="salesStage" value={nextStage} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                title={`Move to ${nextStage}`}
                className="rounded-none border border-primary bg-white px-2 py-0.5 text-xs font-bold hover:bg-[#ffcc00] cursor-pointer transition-all"
              >
                &rarr;
              </button>
            </form>
          )}
        </div>
        <button
          type="button"
          onClick={() => onSelectReview(request)}
          className="rounded-none border border-primary bg-white px-2 py-0.5 text-xs font-headline font-bold uppercase hover:bg-surface-container-high cursor-pointer transition-all"
        >
          Review
        </button>
      </div>
    </article>
  );
}

function BusinessRequestListRow({
  request,
  returnTo,
  updateSalesAction,
  reviewAction,
}: {
  request: BusinessApiRequestWithUser;
  returnTo: string;
  updateSalesAction: (formData: FormData) => void;
  reviewAction: (formData: FormData) => void;
}) {
  const defaultDaily = request.appliedDailyTokenLimit ?? Math.max(1, Math.ceil(request.expectedMonthlyTokens / 30));
  const defaultMonthly = request.appliedMonthlyTokenLimit ?? request.expectedMonthlyTokens;
  const defaultRequests = request.appliedMaxConcurrentRequests ?? request.expectedPeakConcurrency;
  const defaultJobs = request.appliedMaxConcurrentJobs ?? request.expectedPeakConcurrency;
  const defaultQueued = request.appliedMaxQueuedJobs ?? Math.max(10, request.expectedPeakConcurrency * 10);
  const defaultCloneCreditRate = request.appliedCloneCreditRate ?? 1.5;
  const followUpDue = isFollowUpDue(request.followUpAt);

  return (
    <article className="rounded-none border-3 border-primary bg-surface p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <div className="grid gap-4 xl:grid-cols-[1fr_500px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-headline font-black uppercase text-[#1c212d] leading-none">
                {request.companyName}
              </h2>
              <p className="mt-2 truncate text-sm font-headline font-bold uppercase text-[#202533]">
                {request.appName}
              </p>
              <p className="mt-2 text-xs font-body text-[#6a7282]">
                <Link href={`/app/admin/customers/${request.userId}`} className="font-bold text-[#116d3c] hover:underline">
                  {request.userEmail}
                </Link>
                {" / "}
                {request.contactEmail}
                {request.contactTelegram ? ` / ${request.contactTelegram}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BusinessSalesStagePill stage={request.salesStage} />
              <BusinessStatusPill status={request.status} />
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <SmallStat label="Monthly tokens" value={request.expectedMonthlyTokens.toLocaleString()} />
            <SmallStat label="Peak concurrency" value={request.expectedPeakConcurrency.toLocaleString()} />
            <SmallStat
              label="Clone rate"
              value={request.appliedCloneCreditRate ? formatCloneCreditRate(request.appliedCloneCreditRate) : "Not approved"}
            />
            <SmallStat label="Submitted" value={formatDateTime(request.createdAt)} />
            <SmallStat
              label={followUpDue ? "Follow-up due" : "Follow-up"}
              value={request.followUpAt ? formatDateTime(request.followUpAt) : "-"}
            />
          </div>

          <div className="mt-4 grid gap-3">
            <div>
              <p className="text-[10px] font-headline font-bold uppercase tracking-[0.08em] text-[#8a92a2]">Use case</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 font-body text-[#3e4656]">{request.useCase}</p>
            </div>
            <div>
              <p className="text-[10px] font-headline font-bold uppercase tracking-[0.08em] text-[#8a92a2]">Webhook</p>
              <p className="mt-1 break-all font-mono text-xs text-[#3e4656]">{request.webhookUrl ?? "No webhook URL provided"}</p>
            </div>
            {request.adminNote ? (
              <div className="rounded-none border border-primary bg-white p-3">
                <p className="text-[10px] font-headline font-bold uppercase tracking-[0.08em] text-[#8a92a2]">Admin note</p>
                <p className="mt-1 text-sm leading-6 font-body text-[#3e4656]">{request.adminNote}</p>
              </div>
            ) : null}
            <div className="rounded-none border border-primary bg-white p-3">
              <p className="text-[10px] font-headline font-bold uppercase tracking-[0.08em] text-[#8a92a2]">Business CRM</p>
              <div className="mt-2 grid gap-2 text-xs leading-6 font-body text-[#3e4656] md:grid-cols-2">
                <p>
                  <span className="font-bold text-[#202533]">Last contacted:</span>{" "}
                  {formatDateTime(request.lastContactedAt)}
                </p>
                <p>
                  <span className="font-bold text-[#202533]">Next follow-up:</span>{" "}
                  {formatDateTime(request.followUpAt)}
                </p>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 font-body text-[#3e4656]">
                {request.salesNote ?? "No private sales note yet."}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 rounded-none border border-primary bg-[#fcfbfc] p-4">
          <form
            action={updateSalesAction}
            className="grid gap-3 rounded-none border border-primary bg-white p-3 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
          >
            <input type="hidden" name="requestId" value={request.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs font-headline font-bold uppercase text-primary">
                Sales stage
                <select
                  name="salesStage"
                  defaultValue={request.salesStage}
                  className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none font-body text-sm focus:bg-surface-container-low"
                >
                  {salesStageValues.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-headline font-bold uppercase text-primary">
                Follow-up time
                <input
                  name="followUpAt"
                  type="datetime-local"
                  defaultValue={formatDateTimeLocalValue(request.followUpAt)}
                  className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none font-body text-sm focus:bg-surface-container-low"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm font-headline font-bold uppercase text-primary cursor-pointer">
              <input name="markContacted" type="checkbox" className="h-4 w-4 border-2 border-primary rounded-none" />
              Mark contacted now
            </label>
            <label className="grid gap-1 text-xs font-headline font-bold uppercase text-primary">
              Private sales note
              <textarea
                name="salesNote"
                rows={3}
                maxLength={1000}
                defaultValue={request.salesNote ?? ""}
                placeholder="Customer needs, next action, decision owner..."
                className="resize-y rounded-none border-2 border-primary bg-white px-3 py-2 outline-none font-body text-sm focus:bg-surface-container-low"
              />
            </label>
            <button
              type="submit"
              className="w-fit rounded-none border-2 border-primary bg-white px-4 py-2 text-xs font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] transition-all cursor-pointer"
            >
              Save CRM
            </button>
          </form>

          <form action={reviewAction} className="grid gap-3">
            <input type="hidden" name="requestId" value={request.id} />
            <input type="hidden" name="status" value="approved" />
            <div className="grid gap-3 md:grid-cols-2">
              <LimitInput name="dailyTokenLimit" label="Daily tokens" defaultValue={defaultDaily} />
              <LimitInput name="monthlyTokenLimit" label="Monthly tokens" defaultValue={defaultMonthly} />
              <LimitInput name="maxConcurrentRequests" label="Concurrent requests" defaultValue={defaultRequests} />
              <LimitInput name="maxConcurrentJobs" label="Running jobs" defaultValue={defaultJobs} />
              <LimitInput name="maxQueuedJobs" label="Queued jobs" defaultValue={defaultQueued} />
              <label className="grid gap-1 text-xs font-headline font-bold uppercase text-primary">
                Clone tokens/sec
                <select
                  name="cloneCreditRate"
                  defaultValue={String(defaultCloneCreditRate)}
                  className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none font-body text-sm focus:bg-surface-container-low"
                >
                  <option value="1.5">1.5 - Business default</option>
                  <option value="1">1.0 - high volume prepaid</option>
                  <option value="2">2.0 - standard clone</option>
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm font-headline font-bold uppercase text-primary cursor-pointer">
              <input name="applyToActiveKeys" type="checkbox" defaultChecked className="h-4 w-4 border-2 border-primary rounded-none" />
              Apply to all active keys
            </label>
            <label className="grid gap-1 text-xs font-headline font-bold uppercase text-primary">
              Approval note
              <textarea
                name="adminNote"
                rows={2}
                maxLength={500}
                defaultValue={request.adminNote ?? ""}
                className="resize-y rounded-none border-2 border-primary bg-white px-3 py-2 outline-none font-body text-sm focus:bg-surface-container-low"
              />
            </label>
            <button
              type="submit"
              className="rounded-none border-2 border-primary bg-primary bg-primary-fixed px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] transition-all cursor-pointer"
            >
              Approve And Apply Limits
            </button>
          </form>

          <form action={reviewAction} className="grid gap-2 border-t-2 border-primary pt-3">
            <input type="hidden" name="requestId" value={request.id} />
            <input type="hidden" name="status" value="rejected" />
            <label className="grid gap-1 text-xs font-headline font-bold uppercase text-primary">
              Rejection note
              <input
                name="adminNote"
                maxLength={500}
                placeholder="Reason shown to customer"
                className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none font-body text-sm focus:bg-surface-container-low"
              />
            </label>
            <button
              type="submit"
              className="w-fit rounded-none border-2 border-red-700 bg-red-50 px-4 py-2 text-xs font-headline font-bold uppercase text-red-700 hover:bg-red-100 transition-all cursor-pointer"
            >
              Reject Request
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}

function ReviewModal({
  request,
  onClose,
  updateSalesAction,
  reviewAction,
  returnTo,
}: {
  request: BusinessApiRequestWithUser;
  onClose: () => void;
  updateSalesAction: (formData: FormData) => void;
  reviewAction: (formData: FormData) => void;
  returnTo: string;
}) {
  const defaultDaily = request.appliedDailyTokenLimit ?? Math.max(1, Math.ceil(request.expectedMonthlyTokens / 30));
  const defaultMonthly = request.appliedMonthlyTokenLimit ?? request.expectedMonthlyTokens;
  const defaultRequests = request.appliedMaxConcurrentRequests ?? request.expectedPeakConcurrency;
  const defaultJobs = request.appliedMaxConcurrentJobs ?? request.expectedPeakConcurrency;
  const defaultQueued = request.appliedMaxQueuedJobs ?? Math.max(10, request.expectedPeakConcurrency * 10);
  const defaultCloneCreditRate = request.appliedCloneCreditRate ?? 1.5;
  const followUpDue = isFollowUpDue(request.followUpAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-5xl rounded-none border-3 border-primary bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] my-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-none border-2 border-primary bg-white px-3 py-1 text-sm font-headline font-bold uppercase hover:bg-surface-container-high transition-all cursor-pointer"
        >
          Close [X]
        </button>

        <div className="border-b-2 border-primary pb-3 mb-5 pr-20">
          <span className="text-xs font-headline font-bold uppercase tracking-[0.12em] text-[#8a92a2]">Review Request</span>
          <h2 className="text-3xl font-headline font-black uppercase text-primary leading-tight mt-1">{request.companyName}</h2>
          <p className="text-sm font-headline font-bold uppercase text-[#202533] mt-1">{request.appName}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Info Details */}
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-3">
            <div>
              <p className="text-[10px] font-headline font-bold uppercase tracking-[0.08em] text-[#8a92a2]">Applicant</p>
              <div className="mt-1 text-sm leading-6 font-body text-primary">
                <p>
                  <span className="font-bold">Account email:</span>{" "}
                  <Link href={`/app/admin/customers/${request.userId}`} className="font-bold text-[#116d3c] hover:underline">
                    {request.userEmail}
                  </Link>
                </p>
                <p><span className="font-bold">Contact email:</span> {request.contactEmail}</p>
                <p><span className="font-bold">Telegram:</span> {request.contactTelegram || "None"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SmallStat label="Monthly tokens" value={request.expectedMonthlyTokens.toLocaleString()} />
              <SmallStat label="Peak concurrency" value={request.expectedPeakConcurrency.toLocaleString()} />
              <SmallStat label="Submitted" value={formatDateTime(request.createdAt)} />
              <SmallStat label="Last Contact" value={formatDateTime(request.lastContactedAt)} />
            </div>

            <div>
              <p className="text-[10px] font-headline font-bold uppercase tracking-[0.08em] text-[#8a92a2]">Use case</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 font-body text-[#3e4656] bg-[#fdfcfa] border border-primary/20 p-2.5">{request.useCase}</p>
            </div>

            <div>
              <p className="text-[10px] font-headline font-bold uppercase tracking-[0.08em] text-[#8a92a2]">Webhook URL</p>
              <p className="mt-1 break-all font-mono text-xs text-[#3e4656] bg-[#fdfcfa] border border-primary/20 p-2.5">{request.webhookUrl ?? "None provided"}</p>
            </div>

            <div className="rounded-none border border-primary bg-[#fafbfe] p-3">
              <p className="text-[10px] font-headline font-bold uppercase tracking-[0.08em] text-primary/70">Current Sales Note</p>
              <p className="mt-1 whitespace-pre-wrap text-xs font-body leading-relaxed text-[#3e4656]">{request.salesNote ?? "No sales notes recorded yet."}</p>
            </div>
          </div>

          {/* Configuration Actions Form */}
          <div className="grid gap-4 max-h-[60vh] overflow-y-auto pr-3">
            <div className="grid gap-4 rounded-none border-2 border-primary bg-[#faf7f2] p-4 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]">
              <div className="font-headline font-bold text-xs uppercase text-primary border-b border-primary/10 pb-1">Update CRM Status</div>
              <form action={updateSalesAction} className="grid gap-3">
                <input type="hidden" name="requestId" value={request.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-[10px] font-headline font-bold uppercase text-primary">
                    Sales stage
                    <select
                      name="salesStage"
                      defaultValue={request.salesStage}
                      className="rounded-none border-2 border-primary bg-white px-2 py-1 outline-none font-body text-xs focus:bg-surface-container-low"
                    >
                      {salesStageValues.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-[10px] font-headline font-bold uppercase text-primary">
                    Follow-up date
                    <input
                      name="followUpAt"
                      type="datetime-local"
                      defaultValue={formatDateTimeLocalValue(request.followUpAt)}
                      className="rounded-none border-2 border-primary bg-white px-2 py-1 outline-none font-body text-xs focus:bg-surface-container-low"
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs font-headline font-bold uppercase text-primary cursor-pointer">
                  <input name="markContacted" type="checkbox" className="h-4 w-4 border-2 border-primary rounded-none" />
                  Mark contacted now
                </label>
                <label className="grid gap-1 text-[10px] font-headline font-bold uppercase text-primary">
                  Private CRM note
                  <textarea
                    name="salesNote"
                    rows={2}
                    maxLength={1000}
                    defaultValue={request.salesNote ?? ""}
                    placeholder="Notes..."
                    className="resize-y rounded-none border-2 border-primary bg-white px-2 py-1.5 outline-none font-body text-xs focus:bg-surface-container-low"
                  />
                </label>
                <button
                  type="submit"
                  className="w-full rounded-none border-2 border-primary bg-white py-1.5 text-xs font-headline font-bold uppercase text-primary shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all cursor-pointer"
                >
                  Save CRM Details
                </button>
              </form>
            </div>

            <div className="grid gap-4 rounded-none border-2 border-primary bg-white p-4 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]">
              <div className="font-headline font-bold text-xs uppercase text-[#116d3c] border-b border-[#116d3c]/10 pb-1">Approve Limits</div>
              <form action={reviewAction} className="grid gap-3">
                <input type="hidden" name="requestId" value={request.id} />
                <input type="hidden" name="status" value="approved" />
                <div className="grid gap-2 sm:grid-cols-2">
                  <LimitInput name="dailyTokenLimit" label="Daily tokens" defaultValue={defaultDaily} />
                  <LimitInput name="monthlyTokenLimit" label="Monthly tokens" defaultValue={defaultMonthly} />
                  <LimitInput name="maxConcurrentRequests" label="Concurrent requests" defaultValue={defaultRequests} />
                  <LimitInput name="maxConcurrentJobs" label="Running jobs" defaultValue={defaultJobs} />
                  <LimitInput name="maxQueuedJobs" label="Queued jobs" defaultValue={defaultQueued} />
                  <label className="grid gap-1 text-[10px] font-headline font-bold uppercase text-primary">
                    Clone tokens/sec
                    <select
                      name="cloneCreditRate"
                      defaultValue={String(defaultCloneCreditRate)}
                      className="rounded-none border-2 border-primary bg-white px-2 py-1 outline-none font-body text-xs focus:bg-surface-container-low"
                    >
                      <option value="1.5">1.5 - Business default</option>
                      <option value="1">1.0 - high volume prepaid</option>
                      <option value="2">2.0 - standard clone</option>
                    </select>
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs font-headline font-bold uppercase text-primary cursor-pointer">
                  <input name="applyToActiveKeys" type="checkbox" defaultChecked className="h-4 w-4 border-2 border-primary rounded-none" />
                  Apply to active API keys
                </label>
                <label className="grid gap-1 text-[10px] font-headline font-bold uppercase text-primary">
                  Approval admin note
                  <textarea
                    name="adminNote"
                    rows={1}
                    maxLength={500}
                    defaultValue={request.adminNote ?? ""}
                    className="resize-y rounded-none border-2 border-primary bg-white px-2 py-1 outline-none font-body text-xs focus:bg-surface-container-low"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-none border-2 border-primary bg-[#a7f3d0] py-2 text-xs font-headline font-bold uppercase text-primary shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all cursor-pointer"
                >
                  Approve and Enable Business API
                </button>
              </form>
            </div>

            <div className="grid gap-2 border-t-2 border-primary pt-3">
              <form action={reviewAction} className="grid gap-2">
                <input type="hidden" name="requestId" value={request.id} />
                <input type="hidden" name="status" value="rejected" />
                <label className="grid gap-1 text-[10px] font-headline font-bold uppercase text-primary">
                  Rejection note
                  <input
                    name="adminNote"
                    maxLength={500}
                    placeholder="Reason shown to customer"
                    className="rounded-none border-2 border-primary bg-white px-3 py-1.5 outline-none font-body text-xs focus:bg-surface-container-low"
                  />
                </label>
                <button
                  type="submit"
                  className="w-full rounded-none border-2 border-red-700 bg-red-50 py-2 text-xs font-headline font-bold uppercase text-red-700 hover:bg-red-100 transition-all cursor-pointer"
                >
                  Reject & Cancel Request
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LimitInput({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: number | null;
}) {
  return (
    <label className="grid gap-1 text-[10px] font-headline font-bold uppercase text-primary">
      {label}
      <input
        name={name}
        type="number"
        min={1}
        max={100000000}
        defaultValue={defaultValue ?? ""}
        className="rounded-none border-2 border-primary bg-white px-2 py-1 outline-none font-body text-xs focus:bg-surface-container-low"
      />
    </label>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-none border border-primary bg-white p-2 text-primary">
      <p className="text-[10px] font-headline font-bold uppercase tracking-[0.08em] text-on-surface-variant leading-none">{label}</p>
      <p className="mt-1 text-xs font-body font-bold text-primary">{value}</p>
    </div>
  );
}

function BusinessStatusPill({ status }: { status: BusinessApiRequestStatus }) {
  const className =
    status === "approved"
      ? "bg-accent-soft text-accent-strong border-accent-strong"
      : status === "rejected"
        ? "bg-red-50 text-red-700 border-red-700"
        : "bg-amber-50 text-amber-800 border-amber-800";
  return (
    <span className={`rounded-none border px-1.5 py-0.5 text-[10px] font-headline font-bold uppercase tracking-wider ${className}`}>
      {status}
    </span>
  );
}

function BusinessSalesStagePill({ stage }: { stage: BusinessSalesStage }) {
  const className =
    stage === "won"
      ? "bg-accent-soft text-accent-strong border-accent-strong"
      : stage === "lost"
        ? "bg-red-50 text-red-700 border-red-700"
        : stage === "proposal"
          ? "bg-indigo-50 text-indigo-700 border-indigo-700"
          : stage === "qualified"
            ? "bg-sky-50 text-sky-700 border-sky-700"
            : stage === "contacted"
              ? "bg-amber-50 text-amber-800 border-amber-800"
              : "bg-slate-50 text-slate-700 border-slate-700";
  return (
    <span className={`rounded-none border px-1.5 py-0.5 text-[10px] font-headline font-bold uppercase tracking-wider ${className}`}>
      {stage}
    </span>
  );
}

function isFollowUpDue(input: string | null | undefined): boolean {
  if (!input) return false;
  const date = new Date(input);
  return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
}

function formatDateTimeLocalValue(input: string | null | undefined): string {
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function formatDateTime(input: string | null | undefined): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().replace("T", " ").slice(0, 19);
}
