import { redirect } from "next/navigation";

import { SignupForm } from "@/app/app/signup/signup-form";
import { getCurrentUser } from "@/lib/current-user";
import { generateCsrfToken } from "@/lib/csrf";
import { isGoogleOAuthEnabled } from "@/lib/google-oauth";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect("/app/dashboard");
  }

  const csrfToken = await generateCsrfToken();
  const { error } = await searchParams;

  return <SignupForm csrfToken={csrfToken} googleEnabled={isGoogleOAuthEnabled()} errorCode={error ?? null} />;
}
