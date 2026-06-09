import { redirect } from "next/navigation";

import { AdminAccessRequired } from "@/app/app/admin/admin-shared";
import { AdminCustomersClient } from "@/app/app/admin/customers/admin-customers-client";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";

export default async function AdminCustomersPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }
  if (!isAdminEmail(user.email)) {
    return <AdminAccessRequired />;
  }

  return <AdminCustomersClient />;
}
