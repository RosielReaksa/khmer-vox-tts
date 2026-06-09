import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "@/app/app/forgot-password/forgot-password-form";
import { getCurrentUser } from "@/lib/current-user";
import { generateCsrfToken } from "@/lib/csrf";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface ForgotPasswordPageProps {
  searchParams?: Promise<{ email?: string }>;
}

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const user = await getCurrentUser();
  if (user) {
    redirect("/app/dashboard");
  }

  const params = await searchParams;
  const emailParam = params?.email ? escapeHtml(params.email) : "";
  const csrfToken = await generateCsrfToken();

  return <ForgotPasswordForm initialEmail={emailParam} csrfToken={csrfToken} />;
}
