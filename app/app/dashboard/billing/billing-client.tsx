"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";

import { clearDashboardCache } from "@/app/app/dashboard/dashboard-data-cache";
import { useDashboardUser } from "@/app/app/dashboard/dashboard-user-context";
import { preparePaymentProofImage } from "@/lib/client-payment-proof-image";
import { paymentMethodLabel } from "@/lib/payment-method-label";
import {
  PLAN_COMPARISON_ROWS,
  PLAN_DETAILS,
  type PlanKey,
} from "@/lib/plan-details";
import {
  formatUsd,
  getAudioDurationEstimates,
  type TokenPackPlan,
} from "@/lib/plans";
import type {
  PaymentOrderRecord,
  PaymentSupportTicketRecord,
} from "@/lib/types";
import { Portal } from "@/app/components/portal";

type CheckoutMode =
  | "local_khqr"
  | "payway_qr"
  | "static_payway_qr"
  | "khqrcc_qr";

type BillingClientProps = {
  plans: TokenPackPlan[];
  initialOrders: PaymentOrderRecord[];
  initialSupportTickets: PaymentSupportTicketRecord[];
  paymentInfo: {
    khqrName: string;
    khqrAccount: string;
    telegramHandle: string;
    staticQrImageUrl: string;
    autoVerificationEnabled: boolean;
    checkoutMode: CheckoutMode;
    initialAdminActive: boolean;
  };
  currentBalance: number;
  apiAccess?: {
    hasPaidApiAccess: boolean;
    currentPlanName: string;
    cloneCreditsPerSecond: number;
  } | null;
};

function telegramContact(rawValue: string): { label: string; url: string } {
  const fallbackUrl = "https://t.me/OfficalVoxTTS";
  const raw = rawValue.trim() || fallbackUrl;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const username =
      raw.replace(/\/+$/, "").split("/").pop()?.replace(/^@/, "") ||
      "OfficalVoxTTS";
    return { label: `@${username}`, url: raw };
  }
  const username = raw.replace(/^@/, "") || "OfficalVoxTTS";
  return { label: `@${username}`, url: `https://t.me/${username}` };
}

export function BillingClient({
  plans,
  initialOrders,
  initialSupportTickets,
  paymentInfo,
  currentBalance,
  apiAccess,
}: BillingClientProps) {
  const router = useRouter();
  const currentPlanName = apiAccess?.currentPlanName ?? "Free";
  const currentPlanKey =
    currentPlanName === "Business API"
      ? "business"
      : currentPlanName.startsWith("Creator")
        ? "creator"
        : currentPlanName.startsWith("Pro")
          ? "pro"
          : currentPlanName === "Free"
            ? "free"
            : null;
  const { setTokenBalance } = useDashboardUser();
  const supportContact = telegramContact(paymentInfo.telegramHandle);
  const [orders, setOrders] = useState(initialOrders);
  const [liveBalance, setLiveBalance] = useState(currentBalance);
  const [supportTickets, setSupportTickets] = useState(initialSupportTickets);
  const [activeOrder, setActiveOrder] = useState<PaymentOrderRecord | null>(
    initialOrders.find(
      (order) => order.status === "pending" && order.khqrImageDataUrl,
    ) ?? null,
  );
  const [message, setMessage] = useState("");
  const [loadingPlan, setLoadingPlan] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<PaymentOrderRecord | null>(
    null,
  );
  const [supportOrder, setSupportOrder] = useState<PaymentOrderRecord | null>(
    null,
  );
  const [supportMessage, setSupportMessage] = useState("");
  const [supportLoading, setSupportLoading] = useState(false);
  const [proofOrder, setProofOrder] = useState<PaymentOrderRecord | null>(null);
  const [proofReference, setProofReference] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [proofImageDataUrl, setProofImageDataUrl] = useState<string | null>(
    null,
  );
  const [proofLoading, setProofLoading] = useState(false);
  const [phoneProofLink, setPhoneProofLink] = useState("");
  const [phoneProofQr, setPhoneProofQr] = useState("");
  const [phoneProofLoading, setPhoneProofLoading] = useState(false);
  const [cancelConfirmOrder, setCancelConfirmOrder] =
    useState<PaymentOrderRecord | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showAddMoreModal, setShowAddMoreModal] = useState(false);
  const displayedBalance = Math.max(liveBalance, currentBalance);

  const [prevInitialOrders, setPrevInitialOrders] = useState(initialOrders);
  if (initialOrders !== prevInitialOrders) {
    setPrevInitialOrders(initialOrders);
    setOrders(initialOrders);
  }

  const [prevInitialSupportTickets, setPrevInitialSupportTickets] = useState(
    initialSupportTickets,
  );
  if (initialSupportTickets !== prevInitialSupportTickets) {
    setPrevInitialSupportTickets(initialSupportTickets);
    setSupportTickets(initialSupportTickets);
  }

  const pendingOrders = orders.filter((order) => order.status === "pending");
  const approvedOrders = orders.filter((order) => order.status === "approved");
  const openSupportTickets = supportTickets.filter(
    (ticket) => ticket.status === "open",
  );

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setMessage(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  const refreshOrders = useCallback(async () => {
    try {
      if (
        activeOrder?.status === "pending" &&
        paymentInfo.autoVerificationEnabled
      ) {
        const verificationResponse = await fetch(
          `/api/payments/orders/${activeOrder.id}/verify`,
          {
            method: "POST",
          },
        );
        const verification = (await verificationResponse.json()) as {
          message?: string;
          status?: string;
        };
        if (verification.message) {
          setMessage(verification.message);
        } else if (verification.status === "approved") {
          setMessage("Payment confirmed. Credits added.");
        }
      } else if (activeOrder?.status === "pending") {
        setMessage(
          paymentInfo.checkoutMode === "static_payway_qr"
            ? "Static PayWay QR cannot be checked by API. Credits are added after admin confirms the ABA/Telegram payment notice."
            : "Payment is waiting for confirmation. Credits will be added after the payment notice is matched with this order.",
        );
      }

      const response = await fetch("/api/dashboard/billing", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        orders?: PaymentOrderRecord[];
        supportTickets?: PaymentSupportTicketRecord[];
        currentBalance?: number;
      };
      if (!response.ok || !data.orders) return;

      setOrders(data.orders);
      setSupportTickets(data.supportTickets ?? []);
      if (typeof data.currentBalance === "number") {
        setLiveBalance(data.currentBalance);
        setTokenBalance(data.currentBalance);
      }
      clearDashboardCache("dashboard:billing");
      if (selectedOrder) {
        setSelectedOrder(
          data.orders.find((order) => order.id === selectedOrder.id) ??
            selectedOrder,
        );
      }
      if (activeOrder) {
        const updatedActiveOrder =
          data.orders.find((order) => order.id === activeOrder.id) ?? null;
        setActiveOrder(updatedActiveOrder);
        if (updatedActiveOrder?.status === "approved") {
          setMessage(
            "Payment approved. Your credit balance has been refreshed.",
          );
        }
      }
    } catch (error) {
      setMessage("Could not refresh payment status. Please try again.");
      console.error("[billing] refreshOrders failed:", error);
    }
  }, [
    activeOrder,
    paymentInfo.autoVerificationEnabled,
    paymentInfo.checkoutMode,
    selectedOrder,
    setTokenBalance,
  ]);

  useEffect(() => {
    if (
      !activeOrder ||
      activeOrder.status !== "pending" ||
      !paymentInfo.autoVerificationEnabled
    )
      return;
    const interval = window.setInterval(() => {
      void refreshOrders();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [activeOrder, paymentInfo.autoVerificationEnabled, refreshOrders]);

  async function createOrder(
    planId: string,
    options: { openCheckout?: boolean } = {},
  ) {
    setLoadingPlan(planId);
    setMessage("");

    try {
      const response = await fetch("/api/payments/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          quantity: 1,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        order?: PaymentOrderRecord;
        telegram?: { sent: boolean; reason?: string };
      };

      if (!response.ok || !data.order) {
        setMessage(data.error ?? "Could not create payment order.");
        return;
      }

      setOrders((prev) => [data.order!, ...prev]);
      clearDashboardCache("dashboard:billing");
      setActiveOrder(data.order);
      setShowAddMoreModal(false);
      if (options.openCheckout) {
        router.push(`/app/checkout?orderId=${data.order.id}`);
        return;
      }
      setSelectedOrder(data.order);
    } catch {
      setMessage("Network error while creating payment order.");
    } finally {
      setLoadingPlan("");
    }
  }

  async function submitSupportRequest() {
    if (!supportOrder) return;
    setSupportLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/payments/orders/${supportOrder.id}/support`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: supportMessage }),
        },
      );
      const data = (await response.json()) as {
        ticket?: PaymentSupportTicketRecord;
        telegram?: { sent: boolean; reason?: "not_configured" | "failed" };
        error?: string;
        message?: string;
      };

      if (!response.ok || !data.ticket) {
        setMessage(data.error ?? "Could not send support request.");
        return;
      }

      setSupportTickets((prev) => {
        const withoutDuplicate = prev.filter(
          (ticket) => ticket.id !== data.ticket!.id,
        );
        return [data.ticket!, ...withoutDuplicate];
      });
      const telegramNote = data.telegram?.sent
        ? " Admin Telegram was notified."
        : data.telegram?.reason === "failed"
          ? " Support was saved, but Telegram notification failed."
          : "";
      setMessage(`${data.message ?? "Support request sent."}${telegramNote}`);
      setSupportOrder(null);
      setSupportMessage("");
      clearDashboardCache("dashboard:billing");
    } catch {
      setMessage("Network error while sending support request.");
    } finally {
      setSupportLoading(false);
    }
  }

  async function createPhoneProofLink(order: PaymentOrderRecord) {
    setPhoneProofLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/payments/orders/${order.id}/proof-link`,
        {
          cache: "no-store",
        },
      );
      const data = (await response.json()) as {
        error?: string;
        uploadUrl?: string;
        qrDataUrl?: string;
      };
      if (!response.ok || !data.uploadUrl || !data.qrDataUrl) {
        setMessage(data.error ?? "Could not create phone upload link.");
        return;
      }
      setPhoneProofLink(data.uploadUrl);
      setPhoneProofQr(data.qrDataUrl);
    } catch {
      setMessage("Network error while creating phone upload link.");
    } finally {
      setPhoneProofLoading(false);
    }
  }

  async function handleProofImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("Preparing receipt screenshot...");
    const image = await preparePaymentProofImage(file);
    if (!image.ok) {
      setProofImageDataUrl(null);
      setMessage(image.error);
      return;
    }
    setProofImageDataUrl(image.dataUrl);
    setMessage(
      image.compressed
        ? "Receipt attached. Large screenshot was compressed automatically."
        : "",
    );
  }

  async function submitPaymentProof() {
    if (!proofOrder) return;
    setProofLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/payments/orders/${proofOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentReference: proofReference,
          userNote: proofNote,
          proofImageDataUrl,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        order?: PaymentOrderRecord;
        telegram?: { sent: boolean; reason?: "not_configured" | "failed" };
      };

      if (!response.ok || !data.order) {
        setMessage(data.error ?? "Could not submit payment confirmation.");
        return;
      }

      setOrders((prev) =>
        prev.map((order) =>
          order.id === data.order!.id ? data.order! : order,
        ),
      );
      setActiveOrder((current) =>
        current?.id === data.order!.id ? data.order! : current,
      );
      setSelectedOrder((current) =>
        current?.id === data.order!.id ? data.order! : current,
      );
      setMessage(
        data.telegram?.sent
          ? "Payment confirmation sent. Admin will approve after matching the receipt."
          : "Payment confirmation saved. Admin will approve after matching the receipt.",
      );
      setProofOrder(null);
      setProofReference("");
      setProofNote("");
      setProofImageDataUrl(null);
      setPhoneProofLink("");
      setPhoneProofQr("");
      clearDashboardCache("dashboard:billing");
    } catch {
      setMessage("Network error while submitting payment confirmation.");
    } finally {
      setProofLoading(false);
    }
  }

  async function cancelOrder(order: PaymentOrderRecord) {
    if (order.status !== "pending") return;

    setCancelLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/payments/orders/${order.id}/cancel`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
        order?: PaymentOrderRecord;
      };

      if (!response.ok || !data.order) {
        setMessage(data.error ?? "Could not cancel payment order.");
        if (data.order) {
          setOrders((prev) =>
            prev.map((item) =>
              item.id === data.order!.id ? data.order! : item,
            ),
          );
          setActiveOrder((current) =>
            current?.id === data.order!.id ? data.order! : current,
          );
        }
        return;
      }

      setOrders((prev) =>
        prev.map((item) => (item.id === data.order!.id ? data.order! : item)),
      );
      setSelectedOrder((current) =>
        current?.id === data.order!.id ? data.order! : current,
      );
      setProofOrder((current) =>
        current?.id === data.order!.id ? null : current,
      );
      setActiveOrder((current) =>
        current?.id === data.order!.id ? null : current,
      );
      setCancelConfirmOrder(null);
      setMessage("Payment order cancelled. No tokens were charged.");
      clearDashboardCache("dashboard:billing");
    } catch {
      setMessage("Network error while cancelling payment order.");
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <div className="grid gap-8 min-w-0">
      <section className="bg-white border-4 border-primary p-4 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative min-w-0">
        <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
          Available Plans
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 mt-2">
          <p className="text-sm text-[#4a4a4a] font-body min-w-0 flex-1">
            Choose one plan per payment. You can buy the same plan again or
            switch to another plan later.
          </p>
          <button
            type="button"
            onClick={() => setShowAddMoreModal(true)}
            className="w-full sm:w-auto rounded-none border-3 border-primary bg-[#10b981] px-5 py-2.5 text-sm font-headline font-black uppercase text-primary shadow-[3px_3px_0px_0px_#1a1a1a] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_#1a1a1a] transition-all cursor-pointer select-none"
          >
            ⚡ Add More Tokens
          </button>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <BillingStatusCard
            label="Token balance"
            value={displayedBalance.toLocaleString()}
            note="Available now"
          />
          <BillingStatusCard
            label="Pending orders"
            value={pendingOrders.length.toLocaleString()}
            note={`${pendingOrders.reduce((sum, order) => sum + order.tokens, 0).toLocaleString()} tokens waiting`}
          />
          <BillingStatusCard
            label="Approved orders"
            value={approvedOrders.length.toLocaleString()}
            note={`${approvedOrders.reduce((sum, order) => sum + order.tokens, 0).toLocaleString()} tokens credited`}
          />
          <BillingStatusCard
            label="Support"
            value={openSupportTickets.length.toLocaleString()}
            note={
              openSupportTickets.length === 1
                ? "Open payment ticket"
                : "Open payment tickets"
            }
          />
        </div>
        <div className="mt-6 flex flex-col lg:grid lg:grid-cols-[1fr_1.25fr] gap-4 border-3 border-primary bg-[#faf7f2] p-4 shadow-[3px_3px_0px_0px_#1a1a1a]">
          <div className="grid gap-2 text-sm font-body">
            <p className="font-headline font-bold uppercase text-sm text-primary">
              Automatic checkout
            </p>
            <p className="flex justify-between gap-3 border-b border-primary/10 pb-1">
              <span className="text-[#4a4a4a]">Name</span>
              <span className="font-bold text-primary">
                {paymentInfo.khqrName}
              </span>
            </p>
            <p className="flex justify-between gap-3 border-b border-primary/10 pb-1">
              <span className="text-[#4a4a4a]">Account</span>
              <span className="font-bold text-primary">
                {paymentInfo.khqrAccount}
              </span>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-[#4a4a4a]">Support</span>
              <a
                href={supportContact.url}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-[#0055ff] hover:underline"
              >
                {supportContact.label}
              </a>
            </p>
          </div>

          <div className="border-2 border-primary bg-[#ffcc00]/10 p-4 text-xs font-semibold leading-relaxed text-[#1a1a1a] font-body shadow-[1px_1px_0px_0px_#1a1a1a]">
            {paymentInfo.autoVerificationEnabled
              ? "The checkout generates the exact ABA QR amount. After payment, automatic verification credits the account."
              : "Automatic checkout is selected, but the server payment credentials are missing."}
          </div>
        </div>

        {message ? (
          <p className="mt-4 border-2 border-primary bg-[#faf7f2] p-3 text-xs font-bold text-primary shadow-[2px_2px_0px_0px_#1a1a1a]">
            {message}
          </p>
        ) : null}

        <div className="mt-8 grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
          <PlanCard
            title="Free"
            price="$0"
            unit=""
            note="Perfect to get started"
            action="Current Plan"
            planKey="free"
            disabled={true}
            isCurrent={currentPlanKey === "free"}
          />
          {plans
            .filter((plan) => !plan.id.startsWith("pack_"))
            .map((plan) => {
              const isCurrent = currentPlanKey === plan.id;
              return (
                <PlanCard
                  key={plan.id}
                  title={plan.name}
                  price={formatUsd(plan.priceCents)}
                  unit=" / pack"
                  note={`${plan.tokens.toLocaleString()} tokens per pack. ${plan.description}`}
                  planKey={plan.id as PlanKey}
                  action={
                    isCurrent
                      ? "Buy Again"
                      : loadingPlan === plan.id
                        ? "Preparing..."
                        : currentPlanKey === "free"
                          ? "Select Plan"
                          : "Switch Plan"
                  }
                  totalPrice={formatUsd(plan.priceCents)}
                  totalTokens={plan.tokens}
                  onAction={() => createOrder(plan.id, { openCheckout: true })}
                  disabled={loadingPlan !== ""}
                  isCurrent={isCurrent}
                />
              );
            })}
          <BusinessPlanCard
            supportContact={supportContact}
            isCurrent={currentPlanKey === "business"}
          />
        </div>
        <PlanComparisonTable />
      </section>

      <section className="bg-white border-4 border-primary p-4 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative min-w-0 mt-6">
        <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
          Payment Orders
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 mt-2">
          <p className="text-sm text-[#4a4a4a] font-body">
            Pending orders wait for payment matching. Approved orders have
            already credited tokens.
          </p>
        </div>
        <div className="smooth-scroll-region overflow-auto border-4 border-primary shadow-[4px_4px_0px_0px_#1a1a1a] bg-white w-full min-w-0">
          <table className="w-full min-w-[1420px] text-left border-collapse">
            <thead>
              <tr className="bg-[#eee9e0] border-b-4 border-primary font-headline uppercase text-xs">
                <th className="p-3 border-r border-primary/20">Created</th>
                <th className="p-3 border-r border-primary/20">Order ID</th>
                <th className="p-3 border-r border-primary/20">Plan</th>
                <th className="p-3 border-r border-primary/20">Qty</th>
                <th className="p-3 border-r border-primary/20">Total</th>
                <th className="p-3 border-r border-primary/20">Tokens</th>
                <th className="p-3 border-r border-primary/20">KHQR Hash</th>
                <th className="p-3 border-r border-primary/20">Expires</th>
                <th className="p-3 border-r border-primary/20">Status</th>
                <th className="p-3 border-r border-primary/20">Paid</th>
                <th className="p-3 border-r border-primary/20">Decision</th>
                <th className="p-3 border-r border-primary/20">Note</th>
                <th className="p-3 border-r border-primary/20">Support</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody className="font-body text-sm font-semibold">
              {orders.length === 0 ? (
                <tr>
                  <td
                    colSpan={14}
                    className="p-8 text-center text-[#4a4a4a] bg-white"
                  >
                    No payment orders yet.
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const supportTicket = supportTickets.find(
                    (ticket) => ticket.paymentOrderId === order.id,
                  );
                  return (
                    <tr
                      key={order.id}
                      className="border-b-4 border-primary hover:bg-[#eee9e0]/40 transition-colors"
                    >
                      <td className="p-3 border-r border-primary/20">
                        {formatDateTime(order.createdAt)}
                      </td>
                      <td className="p-3 border-r border-primary/20 max-w-[140px] truncate font-mono text-xs">
                        {order.id}
                      </td>
                      <td className="p-3 border-r border-primary/20">
                        {order.planName}
                      </td>
                      <td className="p-3 border-r border-primary/20">
                        {order.quantity}
                      </td>
                      <td className="p-3 border-r border-primary/20">
                        {formatUsd(order.totalPriceCents)}
                      </td>
                      <td className="p-3 border-r border-primary/20">
                        {order.tokens.toLocaleString()}
                      </td>
                      <td className="p-3 border-r border-primary/20 max-w-[180px] truncate font-mono text-xs">
                        {order.khqrMd5 || order.paymentReference || "-"}
                      </td>
                      <td className="p-3 border-r border-primary/20">
                        {order.khqrExpiresAt
                          ? formatDateTime(order.khqrExpiresAt)
                          : "-"}
                      </td>
                      <td className="p-3 border-r border-primary/20">
                        <StatusPill status={order.status} />
                      </td>
                      <td className="p-3 border-r border-primary/20">
                        {order.paidAt ? formatProviderAmount(order) : "-"}
                      </td>
                      <td className="p-3 border-r border-primary/20 max-w-[180px]">
                        {order.approvedAt ? (
                          <div className="grid gap-0.5">
                            <span className="font-headline font-bold uppercase text-xs text-emerald-600">
                              Approved
                            </span>
                            <span className="text-[10px] text-[#4a4a4a] font-mono">
                              {formatDateTime(order.approvedAt)}
                            </span>
                          </div>
                        ) : order.rejectedAt ? (
                          <div className="grid gap-0.5">
                            <span className="font-headline font-bold uppercase text-xs text-red-600">
                              Rejected
                            </span>
                            <span className="text-[10px] text-[#4a4a4a] font-mono">
                              {formatDateTime(order.rejectedAt)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[#4a4a4a] font-bold uppercase text-xs">
                            Waiting
                          </span>
                        )}
                      </td>
                      <td className="p-3 border-r border-primary/20 max-w-[220px] truncate text-xs">
                        {order.adminNote || order.userNote || "-"}
                      </td>
                      <td className="p-3 border-r border-primary/20">
                        {supportTicket ? (
                          <div className="grid gap-1">
                            <SupportStatusPill status={supportTicket.status} />
                            {supportTicket.adminNote ? (
                              <span className="max-w-[200px] truncate text-xs text-[#4a4a4a]">
                                {supportTicket.adminNote}
                              </span>
                            ) : (
                              <span className="text-xs text-[#4a4a4a]">
                                Reviewing
                              </span>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSupportOrder(order);
                              setSupportMessage(
                                `I need help with this ${order.status} payment order.`,
                              );
                            }}
                            className="bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-[10px] py-1 px-2.5 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#eee9e0] transition-all cursor-pointer"
                          >
                            Report Issue
                          </button>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {order.status === "pending" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setSelectedOrder(order)}
                                className="bg-[#10b981] text-primary border-2 border-primary font-headline font-bold uppercase text-[10px] py-1 px-2.5 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#ffcc00] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-[1px_1px_0px_0px_#1a1a1a] transition-all cursor-pointer"
                              >
                                I Paid
                              </button>
                              <button
                                type="button"
                                onClick={() => setCancelConfirmOrder(order)}
                                className="bg-[#e63b2e] text-[#f5f0e8] border-2 border-primary font-headline font-bold uppercase text-[10px] py-1 px-2.5 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#e63b2e] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-[1px_1px_0px_0px_#1a1a1a] transition-all cursor-pointer"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSelectedOrder(order)}
                              className="bg-[#1a1a1a] text-[#f5f0e8] border-2 border-primary font-headline font-bold uppercase text-[10px] py-1 px-2.5 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#ffcc00] hover:text-primary hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-[1px_1px_0px_0px_#1a1a1a] transition-all cursor-pointer"
                            >
                              Details
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      <SupportHistorySection
        orders={orders}
        supportTickets={supportTickets}
        onOpenOrder={setSelectedOrder}
        onReportIssue={(order) => {
          setSupportOrder(order);
          setSupportMessage(
            `I need help with this ${order.status} payment order.`,
          );
        }}
      />
      {supportOrder ? (
        <SupportRequestModal
          order={supportOrder}
          value={supportMessage}
          loading={supportLoading}
          onChange={setSupportMessage}
          onCancel={() => {
            setSupportOrder(null);
            setSupportMessage("");
          }}
          onSubmit={submitSupportRequest}
        />
      ) : null}
      {proofOrder ? (
        <PaymentProofModal
          order={proofOrder}
          reference={proofReference}
          note={proofNote}
          imageDataUrl={proofImageDataUrl}
          phoneUploadUrl={phoneProofLink}
          phoneQrDataUrl={phoneProofQr}
          loading={proofLoading}
          phoneLoading={phoneProofLoading}
          onReferenceChange={setProofReference}
          onNoteChange={setProofNote}
          onImageChange={(event) => void handleProofImage(event)}
          onClearImage={() => setProofImageDataUrl(null)}
          onCreatePhoneLink={() => void createPhoneProofLink(proofOrder)}
          onCancel={() => {
            setProofOrder(null);
            setProofReference("");
            setProofNote("");
            setProofImageDataUrl(null);
            setPhoneProofLink("");
            setPhoneProofQr("");
          }}
          onSubmit={submitPaymentProof}
        />
      ) : null}
      {selectedOrder ? (
        <OrderDetailModal
          order={selectedOrder}
          supportTicket={
            supportTickets.find(
              (ticket) => ticket.paymentOrderId === selectedOrder.id,
            ) ?? null
          }
          autoVerificationEnabled={paymentInfo.autoVerificationEnabled}
          onClose={() => setSelectedOrder(null)}
          onCopy={(value, label) => void copyText(value, label)}
          onRefresh={refreshOrders}
          onReportIssue={(order) => {
            setSelectedOrder(null);
            setSupportOrder(order);
            setSupportMessage(
              `I need help with this ${order.status} payment order.`,
            );
          }}
        />
      ) : null}
      {cancelConfirmOrder ? (
        <CancelPaymentModal
          order={cancelConfirmOrder}
          loading={cancelLoading}
          onClose={() => setCancelConfirmOrder(null)}
          onConfirm={() => void cancelOrder(cancelConfirmOrder)}
        />
      ) : null}
      {showAddMoreModal ? (
        <AddMoreTokensModal
          plans={plans.filter((plan) => plan.id.startsWith("pack_"))}
          loadingPlan={loadingPlan}
          error={message}
          onClose={() => {
            setShowAddMoreModal(false);
            setMessage("");
          }}
          onSelectPlan={(planId) => {
            void createOrder(planId);
          }}
        />
      ) : null}
    </div>
  );
}

function SupportHistorySection({
  orders,
  supportTickets,
  onOpenOrder,
  onReportIssue,
}: {
  orders: PaymentOrderRecord[];
  supportTickets: PaymentSupportTicketRecord[];
  onOpenOrder: (order: PaymentOrderRecord) => void;
  onReportIssue: (order: PaymentOrderRecord) => void;
}) {
  const ticketRows = supportTickets.map((ticket) => ({
    ticket,
    order: orders.find((order) => order.id === ticket.paymentOrderId) ?? null,
  }));

  return (
    <section className="bg-white border-4 border-primary p-4 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative min-w-0 mt-6">
      <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
        Payment Support
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 mt-2">
        <p className="text-sm text-[#4a4a4a] font-body">
          Track payment help requests, admin replies, and the linked order
          status.
        </p>
        <span className="border-2 border-primary bg-[#f5f0e8] px-3 py-1 text-xs font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_#1a1a1a]">
          {supportTickets.filter((ticket) => ticket.status === "open").length}{" "}
          open /{" "}
          {
            supportTickets.filter((ticket) => ticket.status === "resolved")
              .length
          }{" "}
          resolved
        </span>
      </div>

      {ticketRows.length === 0 ? (
        <div className="border-4 border-dashed border-primary bg-[#faf7f2] p-8 text-center mt-4 shadow-[2px_2px_0px_0px_#1a1a1a]">
          <p className="text-sm font-headline font-bold uppercase text-primary">
            No support tickets yet
          </p>
          <p className="mt-2 text-xs text-[#4a4a4a] font-body">
            If a payment needs help, use Report Issue from the payment order
            row.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {ticketRows.map(({ ticket, order }) => (
            <article
              key={ticket.id}
              className="border-3 border-primary bg-white p-4 shadow-[3px_3px_0px_0px_#1a1a1a]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-primary/10 pb-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <SupportStatusPill status={ticket.status} />
                    {order ? <StatusPill status={order.status} /> : null}
                  </div>
                  <h3 className="mt-2 text-lg font-headline font-black uppercase text-primary">
                    {order
                      ? `${order.planName} x ${order.quantity}`
                      : "Payment order"}
                  </h3>
                  <p className="mt-1 text-xs text-[#4a4a4a] font-body">
                    Ticket {ticket.id.slice(0, 8)} / Created{" "}
                    {formatDateTime(ticket.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {order ? (
                    <button
                      type="button"
                      onClick={() => onOpenOrder(order)}
                      className="bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-1.5 px-3 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#eee9e0] transition-all cursor-pointer"
                    >
                      Order Details
                    </button>
                  ) : null}
                  {order && ticket.status === "resolved" ? (
                    <button
                      type="button"
                      onClick={() => onReportIssue(order)}
                      className="bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-1.5 px-3 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#eee9e0] transition-all cursor-pointer"
                    >
                      New Issue
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="border-2 border-primary bg-[#faf7f2] p-3 text-xs font-body shadow-[1px_1px_0px_0px_#1a1a1a]">
                  <p className="font-headline font-black uppercase text-[10px] text-primary border-b border-primary/10 pb-1 mb-2">
                    Your message
                  </p>
                  <p className="leading-relaxed font-semibold">
                    {ticket.userMessage}
                  </p>
                </div>
                <div className="border-2 border-primary bg-[#faf7f2] p-3 text-xs font-body shadow-[1px_1px_0px_0px_#1a1a1a]">
                  <p className="font-headline font-black uppercase text-[10px] text-primary border-b border-primary/10 pb-1 mb-2">
                    Admin reply
                  </p>
                  {ticket.adminNote ? (
                    <p className="leading-relaxed font-semibold">
                      {ticket.adminNote}
                    </p>
                  ) : (
                    <p className="leading-relaxed text-[#4a4a4a]">
                      Admin has not replied yet. The ticket is still being
                      reviewed.
                    </p>
                  )}
                  {ticket.resolvedAt ? (
                    <p className="mt-2 text-[10px] text-[#4a4a4a] font-mono">
                      Resolved {formatDateTime(ticket.resolvedAt)}
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function OrderDetailModal({
  order,
  supportTicket,
  autoVerificationEnabled,
  onClose,
  onCopy,
  onRefresh,
  onReportIssue,
}: {
  order: PaymentOrderRecord;
  supportTicket: PaymentSupportTicketRecord | null;
  autoVerificationEnabled: boolean;
  onClose: () => void;
  onCopy: (value: string, label: string) => void;
  onRefresh: () => void;
  onReportIssue: (order: PaymentOrderRecord) => void;
}) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 px-4 py-6 backdrop-blur-xs">
        <section className="w-full max-w-3xl border-4 border-primary bg-[#f5f0e8] p-6 shadow-[8px_8px_0px_0px_#1a1a1a] relative">
          <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
            Payment Order Details
          </div>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b-4 border-primary pb-4">
            <div>
              <h2 className="text-2xl font-headline font-black uppercase text-primary">
                {order.planName} x {order.quantity}
              </h2>
              <p className="mt-1 text-xs text-[#4a4a4a] font-body">
                Created {formatDateTime(order.createdAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-2 px-4 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#eee9e0] transition-all cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="grid gap-2 border-3 border-primary bg-white p-4 text-xs font-body shadow-[2px_2px_0px_0px_#1a1a1a]">
              <DetailRow label="Order ID" value={order.id} mono />
              <DetailRow
                label="Status"
                value={order.status}
                pill={<StatusPill status={order.status} />}
              />
              <DetailRow
                label="Total"
                value={formatUsd(order.totalPriceCents)}
              />
              <DetailRow label="Tokens" value={order.tokens.toLocaleString()} />
              <DetailRow label="KHQR amount" value={formatKhqrAmount(order)} />
              <DetailRow
                label="KHQR hash"
                value={order.khqrMd5 || order.paymentReference || "-"}
                mono
              />
              <DetailRow
                label="Expires"
                value={formatDateTime(order.khqrExpiresAt)}
              />
            </div>

            <div className="grid gap-2 border-3 border-primary bg-white p-4 text-xs font-body shadow-[2px_2px_0px_0px_#1a1a1a]">
              <DetailRow
                label="Provider"
                value={order.paymentProvider ?? "-"}
              />
              <DetailRow
                label="Payment method"
                value={paymentMethodLabel(order)}
              />
              <DetailRow
                label="Provider amount"
                value={formatProviderAmount(order)}
              />
              <DetailRow
                label="Provider transaction"
                value={
                  order.providerTransactionId || order.providerReference || "-"
                }
                mono
              />
              <DetailRow label="Paid at" value={formatDateTime(order.paidAt)} />
              <DetailRow
                label="Approved at"
                value={formatDateTime(order.approvedAt)}
              />
              <DetailRow
                label="Rejected at"
                value={formatDateTime(order.rejectedAt)}
              />
              <DetailRow
                label="Expired at"
                value={formatDateTime(order.expiredAt)}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="border-3 border-primary bg-white p-4 text-xs font-body shadow-[2px_2px_0px_0px_#1a1a1a]">
              <p className="font-headline font-bold uppercase text-xs text-primary border-b border-primary/10 pb-1 mb-2">
                Payment notes
              </p>
              <div className="grid gap-2">
                <DetailRow label="Your note" value={order.userNote || "-"} />
                <DetailRow label="Admin note" value={order.adminNote || "-"} />
                <DetailRow
                  label="Credit status"
                  value={
                    order.tokenTransactionId
                      ? "Tokens credited"
                      : "Not credited yet"
                  }
                />
              </div>
            </div>

            <div className="border-3 border-primary bg-white p-4 text-xs font-body shadow-[2px_2px_0px_0px_#1a1a1a]">
              <p className="font-headline font-bold uppercase text-xs text-primary border-b border-primary/10 pb-1 mb-2">
                Support status
              </p>
              {supportTicket ? (
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SupportStatusPill status={supportTicket.status} />
                    <span className="text-[10px] font-mono text-[#4a4a4a]">
                      Updated {formatDateTime(supportTicket.updatedAt)}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] font-headline font-black uppercase text-[#4a4a4a]">
                      Your message
                    </p>
                    <p className="mt-1 leading-relaxed font-semibold">
                      {supportTicket.userMessage}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-headline font-black uppercase text-[#4a4a4a]">
                      Admin reply
                    </p>
                    <p className="mt-1 leading-relaxed font-semibold">
                      {supportTicket.adminNote || "Admin has not replied yet."}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="leading-relaxed text-[#4a4a4a] font-semibold">
                  No support ticket for this order.
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t-2 border-primary/20 pt-4">
            {order.status === "pending" && (
              <Link
                href={`/app/checkout?orderId=${order.id}`}
                className="bg-[#ffcc00] text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-2 px-4 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#ffcc00] transition-all cursor-pointer inline-flex items-center gap-1"
              >
                <span>Continue to Pay</span>
                <span className="material-symbols-outlined text-sm font-bold">
                  arrow_forward
                </span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => onCopy(order.id, "Order ID")}
              className="bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-2 px-4 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#eee9e0] transition-all cursor-pointer"
            >
              Copy Order ID
            </button>
            <button
              type="button"
              disabled={order.status !== "pending"}
              onClick={onRefresh}
              className="bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-2 px-4 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#eee9e0] transition-all cursor-pointer disabled:opacity-50"
            >
              {autoVerificationEnabled ? "Refresh Payment" : "Refresh Status"}
            </button>
            {!supportTicket || supportTicket.status === "resolved" ? (
              <button
                type="button"
                onClick={() => onReportIssue(order)}
                className="bg-[#1a1a1a] text-[#f5f0e8] font-headline font-bold uppercase text-xs py-2 px-4 border-2 border-primary shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#ffcc00] hover:text-primary transition-all cursor-pointer"
              >
                Report Issue
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </Portal>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
  pill,
}: {
  label: string;
  value: string;
  mono?: boolean;
  pill?: ReactNode;
}) {
  return (
    <p className="flex items-center justify-between gap-4">
      <span className="text-[#4a4a4a] font-semibold">{label}</span>
      {pill ?? (
        <span
          className={`max-w-[180px] sm:max-w-[300px] md:max-w-[390px] truncate text-right font-bold ${mono ? "font-mono text-xs" : ""}`}
        >
          {value}
        </span>
      )}
    </p>
  );
}

function CancelPaymentModal({
  order,
  loading,
  onClose,
  onConfirm,
}: {
  order: PaymentOrderRecord;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-xs">
        <section className="w-full max-w-lg border-4 border-primary bg-[#f5f0e8] p-6 shadow-[8px_8px_0px_0px_#1a1a1a] relative">
          <div className="absolute -top-4 -left-4 bg-[#e63b2e] text-white border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase">
            Cancel Order
          </div>

          <h2 className="mt-4 text-2xl font-headline font-black uppercase text-primary">
            Cancel this payment?
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#4a4a4a] font-body">
            Use this only if you have not paid yet. If you already paid, do not
            cancel; click I Paid and upload the receipt.
          </p>

          <div className="mt-4 grid gap-2 border-3 border-primary bg-white p-4 text-xs font-body shadow-[2px_2px_0px_0px_#1a1a1a]">
            <DetailRow label="Order ID" value={order.id} mono />
            <DetailRow label="Total" value={formatUsd(order.totalPriceCents)} />
            <DetailRow label="Tokens" value={order.tokens.toLocaleString()} />
            <DetailRow
              label="Status"
              value={order.status}
              pill={<StatusPill status={order.status} />}
            />
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-2 px-4 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#eee9e0] transition-all cursor-pointer disabled:opacity-60"
            >
              Keep Order
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="bg-[#e63b2e] text-[#f5f0e8] border-2 border-primary font-headline font-bold uppercase text-xs py-2 px-4 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#e63b2e] transition-all cursor-pointer disabled:opacity-60"
            >
              {loading ? "Cancelling..." : "Cancel Payment"}
            </button>
          </div>
        </section>
      </div>
    </Portal>
  );
}

function PaymentProofModal({
  order,
  reference,
  note,
  imageDataUrl,
  phoneUploadUrl,
  phoneQrDataUrl,
  loading,
  phoneLoading,
  onReferenceChange,
  onNoteChange,
  onImageChange,
  onClearImage,
  onCreatePhoneLink,
  onCancel,
  onSubmit,
}: {
  order: PaymentOrderRecord;
  reference: string;
  note: string;
  imageDataUrl: string | null;
  phoneUploadUrl: string;
  phoneQrDataUrl: string;
  loading: boolean;
  phoneLoading: boolean;
  onReferenceChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearImage: () => void;
  onCreatePhoneLink: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const canSubmit = !loading && Boolean(imageDataUrl);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 px-4 py-6 backdrop-blur-xs">
        <section className="w-full max-w-2xl border-4 border-primary bg-[#f5f0e8] p-6 shadow-[8px_8px_0px_0px_#1a1a1a] relative">
          <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
            Payment Confirmation
          </div>

          <h2 className="mt-4 text-2xl font-headline font-black uppercase text-primary">
            Upload receipt for this order
          </h2>
          <p className="mt-2 text-xs leading-5 text-[#4a4a4a] font-body font-semibold">
            Best path: scan the phone upload QR and attach the ABA receipt from
            your phone. No transaction ID or note is required.
          </p>

          <div className="mt-4 grid gap-2 border-3 border-primary bg-white p-4 text-xs font-body shadow-[2px_2px_0px_0px_#1a1a1a]">
            <DetailRow label="Order ID" value={order.id} mono />
            <DetailRow label="Total" value={formatUsd(order.totalPriceCents)} />
            <DetailRow label="Tokens" value={order.tokens.toLocaleString()} />
            <DetailRow
              label="Status"
              value={order.status}
              pill={<StatusPill status={order.status} />}
            />
          </div>

          <div className="mt-4 border-3 border-primary bg-white p-4 shadow-[2px_2px_0px_0px_#1a1a1a]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-primary/10 pb-3">
              <div>
                <p className="text-sm font-headline font-black uppercase text-primary">
                  Upload receipt from phone
                </p>
                <p className="mt-1 text-xs text-[#4a4a4a] font-body font-semibold">
                  Generate a QR, scan it with the phone that made the payment,
                  then upload the ABA receipt directly.
                </p>
              </div>
              <button
                type="button"
                onClick={onCreatePhoneLink}
                disabled={phoneLoading || order.status !== "pending"}
                className="bg-[#1a1a1a] text-white border-2 border-primary font-headline font-bold uppercase text-xs py-2 px-4 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#ffcc00] hover:text-primary transition-all cursor-pointer disabled:opacity-50"
              >
                {phoneLoading
                  ? "Creating..."
                  : phoneQrDataUrl
                    ? "Refresh QR"
                    : "Phone Upload QR"}
              </button>
            </div>
            {phoneQrDataUrl ? (
              <div className="mt-4 grid gap-3 md:grid-cols-[190px_1fr]">
                <div className="border-2 border-primary bg-white p-3 shadow-[2px_2px_0px_0px_#1a1a1a] aspect-square w-full max-w-[180px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={phoneQrDataUrl}
                    alt="Phone proof upload QR"
                    className="aspect-square w-full"
                  />
                </div>
                <div className="grid content-center gap-2 text-xs font-body font-semibold">
                  <p className="font-headline font-black uppercase text-xs text-primary">
                    Scan this QR on your phone.
                  </p>
                  <p className="break-all border-2 border-primary bg-white p-3 font-mono text-xs shadow-[1px_1px_0px_0px_#1a1a1a]">
                    {phoneUploadUrl}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard.writeText(phoneUploadUrl)
                    }
                    className="w-fit bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-1.5 px-3 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#eee9e0] transition-all cursor-pointer"
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <details className="mt-4 border-3 border-primary bg-white p-4 shadow-[2px_2px_0px_0px_#1a1a1a] group">
            <summary className="cursor-pointer text-sm font-headline font-black uppercase text-primary list-none flex items-center justify-between">
              <span>Backup: upload from this computer</span>
              <span className="text-xs font-bold transition-transform group-open:rotate-180">
                ▼
              </span>
            </summary>
            <div className="mt-4 border-t border-primary/10 pt-4">
              <p className="text-xs leading-5 text-[#4a4a4a] font-body font-semibold">
                Use this only if the phone upload is not possible. The receipt
                screenshot is enough.
              </p>

              <label className="mt-4 grid gap-1 text-xs font-headline font-bold uppercase text-primary">
                Receipt screenshot
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={onImageChange}
                  className="border-2 border-primary bg-white px-3 py-2 text-xs font-body shadow-[1px_1px_0px_0px_#1a1a1a] mt-1"
                />
              </label>

              {imageDataUrl ? (
                <div className="mt-4 border-2 border-primary bg-[#faf7f2] p-3 shadow-[2px_2px_0px_0px_#1a1a1a]">
                  <div className="flex items-center justify-between gap-3 border-b border-primary/10 pb-2 mb-2">
                    <p className="text-xs font-headline font-bold uppercase text-primary">
                      Receipt attached
                    </p>
                    <button
                      type="button"
                      onClick={onClearImage}
                      disabled={loading}
                      className="bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-1 px-3 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#eee9e0] transition-all cursor-pointer disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageDataUrl}
                    alt="Payment receipt preview"
                    className="mt-3 max-h-72 w-full border-2 border-primary object-contain"
                  />
                </div>
              ) : null}

              <details className="mt-4 border-2 border-primary bg-[#faf7f2] p-4 shadow-[2px_2px_0px_0px_#1a1a1a] group/opt">
                <summary className="cursor-pointer text-xs font-headline font-bold uppercase text-primary list-none flex items-center justify-between">
                  <span>Optional: transaction ID or note</span>
                  <span className="text-xs transition-transform group-open/opt:rotate-180">
                    ▼
                  </span>
                </summary>
                <div className="mt-4 grid gap-4 border-t border-primary/10 pt-4">
                  <label className="grid gap-1 text-[11px] font-headline font-bold uppercase text-primary">
                    ABA transaction ID or reference (Optional - Recommended for
                    faster approval)
                    <input
                      value={reference}
                      onChange={(event) =>
                        onReferenceChange(event.target.value)
                      }
                      maxLength={200}
                      placeholder="Optional"
                      className="border-2 border-primary px-3 py-2 outline-none shadow-[1px_1px_0px_0px_#1a1a1a] focus:bg-white transition-colors w-full font-body text-xs mt-1"
                    />
                  </label>
                  <label className="grid gap-1 text-[11px] font-headline font-bold uppercase text-primary">
                    Note for admin
                    <textarea
                      value={note}
                      onChange={(event) => onNoteChange(event.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="Optional"
                      className="border-2 border-primary px-3 py-2 outline-none shadow-[1px_1px_0px_0px_#1a1a1a] focus:bg-white transition-colors w-full font-body text-xs mt-1"
                    />
                  </label>
                </div>
              </details>
            </div>
          </details>

          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t-2 border-primary/20 pt-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-2 px-4 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#eee9e0] transition-all cursor-pointer disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit}
              className="bg-[#10b981] text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-2 px-4 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-60"
            >
              {loading ? "Submitting..." : "Submit Receipt"}
            </button>
          </div>
        </section>
      </div>
    </Portal>
  );
}

function SupportRequestModal({
  order,
  value,
  loading,
  onChange,
  onCancel,
  onSubmit,
}: {
  order: PaymentOrderRecord;
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const canSubmit = value.trim().length >= 5 && !loading;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-xs">
        <section className="w-full max-w-xl border-4 border-primary bg-[#f5f0e8] p-6 shadow-[8px_8px_0px_0px_#1a1a1a] relative">
          <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
            Payment Support
          </div>

          <h2 className="mt-4 text-2xl font-headline font-black uppercase text-primary">
            Report a payment problem
          </h2>
          <p className="mt-2 text-xs leading-5 text-[#4a4a4a] font-body font-semibold">
            Send the admin a clear note for this order. Include your Telegram
            name or payment time if it helps.
          </p>
          <div className="mt-4 grid gap-2 border-3 border-primary bg-white p-4 text-xs font-body shadow-[2px_2px_0px_0px_#1a1a1a]">
            <p className="flex justify-between gap-4">
              <span className="text-[#4a4a4a] font-semibold">Order</span>
              <span className="max-w-[180px] sm:max-w-[300px] truncate font-mono text-xs font-bold text-primary">
                {order.id}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-[#4a4a4a] font-semibold">Plan</span>
              <span className="font-bold text-primary">
                {order.planName} x {order.quantity}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-[#4a4a4a] font-semibold">Total</span>
              <span className="font-bold text-primary">
                {formatUsd(order.totalPriceCents)}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-[#4a4a4a] font-semibold">Status</span>
              <StatusPill status={order.status} />
            </p>
          </div>
          <label className="mt-4 grid gap-1 text-xs font-headline font-bold uppercase text-primary">
            Message to admin
            <textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              maxLength={500}
              rows={5}
              placeholder="Example: I paid this QR at 6:42 PM but tokens did not arrive."
              className="border-2 border-primary px-3 py-2 outline-none shadow-[1px_1px_0px_0px_#1a1a1a] focus:bg-[#faf7f2] transition-colors w-full font-body text-xs mt-1"
            />
          </label>
          <p className="mt-1 text-[10px] text-[#4a4a4a] font-semibold">
            {value.length}/500 characters
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-2 px-4 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#eee9e0] transition-all cursor-pointer disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit}
              className="bg-[#1a1a1a] text-white border-2 border-primary font-headline font-bold uppercase text-xs py-2 px-4 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#ffcc00] hover:text-primary transition-all cursor-pointer disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send Support Request"}
            </button>
          </div>
        </section>
      </div>
    </Portal>
  );
}

function BillingStatusCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="border-3 border-primary bg-[#faf7f2] p-4 shadow-[2px_2px_0px_0px_#1a1a1a]">
      <p className="text-xs font-headline font-black uppercase tracking-wider text-[#4a4a4a]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-headline font-black uppercase text-primary leading-none">
        {value}
      </p>
      <p className="mt-1 text-xs text-[#4a4a4a] font-body font-semibold">
        {note}
      </p>
    </article>
  );
}

function PlanCard({
  title,
  price,
  unit,
  note,
  planKey,
  action,
  disabled,
  totalPrice,
  totalTokens,
  onAction,
  isCurrent,
}: {
  title: string;
  price: string;
  unit: string;
  note: string;
  planKey: PlanKey;
  action: string;
  disabled?: boolean;
  totalPrice?: string;
  totalTokens?: number;
  onAction?: () => void;
  isCurrent?: boolean;
}) {
  const audioEstimates =
    typeof totalTokens === "number"
      ? getAudioDurationEstimates(totalTokens)
      : null;

  return (
    <article
      className={`border-4 border-primary p-5 shadow-[4px_4px_0px_0px_#1a1a1a] transition-all relative flex flex-col justify-between ${
        isCurrent ? "bg-[#ffcc00]/10" : "bg-white"
      }`}
    >
      {isCurrent && (
        <span className="absolute -top-3.5 -left-3.5 border-2 border-primary bg-[#10b981] px-2.5 py-0.5 text-[10px] font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_#1a1a1a] z-10">
          Current Plan
        </span>
      )}
      <div>
        <h3 className="text-3xl font-headline font-black uppercase text-primary">
          {title}
        </h3>
        <p className="mt-2 text-xs text-[#4a4a4a] font-body min-h-[48px]">
          {note}
        </p>
        <p className="mt-4 text-4xl font-headline font-black uppercase text-primary">
          {price}
          <span className="text-sm font-bold lowercase text-[#4a4a4a] ml-1">
            {unit}
          </span>
        </p>
        {typeof totalTokens === "number" ? (
          <div className="mt-4 grid gap-2 border-2 border-primary bg-[#faf7f2] p-3 text-xs font-body shadow-[1px_1px_0px_0px_#1a1a1a]">
            <p className="flex justify-between font-semibold font-body">
              <span>Plan price</span>
              <span className="font-bold text-primary">{totalPrice}</span>
            </p>
            <p className="flex justify-between font-semibold border-t border-primary/10 pt-1 font-body">
              <span>Tokens</span>
              <span className="font-bold text-primary">
                {totalTokens?.toLocaleString()}
              </span>
            </p>
            {audioEstimates ? (
              <>
                <p className="flex justify-between gap-3 border-t border-primary/10 pt-1 font-semibold font-body">
                  <span>Standard voice</span>
                  <span className="text-right font-bold text-primary">
                    ~{audioEstimates.standard}
                  </span>
                </p>
                <p className="flex justify-between gap-3 font-semibold font-body">
                  <span>Clone voice</span>
                  <span className="text-right font-bold text-primary">
                    ~{audioEstimates.clone}
                  </span>
                </p>
              </>
            ) : null}
          </div>
        ) : null}
        <PlanDetailBlock planKey={planKey} />
      </div>
      <button
        type="button"
        disabled={disabled || isCurrent}
        onClick={onAction}
        className={`mt-5 w-full border-2 border-primary font-headline font-bold uppercase text-xs py-2.5 px-4 shadow-[2px_2px_0px_0px_#1a1a1a] transition-all cursor-pointer ${
          isCurrent
            ? "bg-[#10b981] text-primary cursor-default"
            : "bg-[#1a1a1a] text-white hover:bg-[#ffcc00] hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        }`}
      >
        {isCurrent ? "Current Plan" : action}
      </button>
    </article>
  );
}

function BusinessPlanCard({
  supportContact,
  isCurrent,
}: {
  supportContact: { label: string; url: string };
  isCurrent?: boolean;
}) {
  const features = [
    "High-volume clone voice API",
    "Business clone rate starts at 1.5 tokens/sec",
    "High-volume prepaid can request 1 token/sec",
    "Custom token limits",
    "Higher concurrency",
    "Batch jobs and webhooks",
  ];

  return (
    <article
      className={`border-4 border-primary p-5 shadow-[4px_4px_0px_0px_#1a1a1a] transition-all relative flex flex-col justify-between ${
        isCurrent ? "bg-[#0c1e15] text-white" : "bg-[#1a1a1a] text-white"
      }`}
    >
      {isCurrent && (
        <span className="absolute -top-3.5 -left-3.5 border-2 border-primary bg-[#10b981] px-2.5 py-0.5 text-[10px] font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_#1a1a1a] z-10">
          Current Plan
        </span>
      )}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-3xl font-headline font-black uppercase text-[#ffcc00]">
              Business
            </h3>
            <p className="mt-2 text-xs text-[#c9d2df] font-body min-h-[48px]">
              For companies, dubbing teams, and customer systems that need
              reliable clone voice generation.
            </p>
          </div>
          <span className="border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-headline font-bold uppercase">
            Custom
          </span>
        </div>

        <p className="mt-4 text-3xl font-headline font-black uppercase text-white leading-none">
          Talk to us
          <span className="block pt-1 text-xs font-body font-semibold text-[#c9d2df] normal-case">
            review before payment
          </span>
        </p>

        <ul className="mt-4 grid gap-2 border border-white/10 bg-white/[0.06] p-3 text-xs font-body shadow-[1px_1px_0px_0px_rgba(255,255,255,0.1)]">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-2 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 border border-white/10 bg-white/[0.06] p-3 text-xs font-body shadow-[1px_1px_0px_0px_rgba(255,255,255,0.1)]">
          <p className="font-bold text-[#ffcc00] uppercase font-headline">
            Business clone rate
          </p>
          <p className="mt-1 font-semibold">
            Only Business plan accounts can use this rate.
          </p>
          <p className="mt-1 font-semibold text-[#c9d2df]">
            Paid token packs use standard clone at 2 tokens/sec.
          </p>
        </div>
        <PlanDetailBlock planKey="business" dark />
      </div>

      <div className="mt-5 grid gap-2 pt-4 border-t border-white/10">
        {isCurrent ? (
          <span className="w-full border-2 border-primary bg-[#10b981] px-4 py-2.5 text-center text-xs font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_#1a1a1a]">
            Current Plan
          </span>
        ) : (
          <Link
            href="/app/dashboard/business"
            className="w-full border-2 border-primary bg-white text-primary font-headline font-bold uppercase text-xs py-2.5 px-4 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#ffcc00] hover:text-primary transition-all text-center block"
          >
            Talk to us
          </Link>
        )}
        <a
          href={supportContact.url}
          target="_blank"
          rel="noreferrer"
          className="w-full border-2 border-white/20 bg-transparent text-white font-headline font-bold uppercase text-xs py-2.5 px-4 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)] hover:bg-white/10 transition-all text-center block cursor-pointer"
        >
          Contact {supportContact.label}
        </a>
      </div>
    </article>
  );
}

function PlanDetailBlock({
  planKey,
  dark = false,
}: {
  planKey: PlanKey;
  dark?: boolean;
}) {
  const detail = PLAN_DETAILS[planKey];
  const containerClass = dark
    ? "border-white/10 bg-white/[0.06] text-[#eef4ff] shadow-[1px_1px_0px_0px_rgba(255,255,255,0.1)]"
    : "border-2 border-primary bg-white text-[#2f3746] shadow-[1px_1px_0px_0px_#1a1a1a]";
  const labelClass = dark ? "text-[#ffcc00]" : "text-primary";

  return (
    <div
      className={`mt-4 grid gap-3 border-2 p-3 text-xs font-body ${containerClass}`}
    >
      <div>
        <p
          className={`font-headline font-black uppercase text-[10px] tracking-wider ${labelClass}`}
        >
          Best for
        </p>
        <p className="mt-1 leading-relaxed font-semibold">{detail.bestFor}</p>
      </div>
      <div>
        <p
          className={`font-headline font-black uppercase text-[10px] tracking-wider ${labelClass}`}
        >
          Can use
        </p>
        <ul className="mt-1.5 grid gap-1 font-semibold">
          {detail.canUse.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-[#10b981]">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p
          className={`font-headline font-black uppercase text-[10px] tracking-wider ${labelClass}`}
        >
          {planKey === "business" ? "Requires" : "Not included"}
        </p>
        <ul className="mt-1.5 grid gap-1 font-semibold">
          {detail.cannotUse.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-[#e63b2e]">✗</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PlanComparisonTable() {
  return (
    <div className="mt-6 border-4 border-primary bg-white shadow-[4px_4px_0px_0px_#1a1a1a] min-w-0 w-full">
      <div className="border-b-4 border-primary bg-[#eee9e0] p-4">
        <h3 className="text-xl font-headline font-black uppercase text-primary">
          Full plan details
        </h3>
        <p className="mt-1 text-xs text-[#4a4a4a] font-body font-semibold">
          Compare what each plan can use before buying tokens or requesting
          Business API access.
        </p>
      </div>
      <div className="smooth-scroll-region overflow-x-auto w-full min-w-0">
        <table className="w-full min-w-[980px] text-sm border-collapse">
          <thead>
            <tr className="bg-[#eee9e0] border-b-4 border-primary font-headline uppercase text-xs text-left text-primary">
              <th className="p-3 border-r border-primary/20">Feature</th>
              <th className="p-3 border-r border-primary/20">Free</th>
              <th className="p-3 border-r border-primary/20">Creator</th>
              <th className="p-3 border-r border-primary/20">Pro</th>
              <th className="p-3">Business</th>
            </tr>
          </thead>
          <tbody className="font-body text-xs font-semibold text-[#2f3746]">
            {PLAN_COMPARISON_ROWS.map((row) => (
              <tr
                key={row.feature}
                className="border-b-2 border-primary/20 hover:bg-[#eee9e0]/20 transition-colors"
              >
                <td className="p-3 border-r border-primary/20 font-headline font-black uppercase text-primary">
                  {row.feature}
                </td>
                <td className="p-3 border-r border-primary/20">{row.free}</td>
                <td className="p-3 border-r border-primary/20">
                  {row.creator}
                </td>
                <td className="p-3 border-r border-primary/20">{row.pro}</td>
                <td className="p-3">{row.business}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDateTime(input: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatProviderAmount(order: PaymentOrderRecord): string {
  if (order.providerAmount === null || !order.providerCurrency) return "-";
  return order.providerCurrency === "USD"
    ? `$${order.providerAmount.toFixed(2)}`
    : `${Math.round(order.providerAmount).toLocaleString()} KHR`;
}

function formatKhqrAmount(order: PaymentOrderRecord): string {
  if (order.khqrAmount === null || !order.khqrCurrency)
    return formatUsd(order.totalPriceCents);
  return order.khqrCurrency === "USD"
    ? `$${order.khqrAmount.toFixed(2)}`
    : `${Math.round(order.khqrAmount).toLocaleString()} KHR`;
}

function StatusPill({ status }: { status: PaymentOrderRecord["status"] }) {
  const styles: Record<PaymentOrderRecord["status"], string> = {
    pending: "border-primary bg-[#ffcc00] text-primary",
    approved: "border-primary bg-[#10b981] text-primary",
    rejected: "border-primary bg-[#e63b2e] text-white",
    expired: "border-primary bg-[#eee9e0] text-[#4a4a4a]",
    cancelled: "border-primary bg-[#eee9e0] text-[#4a4a4a]",
  };
  return (
    <span
      className={`w-fit border-2 font-headline font-bold uppercase text-[10px] px-2 py-0.5 shadow-[1px_1px_0px_0px_#1a1a1a] ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function SupportStatusPill({
  status,
}: {
  status: PaymentSupportTicketRecord["status"];
}) {
  const styles: Record<PaymentSupportTicketRecord["status"], string> = {
    open: "border-primary bg-[#ffcc00] text-primary",
    resolved: "border-primary bg-[#10b981] text-primary",
  };
  return (
    <span
      className={`w-fit border-2 font-headline font-bold uppercase text-[10px] px-2 py-0.5 shadow-[1px_1px_0px_0px_#1a1a1a] ${styles[status]}`}
    >
      support {status}
    </span>
  );
}

function AddMoreTokensModal({
  plans,
  loadingPlan,
  error,
  onClose,
  onSelectPlan,
}: {
  plans: TokenPackPlan[];
  loadingPlan: string;
  error?: string;
  onClose: () => void;
  onSelectPlan: (planId: string) => void;
}) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-xs">
        <section className="w-full max-w-xl border-4 border-primary bg-[#f5f0e8] p-6 shadow-[8px_8px_0px_0px_#1a1a1a] relative">
          <div className="absolute -top-4 -left-4 bg-[#10b981] text-primary border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase">
            Add More Tokens
          </div>

          <div className="mt-4 flex justify-between items-center border-b-4 border-primary pb-3">
            <h2 className="text-2xl font-headline font-black uppercase text-primary">
              Select Token Pack
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={loadingPlan !== ""}
              className="bg-white text-primary border-2 border-primary font-headline font-bold uppercase text-xs py-1.5 px-3 shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-[#eee9e0] transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              Cancel
            </button>
          </div>

          {error && (
            <div className="mt-4 border-2 border-primary bg-[#ffdad6] p-3 text-xs font-bold text-[#93000a] shadow-[2px_2px_0px_0px_#1a1a1a]">
              {error}
            </div>
          )}

          <p className="mt-4 text-xs font-body text-[#4a4a4a] leading-relaxed">
            Select one of our token add-on packages to credit your balance. Your
            payment request will generate instantly.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {plans.map((plan) => {
              const audioEstimates = getAudioDurationEstimates(plan.tokens);
              return (
                <article
                  key={plan.id}
                  className="border-3 border-primary bg-white p-4 shadow-[3px_3px_0px_0px_#1a1a1a] flex flex-col justify-between"
                >
                  <div>
                    <h3 className="font-headline font-black uppercase text-lg text-primary">
                      {plan.name}
                    </h3>
                    <p className="mt-1 text-2xl font-headline font-black text-[#10b981]">
                      {formatUsd(plan.priceCents)}
                    </p>
                    <p className="mt-2 text-xs font-body text-[#4a4a4a]">
                      {plan.tokens.toLocaleString()} tokens included.
                    </p>
                    <div className="mt-3 grid gap-1 border-t border-primary/15 pt-2 text-xs font-body font-semibold text-[#4a4a4a]">
                      <p className="flex justify-between gap-3">
                        <span>Standard voice</span>
                        <span className="text-primary">
                          ~{audioEstimates.standard}
                        </span>
                      </p>
                      <p className="flex justify-between gap-3">
                        <span>Clone voice</span>
                        <span className="text-primary">
                          ~{audioEstimates.clone}
                        </span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectPlan(plan.id)}
                    disabled={loadingPlan !== ""}
                    className="mt-4 w-full rounded-none border-2 border-primary bg-[#ffcc00] py-2 text-xs font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_#1a1a1a] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {loadingPlan === plan.id ? "Preparing..." : "Choose Pack"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </Portal>
  );
}
