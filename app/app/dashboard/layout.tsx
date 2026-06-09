import { redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";
import { DashboardShell } from "@/app/app/dashboard/shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }

  return (
    <DashboardShell
      userEmail={user.email}
      isAdmin={isAdminEmail(user.email)}
      tokenBalance={user.tokenBalance}
      suspendedAt={user.suspendedAt}
      suspendedReason={user.suspendedReason}
    >
      {children}
    </DashboardShell>
  );
}
