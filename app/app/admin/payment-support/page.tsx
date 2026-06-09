import Link from "next/link";
import { redirect } from "next/navigation";

import { PaymentSupportClient } from "@/app/app/admin/payment-support/payment-support-client";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";
import { listPaymentSupportTicketsForAdmin } from "@/lib/store";

export default async function AdminPaymentSupportPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }
  if (!isAdminEmail(user.email)) {
    return <AdminAccessRequired />;
  }

  const tickets = await listPaymentSupportTicketsForAdmin("all");
  return <PaymentSupportClient initialTickets={tickets} />;
}

function AdminAccessRequired() {
  return (
    <section className="mx-auto grid min-h-[60vh] max-w-xl place-items-center px-5">
      <div className="rounded-3xl border border-[#e3e6ee] bg-white p-6 text-center">
        <h1 className="text-2xl font-semibold text-[#151923]">Admin access required</h1>
        <p className="mt-2 text-sm leading-6 text-[#5d6678]">
          Set your email in ADMIN_EMAILS to view payment support tickets.
        </p>
        <Link
          href="/app/dashboard"
          className="mt-5 inline-flex rounded-full bg-[#0f1117] px-4 py-2 text-sm font-semibold text-white"
        >
          Back to dashboard
        </Link>
      </div>
    </section>
  );
}
