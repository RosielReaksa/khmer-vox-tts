import "server-only";

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[admin] ADMIN_EMAILS is not set. No users have admin access.");
    }
    return false;
  }
  return adminEmails.includes(email.trim().toLowerCase());
}

