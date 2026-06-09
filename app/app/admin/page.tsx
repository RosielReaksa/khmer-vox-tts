import { redirect } from "next/navigation";

import { AdminOverviewClient } from "@/app/app/admin/admin-overview-client";
import { AdminAccessRequired } from "@/app/app/admin/admin-shared";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";

export default async function AdminOverviewPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }
  if (!isAdminEmail(user.email)) {
    return <AdminAccessRequired />;
  }

  return <AdminOverviewClient />;
}
