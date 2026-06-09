import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminShell } from "@/app/app/admin/admin-shell";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }

  if (!isAdminEmail(user.email)) {
    return children;
  }

  return <AdminShell userEmail={user.email}>{children}</AdminShell>;
}
