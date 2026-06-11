import { NextResponse } from "next/server";

import { verifyBakongPayment } from "@/lib/bakong";
import { checkKhqrccTransactionForOrder } from "@/lib/khqrcc";
import { checkPaywayTransactionForOrder } from "@/lib/payway";
import { readSessionFromCookie } from "@/lib/session";
import { approvePaymentOrder, confirmPaymentOrderPaid, listUserPaymentOrders } from "@/lib/store";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const orders = await listUserPaymentOrders(session.userId);
  const order = orders.find((item) => item.id === id);
  if (!order) {
    return NextResponse.json({ error: "Payment order not found." }, { status: 404 });
  }

  if (order.status === "approved") {
    return NextResponse.json({ ok: true, status: "approved", message: "Payment confirmed. Credits added.", order });
  }
  if (order.status !== "pending") {
    const message =
      order.status === "expired"
        ? "This KHQR order expired. Create a new payment order."
        : "This payment order is no longer pending.";
    return NextResponse.json({ ok: false, status: order.status, message, order });
  }

  if (order.paymentProvider === "static_payway") {
    return NextResponse.json({
      ok: true,
      status: "pending",
      message:
        "Static PayWay QR payments are confirmed from the ABA/Telegram payment notice. Please wait for admin approval.",
      order,
    });
  }

  if (order.paymentProvider === "payway") {
    const verification = await checkPaywayTransactionForOrder(order);
    if (verification.status !== "paid") {
      return NextResponse.json({
        ok: true,
        status: verification.status,
        message: verification.message,
        order,
      });
    }

    const paid = await confirmPaymentOrderPaid({
      orderId: order.id,
      provider: "payway",
      providerTransactionId: verification.providerTransactionId,
      providerReference: verification.providerReference,
      providerApprovalCode: verification.providerApprovalCode,
      providerStatusCode: verification.providerStatusCode,
      providerStatus: verification.providerStatus,
      providerAmount: verification.providerAmount,
      providerCurrency: verification.providerCurrency,
      providerPayload: verification.providerPayload,
      paidAt: verification.paidAt,
    });

    return NextResponse.json({
      ok: paid.ok,
      status: paid.ok ? "approved" : paid.reason === "ORDER_EXPIRED" ? "expired" : "failed",
      message: paid.ok
        ? "Payment confirmed by PayWay. Credits added."
        : paid.reason === "ORDER_EXPIRED"
          ? "This KHQR order expired. Create a new payment order."
          : "PayWay confirmed payment but credit failed.",
      order: paid.order ?? order,
    });
  }

  if (order.paymentProvider === "khqrcc") {
    const verification = await checkKhqrccTransactionForOrder(order);
    if (verification.status !== "paid") {
      return NextResponse.json({
        ok: true,
        status: verification.status,
        message: verification.message,
        order,
      });
    }

    const paid = await confirmPaymentOrderPaid({
      orderId: order.id,
      provider: "khqrcc",
      providerTransactionId: verification.providerTransactionId,
      providerReference: verification.providerReference,
      providerApprovalCode: verification.providerApprovalCode,
      providerStatusCode: verification.providerStatusCode,
      providerStatus: verification.providerStatus,
      providerAmount: verification.providerAmount,
      providerCurrency: verification.providerCurrency,
      providerPayload: verification.providerPayload,
      paidAt: verification.paidAt,
    });

    return NextResponse.json({
      ok: paid.ok,
      status: paid.ok ? "approved" : paid.reason === "ORDER_EXPIRED" ? "expired" : "failed",
      message: paid.ok
        ? "Payment confirmed by KHQRcc. Credits added."
        : paid.reason === "ORDER_EXPIRED"
          ? "This KHQRcc order expired. Create a new payment order."
          : "KHQRcc confirmed payment but credit failed.",
      order: paid.order ?? order,
    });
  }

  const verification = await verifyBakongPayment(order);
  if (verification.status !== "paid") {
    return NextResponse.json({
      ok: true,
      status: verification.status,
      message: verification.message,
      order,
    });
  }

  const approved = await approvePaymentOrder({
    orderId: order.id,
    adminUserId: session.userId,
    adminNote: verification.transactionHash
      ? `Auto approved by Bakong MD5 verification. Hash: ${verification.transactionHash}`
      : "Auto approved by Bakong MD5 verification.",
  });

  return NextResponse.json({
    ok: approved.ok,
    status: approved.ok ? "approved" : approved.reason === "ORDER_EXPIRED" ? "expired" : "failed",
    message: approved.ok
      ? "Payment confirmed. Credits added."
      : approved.reason === "ORDER_EXPIRED"
        ? "This KHQR order expired. Create a new payment order."
        : "Payment confirmed but credit failed.",
    order: approved.order ?? order,
  });
}
