import { redirect } from "next/navigation";

import { PaymentsAdminClient } from "@/app/app/admin/payments/payments-admin-client";
import { AdminAccessRequired } from "@/app/app/admin/admin-shared";
import { isAdminEmail } from "@/lib/admin";
import { isBakongVerificationConfigured } from "@/lib/bakong";
import { getCurrentUser } from "@/lib/current-user";

export default async function AdminPaymentsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }
  if (!isAdminEmail(user.email)) {
    return <AdminAccessRequired />;
  }

  return (
    <PaymentsAdminClient
      autoVerificationEnabled={isBakongVerificationConfigured()}
    />
  );
}
