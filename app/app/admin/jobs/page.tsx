import { redirect } from "next/navigation";

import { AdminAccessRequired } from "@/app/app/admin/admin-shared";
import { AdminJobsClient } from "@/app/app/admin/jobs/admin-jobs-client";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";

export default async function AdminJobsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }
  if (!isAdminEmail(user.email)) {
    return <AdminAccessRequired />;
  }

  return <AdminJobsClient />;
}
