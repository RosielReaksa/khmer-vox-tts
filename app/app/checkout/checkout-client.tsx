"use client";

import { useState, useEffect, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { preparePaymentProofImage } from "@/lib/client-payment-proof-image";
import { VoxLoader } from "@/app/components/vox-loader";
import Link from "next/link";

type PaymentOrderRecord = {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  quantity: number;
  totalPriceCents: number;
  tokens: number;
  khqrPayload: string | null;
  khqrMd5: string | null;
  khqrImageDataUrl: string | null;
  khqrCurrency: "USD" | "KHR" | null;
  khqrAmount: number | null;
  khqrExpiresAt: string | null;
  paymentProvider: string | null;
  status: string;
  proofImageDataUrl?: string | null;
  adminNote?: string | null;
};

type CheckoutClientProps = {
  userEmail: string;
  tokenBalance: number;
  suspendedAt: string | null;
  suspendedReason: string | null;
  paymentInfo: {
    khqrName: string;
    khqrAccount: string;
    telegramHandle: string;
    staticQrImageUrl: string;
    autoVerificationEnabled: boolean;
    checkoutMode: "local_khqr" | "payway_qr" | "static_payway_qr";
  };
};

const PLAN_INFO = {
  starter: {
    id: "starter" as const,
    name: "Starter Pack",
    priceUsd: 0.20,
    priceCents: 20,
    tokens: 1000,
    features: ["1,000 prepaid tokens", "API Key Access", "Standard TTS Synthesis"],
  },
  creator: {
    id: "creator" as const,
    name: "Creator Pack",
    priceUsd: 1.50,
    priceCents: 150,
    tokens: 10000,
    features: ["10,000 prepaid tokens", "API Key Access", "Voice Cloning Synthesis"],
  },
  pack_5: {
    id: "pack_5" as const,
    name: "40K Token Pack",
    priceUsd: 5.00,
    priceCents: 500,
    tokens: 40000,
    features: ["40,000 prepaid tokens", "API Key Access", "Voice Cloning Synthesis"],
  },
  pack_10: {
    id: "pack_10" as const,
    name: "85K Token Pack",
    priceUsd: 10.00,
    priceCents: 1000,
    tokens: 85000,
    features: ["85,000 prepaid tokens", "API Key Access", "Voice Cloning Synthesis"],
  },
  pack_15: {
    id: "pack_15" as const,
    name: "130K Token Pack",
    priceUsd: 15.00,
    priceCents: 1500,
    tokens: 130000,
    features: ["130,000 prepaid tokens", "API Key Access", "Voice Cloning Synthesis"],
  },
  pack_20: {
    id: "pack_20" as const,
    name: "180K Token Pack",
    priceUsd: 20.00,
    priceCents: 2000,
    tokens: 180000,
    features: ["180,000 prepaid tokens", "API Key Access", "Voice Cloning Synthesis"],
  },
};

export function CheckoutClient({
  userEmail,
  tokenBalance,
  suspendedAt,
  suspendedReason,
  paymentInfo,
}: CheckoutClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Determine initial plan
  const planParam = searchParams.get("plan") || searchParams.get("planId") || "creator";
  const initialPlanId = (planParam in PLAN_INFO) ? (planParam as keyof typeof PLAN_INFO) : "creator";

  const [selectedPlanId, setSelectedPlanId] = useState<keyof typeof PLAN_INFO>(initialPlanId);
  const [order, setOrder] = useState<PaymentOrderRecord | null>(null);
  const [loadedOrderId, setLoadedOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [selectedBank, setSelectedBank] = useState<"ABA" | "ACLEDA">("ABA");
  const [orderIdCopied, setOrderIdCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

  const handleCopyOrderIdLocal = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setOrderIdCopied(true);
      setTimeout(() => setOrderIdCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  // Handle cancel order
  const handleCancelOrder = async () => {
    if (!order) {
      router.push("/app/dashboard/billing");
      return;
    }

    setCancelling(true);
    setError(null);
    try {
      const response = await fetch(`/api/payments/orders/${order.id}/cancel`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Failed to cancel order.");
        setCancelling(false);
        return;
      }
      router.push("/app/dashboard/billing");
    } catch (err) {
      console.error(err);
      setError("Network error while cancelling order.");
      setCancelling(false);
    }
  };

  // Verification form states
  const [transactionId, setTransactionId] = useState("");
  const [proofImageBase64, setProofImageBase64] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const hasSubmittedProof = success || Boolean(order?.proofImageDataUrl);

  const plan = PLAN_INFO[selectedPlanId];
  const orderIdParam = searchParams.get("orderId");
  const total = order ? order.totalPriceCents / 100 : Math.round((plan.priceUsd * 1.1) * 100) / 100;
  const subtotal = order ? total / 1.1 : plan.priceUsd;
  const tax = total - subtotal;

  // Initialize payment order
  async function createOrder(planId: keyof typeof PLAN_INFO) {
    if (suspendedAt) {
      setError(`Your account is suspended. Reason: ${suspendedReason || "Violation of usage policy."}`);
      return;
    }

    setLoading(true);
    setError(null);
    setInfoMessage(null);
    setOrder(null);
    
    // Clear proof upload states
    setTransactionId("");
    setProofImageBase64(null);
    setPreviewUrl(null);

    try {
      const response = await fetch("/api/payments/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          quantity: 1,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.order) {
        setError(data.error ?? "Failed to initialize payment invoice.");
        return;
      }

      setOrder(data.order);
      setInfoMessage(
        paymentInfo.checkoutMode === "static_payway_qr"
          ? "Scan static PayWay QR and pay exact amount manually, then upload receipt."
          : "Bakong KHQR generated dynamically. Scan with any Cambodian banking app."
      );
    } catch (err) {
      console.error(err);
      setError("Network error while generating KHQR code.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!order?.khqrExpiresAt || order.status !== "pending") {
      Promise.resolve().then(() => {
        setTimeLeft(null);
        setIsExpired(order?.status === "expired" || order?.status === "cancelled");
      });
      return;
    }

    const expiresAt = new Date(order.khqrExpiresAt).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diff = expiresAt - now;

      if (diff <= 0) {
        setTimeLeft("00:00");
        setIsExpired(true);
        // Automatically trigger auto-cancel on backend
        fetch(`/api/payments/orders/${order.id}/cancel`, { method: "POST" })
          .then(() => void router.refresh())
          .catch(console.error);
        return true;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      const minStr = String(minutes).padStart(2, "0");
      const secStr = String(seconds).padStart(2, "0");
      setTimeLeft(`${minStr}:${secStr}`);
      setIsExpired(false);
      return false;
    };

    const isEnded = updateTimer();
    if (isEnded) return;

    const interval = setInterval(() => {
      const ended = updateTimer();
      if (ended) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [order?.khqrExpiresAt, order?.status, order?.id, router]);

  // Poll order status if proof has been submitted and order is pending
  useEffect(() => {
    if (!hasSubmittedProof || !order?.id) return;
    if (order.status !== "pending" && order.status !== "user_reported_paid") return;

    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/payments/orders/${order.id}`);
        if (!response.ok) return;
        const data = await response.json();
        if (data.order) {
          const updatedOrder = data.order as PaymentOrderRecord;
          if (updatedOrder.status !== order.status || updatedOrder.adminNote !== order.adminNote) {
            setOrder(updatedOrder);
          }
        }
      } catch (err) {
        console.error("Error polling order status:", err);
      }
    };

    const timerId = setInterval(pollStatus, 5000);

    return () => clearInterval(timerId);
  }, [hasSubmittedProof, order?.id, order?.status, order?.adminNote]);

  // Manage redirect timer upon order approval
  useEffect(() => {
    if (order?.status === "approved" && hasSubmittedProof) {
      Promise.resolve().then(() => {
        setRedirectCountdown(3);
      });
    }
  }, [order?.status, hasSubmittedProof]);

  useEffect(() => {
    if (redirectCountdown === null) return;
    if (redirectCountdown <= 0) {
      router.push("/app/dashboard");
      return;
    }

    const timer = setTimeout(() => {
      setRedirectCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [redirectCountdown, router]);

  // Auto-generate or load order
  useEffect(() => {
    let active = true;

    if (orderIdParam) {
      if (loadedOrderId === orderIdParam) return;

      async function loadOrder() {
        if (suspendedAt) {
          if (active) setError(`Your account is suspended. Reason: ${suspendedReason || "Violation of usage policy."}`);
          return;
        }
        if (active) {
          setLoading(true);
          setError(null);
          setInfoMessage(null);
          setOrder(null);
        }
        
        try {
          const response = await fetch(`/api/payments/orders/${orderIdParam}`);
          const data = await response.json();
          if (!response.ok || !data.order) {
            if (active) setError(data.error ?? "Failed to load payment order.");
            return;
          }
          const loadedOrder = data.order as PaymentOrderRecord;
          if (active) {
            setOrder(loadedOrder);
            setLoadedOrderId(orderIdParam);
            
            const orderPlanId = (loadedOrder.planId in PLAN_INFO) ? (loadedOrder.planId as keyof typeof PLAN_INFO) : "creator";
            setSelectedPlanId(orderPlanId);
            setInfoMessage(
              paymentInfo.checkoutMode === "static_payway_qr"
                ? "Scan static PayWay QR and pay exact amount manually, then upload receipt."
                : "Bakong KHQR loaded for this order. Scan with any Cambodian banking app."
            );
          }
        } catch (err) {
          console.error(err);
          if (active) setError("Network error while loading payment order.");
        } finally {
          if (active) setLoading(false);
        }
      }
      void loadOrder();
    } else {
      Promise.resolve().then(() => {
        if (active) {
          void createOrder(selectedPlanId);
        }
      });
    }

    return () => {
      active = false;
    };
  }, [orderIdParam, selectedPlanId, loadedOrderId, suspendedAt, suspendedReason, paymentInfo.checkoutMode]);

  // Handle plan selection switch
  const handlePlanSwitch = (planId: keyof typeof PLAN_INFO) => {
    setSelectedPlanId(planId);
    setLoadedOrderId(null);
    // Update URL query string
    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      params.set("plan", planId);
      params.delete("orderId");
      router.push(`/app/checkout?${params.toString()}`);
    });
  };

  // Convert and compress selected image file
  async function processImageFile(file: File) {
    setError(null);
    setInfoMessage("Compressing screenshot file...");

    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);

    const result = await preparePaymentProofImage(file);
    if (!result.ok) {
      setError(result.error);
      setPreviewUrl(null);
      setProofImageBase64(null);
      setInfoMessage(null);
      return;
    }

    setProofImageBase64(result.dataUrl);
    setInfoMessage(
      result.compressed
        ? "Receipt snapshot attached (compressed automatically to fit limit)."
        : "Receipt snapshot attached successfully."
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processImageFile(file);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processImageFile(file);
    }
  };

  // Submit payment proof
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    if (!proofImageBase64) {
      setError("Please upload a screenshot of your bank payment receipt.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/payments/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentReference: transactionId.trim() || null,
          userNote: `Prepaid checkout for ${order.planName || plan.name}`,
          paymentMethod: selectedBank,
          proofImageDataUrl: proofImageBase64,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.order) {
        setError(data.error ?? "Failed to submit payment confirmation.");
        setSubmitting(false);
        return;
      }

      setOrder(data.order);
      setSuccess(true);
    } catch (err) {
      console.error(err);
      setError("Network error while submitting payment verification.");
      setSubmitting(false);
    }
  };

  const isStaticPayway = paymentInfo.checkoutMode === "static_payway_qr";
  const qrImageSrc = isStaticPayway ? paymentInfo.staticQrImageUrl : order?.khqrImageDataUrl ?? "";

  // Success / Submission View
  if (hasSubmittedProof) {
    const isApproved = order?.status === "approved";
    const isRejected = order?.status === "rejected";

    return (
      <div className="w-full max-w-2xl mx-auto bg-white border-4 border-primary p-8 shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] text-center my-12 dashboard-enter relative overflow-hidden">
        {/* Style block for confetti keyframes */}
        <style>{`
          @keyframes confettiFall {
            0% {
              transform: translateY(-20px) rotate(0deg);
              opacity: 1;
            }
            100% {
              transform: translateY(600px) rotate(720deg);
              opacity: 0;
            }
          }
          .animate-confetti-fall {
            animation: confettiFall linear infinite;
          }
        `}</style>

        {isApproved && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
            {[...Array(30)].map((_, i) => {
              const left = `${(i * 7) % 100}%`;
              const delay = `${((i * 3) % 10) * 0.2}s`;
              const duration = `${1.5 + ((i * 7) % 5) * 0.4}s`;
              const size = `${6 + (i % 6) * 2}px`;
              const colors = ["#ff0055", "#00ffcc", "#ffcc00", "#0099ff", "#ff9900", "#10b981"];
              const bg = colors[i % colors.length];
              return (
                <div
                  key={i}
                  className="absolute animate-confetti-fall rounded-sm"
                  style={{
                    left,
                    top: "-20px",
                    width: size,
                    height: size,
                    backgroundColor: bg,
                    animationDelay: delay,
                    animationDuration: duration,
                  }}
                />
              );
            })}
          </div>
        )}

        {isApproved ? (
          /* Approved / Celebration State */
          <div className="flex flex-col items-center">
            <div className="bg-[#10b981] text-white border-4 border-primary inline-flex items-center justify-center p-4 mb-6 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] animate-bounce">
              <span className="material-symbols-outlined text-5xl font-black">celebration</span>
            </div>
            
            <span className="bg-[#def3e5] border-2 border-[#128342] text-[#128342] font-sans font-black text-xs uppercase px-3 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] mb-4">
              Payment Approved! 🎉
            </span>

            <h2 className="font-sans font-black text-4xl uppercase tracking-tight mb-2 text-[#128342]">
              +{order?.tokens.toLocaleString()} Tokens Credited!
            </h2>
            <p className="font-body text-base font-bold text-primary mb-6">
              Your token balance has been updated successfully.
            </p>

            {redirectCountdown !== null && (
              <div className="bg-primary text-white border-2 border-primary px-4 py-2 font-mono font-black text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] mb-8">
                Redirecting to dashboard in {redirectCountdown}s...
              </div>
            )}
          </div>
        ) : isRejected ? (
          /* Rejected / Failure State */
          <div className="flex flex-col items-center">
            <div className="bg-[#e63b2e] text-[#f5f0e8] border-4 border-primary inline-flex items-center justify-center p-4 mb-6 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
              <span className="material-symbols-outlined text-5xl font-black">warning</span>
            </div>

            <span className="bg-[#ffdad6] border-2 border-red-800 text-red-800 font-sans font-black text-xs uppercase px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] mb-4 flex items-center gap-1.5 shrink-0 animate-pulse">
              <span className="h-2.5 w-2.5 rounded-full bg-red-600 shrink-0"></span>
              <span>● Receipt Rejected</span>
            </span>

            <h2 className="font-sans font-black text-3xl uppercase tracking-tight mb-3 text-red-800">
              Payment Verification Failed
            </h2>
            <p className="font-body text-sm font-bold text-primary/80 mb-6 max-w-md">
              The administrator has rejected the submitted proof. Please review the reason below or contact support.
            </p>

            {order?.adminNote && (
              <div className="border-4 border-red-800 border-dashed bg-[#ffdad6]/20 p-4 text-left font-body text-sm space-y-1 mb-8 w-full shadow-[4px_4px_0px_0px_rgba(136,34,34,0.15)]">
                <span className="font-sans font-black text-xs uppercase text-red-800 block">Feedback Note:</span>
                <p className="italic font-bold text-primary/95 mt-1">&ldquo;{order.adminNote}&rdquo;</p>
              </div>
            )}

            <div className="bg-[#f5f0e8] border-4 border-primary p-5 text-left font-sans text-sm space-y-3 mb-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] w-full">
              <h4 className="font-black uppercase text-xs text-primary/80 tracking-wider">What should you do next?</h4>
              <ul className="list-disc list-inside space-y-1.5 font-bold text-primary/90">
                <li>
                  Double-check your banking transaction details.
                </li>
                <li>
                  Go back to the billing dashboard, generate a new invoice, and upload a clear receipt image.
                </li>
                <li>
                  Need help? Contact support on Telegram:{" "}
                  <a
                    href={`https://t.me/${paymentInfo.telegramHandle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline font-black"
                  >
                    @{paymentInfo.telegramHandle}
                  </a>
                </li>
              </ul>
            </div>
          </div>
        ) : (
          /* Pending Verification State */
          <div className="flex flex-col items-center">
            <div className="relative flex items-center justify-center p-4 mb-6">
              <div className="animate-spin rounded-full h-20 w-20 border-4 border-amber-500 border-t-transparent shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"></div>
              <span className="material-symbols-outlined text-4xl font-black text-amber-600 absolute animate-pulse">history_toggle_off</span>
            </div>

            <span className="bg-[#fff4cc] border-2 border-amber-600 text-amber-800 font-sans font-black text-xs uppercase px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] mb-4 flex items-center gap-2 shrink-0">
              <svg className="animate-spin h-3.5 w-3.5 text-amber-600 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>● Pending Admin Verification</span>
            </span>

            <h2 className="font-sans font-black text-4xl uppercase tracking-tight mb-2 text-primary">
              Order Submitted!
            </h2>
            <p className="font-body text-base font-bold text-[#4a4a4a] mb-6">
              Your payment receipt has been sent to our administrator for verification.
            </p>
          </div>
        )}

        {/* Invoice Summary Block */}
        <div className="border-4 border-primary bg-[#faf7f2] p-4 text-left font-mono text-sm space-y-2 mb-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex justify-between border-b border-primary/20 pb-1">
            <span className="text-primary/60 font-sans font-bold">Order ID:</span>
            <span className="font-bold truncate max-w-[280px]">{order?.id}</span>
          </div>
          {transactionId && (
            <div className="flex justify-between border-b border-primary/20 pb-1">
              <span className="text-primary/60 font-sans font-bold">Transaction ID:</span>
              <span className="font-bold">{transactionId}</span>
            </div>
          )}
          <div className="flex justify-between border-b border-primary/20 pb-1">
            <span className="text-primary/60 font-sans font-bold">Plan:</span>
            <span className="font-bold">{plan.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-primary/60 font-sans font-bold">Total Paid:</span>
            <span className="font-bold">${total.toFixed(2)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center flex-wrap">
          {isRejected ? (
            <div className="flex gap-4 justify-center flex-wrap">
              <Link
                href="/app/dashboard/billing"
                className="bg-[#ffcc00] text-primary font-sans font-black text-sm uppercase py-3.5 px-8 border-4 border-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer"
              >
                Try Again / Billing
              </Link>
              <a
                href={`https://t.me/${paymentInfo.telegramHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white text-primary font-sans font-black text-sm uppercase py-3.5 px-8 border-4 border-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Contact Support</span>
              </a>
            </div>
          ) : (
            <>
              <Link
                href="/app/dashboard"
                className="bg-primary-fixed text-primary font-sans font-black text-sm uppercase py-3.5 px-8 border-4 border-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer"
              >
                Go to Dashboard
              </Link>
              <Link
                href="/app/dashboard/billing"
                className="bg-white text-primary font-sans font-black text-sm uppercase py-3.5 px-8 border-4 border-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer"
              >
                Track Payment Order
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  if (loading && !order) {
    return (
      <div className="w-full max-w-5xl mx-auto min-h-[60vh] flex flex-col items-center justify-center dashboard-enter my-4">
        <VoxLoader variant="panel" label="Loading checkout details..." />
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto dashboard-enter my-4">
      {/* Page Title */}
      <header className="mb-10 text-center md:text-left border-b-4 border-primary pb-6">
        <h1 className="font-sans font-black text-5xl md:text-7xl uppercase tracking-tighter text-primary">
          Checkout
        </h1>
        <p className="font-body text-lg font-bold mt-2 text-primary/80">
          Complete your subscription pack to Khmer Vox AI.
        </p>
      </header>

      {timeLeft && !isExpired && (
        <div className="border-4 border-primary bg-[#fff4cc] p-4 text-sm font-bold text-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-amber-600 font-bold animate-pulse">schedule</span>
            <div>
              <p className="font-sans font-black uppercase text-xs tracking-wider text-amber-800">Payment Window Open</p>
              <p className="mt-0.5 text-xs text-primary/80 font-semibold">
                Please pay the exact amount. This order will automatically cancel once the timer expires.
              </p>
            </div>
          </div>
          <div className="bg-primary text-white border-2 border-primary px-3 py-1 font-mono font-black text-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            {timeLeft}
          </div>
        </div>
      )}

      {isExpired && (
        <div className="border-4 border-primary bg-[#ffdad6] p-4 text-sm font-bold text-[#93000a] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-red-600 font-bold">cancel</span>
            <div>
              <p className="font-sans font-black uppercase text-xs tracking-wider text-red-800">Order Expired & Cancelled</p>
              <p className="mt-0.5 text-xs text-red-700 font-semibold">
                This order has expired and is cancelled. Please go back to the billing page to make a new request.
              </p>
            </div>
          </div>
          <Link
            href="/app/dashboard/billing"
            className="bg-white text-primary border-2 border-primary font-sans font-bold text-xs uppercase py-2 px-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#faf7f2] cursor-pointer shrink-0"
          >
            Go Back
          </Link>
        </div>
      )}

      {isStaticPayway && order && !isExpired && (
        <div className="border-4 border-primary bg-[#fff4cc] p-4 text-sm font-bold text-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] mb-6 flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-600 font-bold shrink-0">warning</span>
          <div>
            <p className="font-sans font-black uppercase text-xs tracking-wider text-amber-800">Crucial Payment Remark Required</p>
            <p className="mt-1 text-xs text-primary/80 font-semibold leading-relaxed">
              To auto-approve your tokens instantly, you <strong className="text-[#e63b2e]">MUST</strong> copy the Order ID below and paste it into the <strong className="text-primary">Remark/Description</strong> field of your banking app before sending the money.
            </p>
          </div>
        </div>
      )}


      {error && (
        <div className="border-4 border-primary bg-[#ffdad6] p-4 text-sm font-bold text-[#93000a] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] mb-6">
          {error}
        </div>
      )}

      {infoMessage && (
        <div className="border-2 border-primary bg-[#def3e5] p-3 text-xs font-bold text-emerald-800 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] mb-6">
          {infoMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
        {/* Left Side panels */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Order ID Copy block (Static PayWay only) */}
          {isStaticPayway && order && !isExpired && (
            <div className="bg-white border-4 border-primary p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
              <h3 className="font-sans font-black text-lg uppercase mb-3 border-b-2 border-primary pb-2 flex items-center gap-2">
                <span className="material-symbols-outlined font-bold text-primary">content_copy</span>
                1. Copy Order ID
              </h3>
              <p className="text-xs text-[#4a4a4a] font-bold mb-3">
                Click copy and paste this into your bank transfer remark/description.
              </p>
              <div className="flex gap-2 items-center">
                <div className="flex-1 bg-[#faf7f2] border-2 border-primary font-mono text-sm font-bold p-3 select-all truncate">
                  {order.id}
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyOrderIdLocal(order.id)}
                  className={`px-5 py-3 border-2 border-primary font-sans font-black text-xs uppercase shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    orderIdCopied 
                      ? "bg-[#def3e5] text-emerald-800" 
                      : "bg-[#ffcc00] text-primary hover:bg-[#ebd578]"
                  }`}
                >
                  <span className="material-symbols-outlined text-sm font-bold">
                    {orderIdCopied ? "check_circle" : "content_copy"}
                  </span>
                  <span>{orderIdCopied ? "Copied!" : "Copy"}</span>
                </button>
              </div>
            </div>
          )}

          {/* Bank Selector Switcher (Static PayWay only) */}
          {isStaticPayway && order && !isExpired && (
            <div className="bg-white border-4 border-primary p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
              <h3 className="font-sans font-black text-lg uppercase mb-3 border-b-2 border-primary pb-2 flex items-center gap-2">
                <span className="material-symbols-outlined font-bold text-primary">account_balance</span>
                2. Choose Bank App
              </h3>
              <p className="text-xs text-[#4a4a4a] font-bold mb-4">
                Select your banking app to view step-by-step payment instructions.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <button
                  type="button"
                  onClick={() => setSelectedBank("ABA")}
                  className={`flex flex-col items-center justify-center p-4 border-4 transition-all cursor-pointer ${
                    selectedBank === "ABA"
                      ? "border-primary bg-primary text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                      : "border-primary/20 bg-white hover:border-primary hover:bg-[#eee9e0]/20 text-primary"
                  }`}
                >
                  <span className="font-sans font-black text-base tracking-wider">ABA Mobile</span>
                  <span className={`text-[10px] mt-1 font-semibold ${selectedBank === "ABA" ? "text-primary-fixed/80" : "text-primary/60"}`}>
                    ABA PayWay QR
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBank("ACLEDA")}
                  className={`flex flex-col items-center justify-center p-4 border-4 transition-all cursor-pointer ${
                    selectedBank === "ACLEDA"
                      ? "border-primary bg-primary text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                      : "border-primary/20 bg-white hover:border-primary hover:bg-[#eee9e0]/20 text-primary"
                  }`}
                >
                  <span className="font-sans font-black text-base tracking-wider">ACLEDA Mobile</span>
                  <span className={`text-[10px] mt-1 font-semibold ${selectedBank === "ACLEDA" ? "text-primary-fixed/80" : "text-primary/60"}`}>
                    ACLEDA Unity
                  </span>
                </button>
              </div>

              {/* Step-by-step instructions based on selected bank */}
              <div className="bg-[#faf7f2] border-2 border-primary p-4 text-xs font-semibold space-y-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <p className="font-sans font-black uppercase text-[10px] text-primary/70 tracking-wider">
                  Payment Guideline:
                </p>
                {selectedBank === "ABA" ? (
                  <ol className="list-decimal list-inside space-y-2 leading-relaxed text-primary/80">
                    <li>
                      Copy the Order ID above: <span className="font-mono bg-[#eee9e0] px-1 py-0.5 rounded font-bold text-primary select-all">{order.id}</span>
                    </li>
                    <li>
                      Open your **ABA Mobile** app and select **Scan QR**.
                    </li>
                    <li>
                      Scan the KHQR Code displayed on the right.
                    </li>
                    <li>
                      On the transfer screen, tap the <strong className="text-primary">&quot;Remark to Receiver&quot;</strong> field and paste the copied Order ID.
                    </li>
                    <li>
                      Press Send. The system will auto-approve the order in seconds.
                    </li>
                  </ol>
                ) : (
                  <ol className="list-decimal list-inside space-y-2 leading-relaxed text-primary/80">
                    <li>
                      Copy the Order ID above: <span className="font-mono bg-[#eee9e0] px-1 py-0.5 rounded font-bold text-primary select-all">{order.id}</span>
                    </li>
                    <li>
                      Open your **ACLEDA Mobile** app and select **Scan QR**.
                    </li>
                    <li>
                      Scan the KHQR Code displayed on the right.
                    </li>
                    <li>
                      On the transfer screen, tap the <strong className="text-primary">&quot;Remark&quot;</strong> or <strong className="text-primary">&quot;Payment Description&quot;</strong> field and paste the copied Order ID.
                    </li>
                    <li>
                      Press Confirm. The system will auto-approve the order in seconds.
                    </li>
                  </ol>
                )}
              </div>
            </div>
          )}

          {/* Order Summary Card */}
          <div className="bg-white border-4 border-primary p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
            <h2 className="font-sans font-black text-2xl uppercase border-b-4 border-primary pb-3 mb-4">
              Order Summary
            </h2>
            <ul className="space-y-3 mb-6">
              <li className="flex justify-between items-center font-sans font-black text-base border-b-2 border-primary pb-2">
                <span>{order ? `${order.planName} x ${order.quantity}` : plan.name}</span>
                <span>${subtotal.toFixed(2)}</span>
              </li>
              {plan.features.map((feat, idx) => (
                <li key={idx} className="flex justify-between items-center text-xs font-bold">
                  <span className="text-primary/70 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm font-bold text-emerald-600">check</span>
                    {feat}
                  </span>
                </li>
              ))}
            </ul>

            <div className="bg-primary text-white p-4 border-4 border-primary">
              <div className="flex justify-between items-center mb-1 text-sm font-semibold">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-primary-fixed/80">
                <span>Tax (10%)</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/20 font-sans font-black text-xl uppercase text-primary-fixed">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Verification Form Card */}
          {!isExpired && (
            <form onSubmit={handleSubmit} className="bg-white border-4 border-primary p-6 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
              <h3 className="font-sans font-black text-xl uppercase mb-4 border-b-2 border-primary pb-2">
                Verify Payment
              </h3>
              
              <div className="mb-5">
                <label className="block font-sans font-black mb-2 uppercase text-xs text-primary/70" htmlFor="transaction_id">
                  Transaction ID (Optional - Fill to get faster approval)
                </label>
                <input
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  className="w-full bg-[#faf7f2] border-x-0 border-t-0 border-b-4 border-primary p-3 font-bold focus:ring-0 focus:border-[#0055ff] focus:outline-none transition-colors text-sm"
                  id="transaction_id"
                  placeholder="Enter ID from receipt"
                  type="text"
                  disabled={loading || submitting || !order}
                />
              </div>

              <div>
                <span className="block font-sans font-black mb-2 uppercase text-xs text-primary/70">
                  Upload Receipt screenshot
                </span>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-4 border-dashed border-primary bg-[#faf7f2] p-6 text-center cursor-pointer hover:bg-primary hover:text-white transition-colors group relative ${
                    dragOver ? "bg-primary text-white border-solid" : ""
                  }`}
                >
                  <input
                    type="file"
                    id="receipt-file"
                    accept="image/png, image/jpeg, image/webp"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={loading || submitting || !order}
                  />
                  
                  {previewUrl ? (
                    <div className="flex flex-col items-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Receipt Preview"
                        className="max-h-40 object-contain border-2 border-primary shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] mb-2"
                      />
                      <span className="font-sans font-black uppercase text-xs block group-hover:text-primary-fixed">
                        Click or drag to replace receipt screenshot
                      </span>
                    </div>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-4xl mb-1 block group-hover:text-primary-fixed">
                        upload_file
                      </span>
                      <span className="font-sans font-black uppercase text-xs block">
                        Click to upload or drag & drop
                      </span>
                      <span className="text-[10px] mt-1 block opacity-70">
                        JPG, PNG, WEBP up to 4MB
                      </span>
                    </>
                  )}
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Right Side panels */}
        <div className="lg:col-span-5 flex flex-col h-full">
          <div className="bg-white border-4 border-primary p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] h-full flex flex-col items-center justify-center relative overflow-hidden min-h-[460px]">
            {/* Accent background element */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#e63b2e] border-4 border-primary rounded-full"></div>

            <div className="text-center mb-6 relative z-10 w-full">
              <div className="bg-primary text-primary-fixed font-sans font-black text-2xl uppercase py-3 px-6 border-4 border-primary inline-block mb-4 transform -rotate-2 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                {isExpired ? "Payment Cancelled" : "KHQR Payment"}
              </div>
              <p className="font-sans font-black text-base">
                {isExpired ? "Order has expired and cannot be paid." : "Scan with your banking app to pay."}
              </p>
              <p className="text-xs mt-1 font-semibold text-primary/60">
                {isExpired ? "Time window closed" : "Supported by Bakong"}
              </p>
            </div>

            {/* QR Code Container */}
            <div className="bg-white border-4 border-primary p-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] mb-8 relative z-10 w-80 h-80 flex items-center justify-center">
              {isExpired ? (
                <div className="w-full h-full border-4 border-dashed border-[#e63b2e] flex flex-col items-center justify-center bg-[#ffdad6] p-4">
                  <span className="material-symbols-outlined text-[#e63b2e] text-5xl mb-2 font-black">cancel</span>
                  <p className="text-sm font-sans font-black text-[#e63b2e] uppercase">QR Code Expired</p>
                  <p className="text-[10px] text-[#e63b2e]/80 font-bold text-center mt-1">
                    This dynamic payment window is closed.
                  </p>
                </div>
              ) : loading ? (
                <VoxLoader variant="compact" label="Generating invoice..." />
              ) : order && qrImageSrc ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={qrImageSrc}
                  alt="KHQR Code"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full border-2 border-dashed border-primary flex items-center justify-center bg-[#faf7f2]">
                  <p className="text-xs font-bold text-primary/50 text-center px-4">
                    QR invoice not generated. Try selecting a plan above.
                  </p>
                </div>
              )}
            </div>

            {order && qrImageSrc && !isExpired && (
              <a
                href={qrImageSrc}
                download={`khqr-order-${order.id}.png`}
                className="mb-6 bg-white text-primary border-2 border-primary font-sans font-bold text-xs uppercase py-2.5 px-5 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#faf7f2] flex items-center justify-center gap-1.5 cursor-pointer relative z-10 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
              >
                <span className="material-symbols-outlined text-sm font-bold">download</span>
                <span>Save QR to Gallery</span>
              </a>
            )}

            {isExpired ? (
              <Link
                href="/app/dashboard/billing"
                className="w-full bg-[#f5f0e8] text-primary font-sans font-black text-xl uppercase py-4 border-4 border-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] transition-all cursor-pointer flex items-center justify-center gap-2 relative z-10 active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
              >
                <span>Go Back to Billing</span>
                <span className="material-symbols-outlined font-bold">arrow_back</span>
              </Link>
            ) : (
              <>
                {/* Submit button */}
                <button
                  onClick={handleSubmit}
                  disabled={loading || submitting || !order || !proofImageBase64}
                  className="w-full bg-[#ffcc00] text-primary font-sans font-black text-xl uppercase py-4 border-4 border-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] transition-all cursor-pointer disabled:bg-[#dcd8cf] disabled:text-primary/30 disabled:border-primary/30 disabled:shadow-none disabled:pointer-events-none active:translate-x-[4px] active:translate-y-[4px] active:shadow-none flex items-center justify-center gap-2 relative z-10"
                >
                  <span>{submitting ? "Verifying..." : "Complete Purchase"}</span>
                  <span className="material-symbols-outlined font-bold">arrow_forward</span>
                </button>

                {/* Cancel Order button */}
                {order && (
                  <button
                    type="button"
                    onClick={handleCancelOrder}
                    disabled={loading || submitting || cancelling}
                    className="w-full bg-[#e63b2e] text-[#f5f0e8] font-sans font-black text-xl uppercase py-4 border-4 border-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none active:translate-x-[4px] active:translate-y-[4px] active:shadow-none flex items-center justify-center gap-2 relative z-10 mt-4"
                  >
                    <span>{cancelling ? "Cancelling..." : "Cancel Order"}</span>
                    <span className="material-symbols-outlined font-bold">close</span>
                  </button>
                )}
              </>
            )}

            <p className="text-[10px] font-sans font-black text-center mt-5 uppercase tracking-widest text-primary/50 relative z-10">
              Secure transaction encrypted
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
