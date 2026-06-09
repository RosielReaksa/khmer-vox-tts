"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatUsd } from "@/lib/plans";
import type { PaymentSupportTicketWithOrder } from "@/lib/store";
import type { PaymentSupportTicketStatus } from "@/lib/types";
import { MetricCard } from "../admin-shared";

type SupportStatusFilter = PaymentSupportTicketStatus | "all";

export function PaymentSupportClient({
  initialTickets,
}: {
  initialTickets: PaymentSupportTicketWithOrder[];
}) {
  const [tickets, setTickets] = useState(initialTickets);
  const [statusFilter, setStatusFilter] = useState<SupportStatusFilter>("open");
  const [searchQuery, setSearchQuery] = useState("");
  const [adminNoteById, setAdminNoteById] = useState<Record<string, string>>({});
  const [loadingTicket, setLoadingTicket] = useState("");
  const [message, setMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => Date.now());

  const openCount = tickets.filter((ticket) => ticket.status === "open").length;
  const resolvedCount = tickets.filter((ticket) => ticket.status === "resolved").length;
  const filteredTickets = tickets.filter((ticket) => {
    if (statusFilter !== "all" && ticket.status !== statusFilter) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [
      ticket.id,
      ticket.paymentOrderId,
      ticket.userId,
      ticket.userEmail,
      ticket.userMessage,
      ticket.adminNote,
      ticket.planName,
      ticket.orderStatus,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const refreshTickets = useCallback(async (nextStatus: SupportStatusFilter = "all") => {
    if (loadingTicket) return;
    const response = await fetch(`/api/admin/payment-support?status=${nextStatus}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as {
      tickets?: PaymentSupportTicketWithOrder[];
      error?: string;
    };
    if (!response.ok || !data.tickets) {
      setMessage(data.error ?? "Could not refresh support tickets.");
      return;
    }
    setTickets(data.tickets);
    setLastUpdatedAt(Date.now());
  }, [loadingTicket]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshTickets("all");
      }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [refreshTickets]);

  useEffect(() => {
    function onFocus() {
      void refreshTickets("all");
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshTickets]);

  async function resolveTicket(ticketId: string) {
    setLoadingTicket(ticketId);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/payment-support/${ticketId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNote: adminNoteById[ticketId] ?? "" }),
      });
      const data = (await response.json()) as {
        ticket?: PaymentSupportTicketWithOrder;
        error?: string;
        message?: string;
      };

      if (!response.ok || !data.ticket) {
        setMessage(data.error ?? "Could not resolve support ticket.");
        return;
      }

      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === ticketId
            ? {
                ...ticket,
                ...data.ticket!,
                userEmail: ticket.userEmail,
                orderStatus: ticket.orderStatus,
                planName: ticket.planName,
                quantity: ticket.quantity,
                totalPriceCents: ticket.totalPriceCents,
                tokens: ticket.tokens,
              }
            : ticket,
        ),
      );
      setMessage(data.message ?? "Support ticket resolved.");
      setLastUpdatedAt(Date.now());
    } catch {
      setMessage("Network error while resolving support ticket.");
    } finally {
      setLoadingTicket("");
    }
  }

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[34px] font-headline font-black uppercase text-primary">
            Payment Support
          </h1>
          <p className="mt-1 text-sm font-body text-primary/70">
            Handle users who paid, scanned an expired QR, or need help matching a KHQR order.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshTickets("all")}
            className="rounded-none border-2 border-primary bg-white px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
          >
            Live: {formatRelativeSeconds(lastUpdatedAt)}
          </button>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Open Tickets" value={openCount.toLocaleString()} note="Need admin action" />
        <MetricCard label="Resolved Tickets" value={resolvedCount.toLocaleString()} note="Closed by admin" />
        <MetricCard label="Total Tickets" value={tickets.length.toLocaleString()} note="Payment support queue" />
      </section>

      <section className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <label className="grid gap-1 text-sm font-headline font-bold uppercase text-primary">
            Search support queue
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Email, order ID, message, plan, or status"
              className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none focus:bg-surface-container-low font-body text-primary"
            />
          </label>
          <div className="grid content-end">
            <div className="flex flex-wrap gap-2 rounded-none border-2 border-primary bg-white p-1 text-sm shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
              {[
                ["open", `${openCount} Open`],
                ["resolved", `${resolvedCount} Resolved`],
                ["all", `${tickets.length} All`],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value as SupportStatusFilter)}
                  className={`rounded-none px-3 py-1.5 font-headline font-bold uppercase ${
                    statusFilter === value
                      ? "bg-[#ffcc00] text-primary border-2 border-primary -my-0.5"
                      : "text-primary hover:bg-[#f2ede5]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {message ? (
          <p className="mt-4 rounded-none border-2 border-primary bg-[#f2ede5] px-4 py-3 text-sm font-body text-primary">
            {message}
          </p>
        ) : null}
      </section>

      <section className="min-w-0 rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-headline font-black uppercase text-primary">Support Tickets</h2>
            <p className="mt-1 text-sm font-body text-primary/70">
              Showing {filteredTickets.length.toLocaleString()} of {tickets.length.toLocaleString()} tickets.
            </p>
          </div>
          <p className="rounded-none border-2 border-primary bg-[#f2ede5] px-3 py-1.5 text-xs font-headline font-bold uppercase text-primary">
            Resolve only after replying to user or fixing the order.
          </p>
        </div>

        <div className="mt-4 grid gap-4">
          {filteredTickets.length === 0 ? (
            <p className="rounded-none border-2 border-dashed border-primary bg-white px-4 py-8 text-center text-sm font-body text-primary/70">
              No support tickets match this filter.
            </p>
          ) : (
            filteredTickets.map((ticket) => (
              <article
                key={ticket.id}
                id={ticket.id}
                className="rounded-none border-2 border-primary bg-white p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={ticket.status} />
                      <span className="rounded-none border border-primary bg-[#f2ede5] px-2 py-0.5 text-xs font-headline font-bold uppercase text-primary">
                        {ticket.orderStatus ?? "missing order"}
                      </span>
                    </div>
                    <h3 className="mt-2 text-xl font-headline font-black text-primary">
                      {ticket.userEmail}
                    </h3>
                    <p className="mt-1 text-xs font-body text-primary/60">
                      Created {formatDateTime(ticket.createdAt)} / Updated {formatDateTime(ticket.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/app/admin/payments#${ticket.paymentOrderId}`}
                      className="rounded-none border-2 border-primary bg-white px-3 py-1.5 text-xs font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
                    >
                      Open Payment
                    </Link>
                    <button
                      type="button"
                      onClick={() => void copyTicket(ticket)}
                      className="rounded-none border-2 border-primary bg-white px-3 py-1.5 text-xs font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
                    >
                      Copy Ticket
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
                  <div className="grid gap-2 rounded-none border-2 border-primary bg-[#f2ede5] p-4 text-sm font-body">
                    <InfoRow label="Order" value={ticket.paymentOrderId} mono />
                    <InfoRow label="Plan" value={ticket.planName ? `${ticket.planName} x ${ticket.quantity}` : "-"} />
                    <InfoRow
                      label="Total"
                      value={ticket.totalPriceCents === null ? "-" : formatUsd(ticket.totalPriceCents)}
                    />
                    <InfoRow label="Tokens" value={ticket.tokens?.toLocaleString() ?? "-"} />
                    <InfoRow label="Ticket" value={ticket.id} mono />
                  </div>
                  <div className="grid gap-2 rounded-none border-2 border-primary bg-[#f2ede5] p-4 text-sm font-body">
                    <p className="font-headline font-bold uppercase text-primary">User message</p>
                    <p className="leading-6 text-primary/80">{ticket.userMessage}</p>
                    {ticket.adminNote ? (
                      <>
                        <p className="mt-2 font-headline font-bold uppercase text-primary">Admin resolution</p>
                        <p className="leading-6 text-primary/80">{ticket.adminNote}</p>
                      </>
                    ) : null}
                  </div>
                </div>

                {ticket.status === "open" ? (
                  <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                    <label className="grid gap-1 text-sm font-headline font-bold uppercase text-primary">
                      Admin resolution note
                      <input
                        value={adminNoteById[ticket.id] ?? ""}
                        onChange={(event) =>
                          setAdminNoteById((prev) => ({ ...prev, [ticket.id]: event.target.value }))
                        }
                        placeholder="Example: replied in Telegram, approved matching payment, or asked for new order"
                        className="rounded-none border-2 border-primary bg-white px-3 py-2 outline-none focus:bg-surface-container-low font-body text-primary"
                      />
                    </label>
                    <div className="grid content-end">
                      <button
                        type="button"
                        disabled={loadingTicket !== ""}
                        onClick={() => void resolveTicket(ticket.id)}
                        className="rounded-none border-2 border-primary bg-primary px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-60"
                      >
                        {loadingTicket === ticket.id ? "Resolving..." : "Resolve Ticket"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 rounded-none border-2 border-primary bg-[#def3e5] px-4 py-3 text-sm font-body text-emerald-900">
                    Resolved {formatDateTime(ticket.resolvedAt)}.
                  </p>
                )}
              </article>
            ))
          )}
        </div>
      </section>
    </section>
  );
}

async function copyTicket(ticket: PaymentSupportTicketWithOrder) {
  const lines = [
    `Ticket: ${ticket.id}`,
    `User: ${ticket.userEmail}`,
    `Order: ${ticket.paymentOrderId}`,
    `Order status: ${ticket.orderStatus ?? "-"}`,
    `Plan: ${ticket.planName ?? "-"} x ${ticket.quantity ?? "-"}`,
    `Total: ${ticket.totalPriceCents === null ? "-" : formatUsd(ticket.totalPriceCents)}`,
    `Tokens: ${ticket.tokens?.toLocaleString() ?? "-"}`,
    `Message: ${ticket.userMessage}`,
  ];
  await navigator.clipboard.writeText(lines.join("\n"));
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <p className="flex justify-between gap-4">
      <span className="text-[#6a7282]">{label}</span>
      <span className={`max-w-[380px] truncate text-right font-semibold ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </p>
  );
}

function StatusPill({ status }: { status: PaymentSupportTicketStatus }) {
  const styles: Record<PaymentSupportTicketStatus, string> = {
    open: "bg-amber-100 text-amber-900 border-amber-900",
    resolved: "bg-[#def3e5] text-emerald-900 border-emerald-900",
  };
  return (
    <span className={`rounded-none border-2 px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider ${styles[status]}`}>
      {status}
    </span>
  );
}

function formatDateTime(input: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatRelativeSeconds(input: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - input) / 1000));
  return seconds <= 2 ? "now" : `${seconds}s ago`;
}
