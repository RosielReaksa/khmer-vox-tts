import { redirect } from "next/navigation";

import { SigninForm } from "@/app/app/signin/signin-form";
import { getCurrentUser } from "@/lib/current-user";
import { generateCsrfToken } from "@/lib/csrf";

export default async function SigninPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/app/dashboard");
  }

  const csrfToken = await generateCsrfToken();

  return <SigninForm csrfToken={csrfToken} />;
}
