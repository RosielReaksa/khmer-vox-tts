import { redirect } from "next/navigation";

import { SignupForm } from "@/app/app/signup/signup-form";
import { getCurrentUser } from "@/lib/current-user";
import { generateCsrfToken } from "@/lib/csrf";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/app/dashboard");
  }

  const csrfToken = await generateCsrfToken();

  return <SignupForm csrfToken={csrfToken} />;
}
