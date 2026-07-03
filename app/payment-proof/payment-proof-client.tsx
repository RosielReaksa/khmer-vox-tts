"use client";

import { useState, type ChangeEvent } from "react";

import { preparePaymentProofImage } from "@/lib/client-payment-proof-image";
import { fetchJsonSafe } from "@/lib/edge-fetch";
import { formatUsd } from "@/lib/plans";
import type { PaymentOrderRecord } from "@/lib/types";

export function PaymentProofClient({
  token,
  order,
}: {
  token: string;
  order: PaymentOrderRecord;
}) {
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(order.providerStatus === "user_reported_paid");

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("Preparing receipt screenshot...");
    const image = await preparePaymentProofImage(file);
    if (!image.ok) {
      setImageDataUrl(null);
      setMessage(image.error);
      return;
    }
    setImageDataUrl(image.dataUrl);
    setMessage(image.compressed ? "Receipt attached. Large screenshot was compressed automatically." : "");
  }

  async function submit() {
    setLoading(true);
    setMessage("");
    const result = await fetchJsonSafe<{ error?: string }>(
      "/api/payments/proof",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          paymentReference: reference,
          userNote: note,
          proofImageDataUrl: imageDataUrl,
        }),
      },
      "Could not submit payment proof.",
    );
    if (!result.ok) {
      setMessage(result.message);
      setLoading(false);
      return;
    }
    setSubmitted(true);
    setMessage("Payment proof submitted. Admin will approve after checking the bank notice.");
    setLoading(false);
  }

  const canSubmit = !loading && !submitted && Boolean(imageDataUrl);

  return (
    <main className="min-h-screen bg-[#f4f7f5] px-4 py-6 text-[#141823]">
      <section className="mx-auto max-w-xl rounded-3xl border border-[#dce3df] bg-white p-5 shadow-sm">
        <p className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
          VoxTTS payment
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Upload Receipt</h1>
        <p className="mt-2 text-sm leading-6 text-[#5d6675]">
          Attach only the ABA receipt screenshot from your phone. No transaction ID or note is required.
        </p>

        <div className="mt-5 grid gap-2 rounded-2xl border border-[#e3e6ee] bg-[#fafbfe] p-4 text-sm">
          <InfoRow label="Order" value={order.id} mono />
          <InfoRow label="Plan" value={`${order.planName} x ${order.quantity}`} />
          <InfoRow label="Total" value={formatUsd(order.totalPriceCents)} />
          <InfoRow label="Tokens" value={order.tokens.toLocaleString()} />
          <InfoRow label="Status" value={order.status} />
        </div>

        {submitted ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
            Payment proof is submitted. You can close this page and refresh billing on your computer.
          </div>
        ) : (
          <div className="mt-5 grid gap-4">
            <label className="grid gap-1 text-sm">
              Receipt screenshot
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleImage}
                className="rounded-xl border border-[#d8dde8] bg-white px-3 py-3 text-base"
              />
            </label>
            {imageDataUrl ? (
              <div className="rounded-2xl border border-[#e3e6ee] bg-[#fafbfe] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">Screenshot attached</p>
                  <button
                    type="button"
                    onClick={() => setImageDataUrl(null)}
                    className="rounded-full border border-[#d8dde8] bg-white px-3 py-1.5 text-xs font-semibold"
                  >
                    Remove
                  </button>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageDataUrl} alt="Receipt preview" className="mt-3 max-h-80 w-full rounded-xl object-contain" />
              </div>
            ) : null}
            <details className="rounded-2xl border border-[#e3e6ee] bg-[#fafbfe] p-4">
              <summary className="cursor-pointer text-sm font-semibold text-[#202533]">
                Optional: transaction ID or note
              </summary>
              <div className="mt-4 grid gap-4">
                <label className="grid gap-1 text-sm">
                  ABA transaction ID or reference
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="Optional"
                    className="rounded-xl border border-[#d8dde8] px-3 py-3 text-base outline-none focus:border-[#171b25]"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Note
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    placeholder="Optional"
                    className="rounded-2xl border border-[#d8dde8] px-3 py-3 text-base outline-none focus:border-[#171b25]"
                  />
                </label>
              </div>
            </details>
          </div>
        )}

        {message ? (
          <p className="mt-4 rounded-2xl border border-[#d8dde8] bg-[#fafbfe] px-4 py-3 text-sm leading-6">
            {message}
          </p>
        ) : null}

        {!submitted ? (
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="mt-5 w-full rounded-full bg-[#0f1117] px-5 py-3 text-base font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Submit Receipt"}
          </button>
        ) : null}
      </section>
    </main>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <p className="flex justify-between gap-4">
      <span className="text-[#6a7282]">{label}</span>
      <span className={`max-w-[260px] truncate text-right font-semibold ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </p>
  );
}
