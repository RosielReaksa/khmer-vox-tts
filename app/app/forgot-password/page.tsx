import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "@/app/app/forgot-password/forgot-password-form";
import { getCurrentUser } from "@/lib/current-user";
import { generateCsrfToken } from "@/lib/csrf";

interface ForgotPasswordPageProps {
  searchParams?: Promise<{ email?: string }>;
}

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const user = await getCurrentUser();
  if (user) {
    redirect("/app/dashboard");
  }

  const params = await searchParams;
  const emailParam = params?.email?.slice(0, 200) ?? "";
  const csrfToken = await generateCsrfToken();

  return <ForgotPasswordForm initialEmail={emailParam} csrfToken={csrfToken} />;
}
