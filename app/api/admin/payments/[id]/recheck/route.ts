import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { verifyBakongPayment } from "@/lib/bakong";
import { checkPaywayTransactionForOrder } from "@/lib/payway";
import { readSessionFromCookie } from "@/lib/session";
import { approvePaymentOrder, confirmPaymentOrderPaid, listPaymentOrdersForAdmin } from "@/lib/store";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const orders = await listPaymentOrdersForAdmin("all");
  const order = orders.find((item) => item.id === id);
  if (!order) {
    return NextResponse.json({ error: "Payment order not found." }, { status: 404 });
  }
  if (order.status === "approved") {
    return NextResponse.json({
      ok: true,
      status: "approved",
      message: "Payment order is already approved.",
      order,
    });
  }
  if (order.status !== "pending") {
    return NextResponse.json({
      ok: false,
      status: order.status,
      message: "Only pending payment orders can be rechecked.",
      order,
    });
  }

  if (order.paymentProvider === "static_payway") {
    return NextResponse.json({
      ok: true,
      status: "pending",
      message:
        "Static PayWay QR orders do not have automatic API recheck. Approve after matching the ABA/Telegram notice.",
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
        ? "Payment confirmed by PayWay. Tokens added."
        : paid.reason === "ORDER_EXPIRED"
          ? "This KHQR order expired."
          : "PayWay confirmed payment but credit failed.",
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
      ? `Admin recheck approved by Bakong MD5 verification. Hash: ${verification.transactionHash}`
      : "Admin recheck approved by Bakong MD5 verification.",
  });

  return NextResponse.json({
    ok: approved.ok,
    status: approved.ok ? "approved" : approved.reason === "ORDER_EXPIRED" ? "expired" : "failed",
    message: approved.ok
      ? "Payment confirmed. Tokens added."
      : approved.reason === "ORDER_EXPIRED"
        ? "This KHQR order expired."
        : "Payment confirmed but credit failed.",
    order: approved.order ?? order,
  });
}
