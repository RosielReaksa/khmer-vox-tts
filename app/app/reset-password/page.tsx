import { ResetPasswordForm } from "@/app/app/reset-password/reset-password-form";
import { generateCsrfToken } from "@/lib/csrf";

interface ResetPasswordPageProps {
  searchParams?: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = params?.token?.slice(0, 200) ?? "";
  const csrfToken = await generateCsrfToken();

  return <ResetPasswordForm token={token} csrfToken={csrfToken} />;
}
