import { redirect } from "next/navigation";

import { SigninForm } from "@/app/app/signin/signin-form";
import { getCurrentUser } from "@/lib/current-user";
import { generateCsrfToken } from "@/lib/csrf";
import { isGoogleOAuthEnabled } from "@/lib/google-oauth";

export default async function SigninPage({
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

  return <SigninForm csrfToken={csrfToken} googleEnabled={isGoogleOAuthEnabled()} errorCode={error ?? null} />;
}
