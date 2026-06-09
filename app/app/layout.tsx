import { AppShell, type HeaderUser } from "@/app/app/app-shell";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const headerUser: HeaderUser | null = user
    ? {
        email: user.email,
        isAdmin: isAdminEmail(user.email),
      }
    : null;

  return <AppShell initialUser={headerUser}>{children}</AppShell>;
}
