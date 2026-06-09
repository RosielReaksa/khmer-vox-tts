import { BusinessOnboardingClient } from "@/app/app/dashboard/business/business-onboarding-client";

function telegramContact(rawValue: string): { label: string; url: string } {
  const fallbackUrl = "https://t.me/OfficalVoxTTS";
  const raw = rawValue.trim() || fallbackUrl;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const username = raw.replace(/\/+$/, "").split("/").pop()?.replace(/^@/, "") || "OfficalVoxTTS";
    return { label: `@${username}`, url: raw };
  }
  const username = raw.replace(/^@/, "") || "OfficalVoxTTS";
  return { label: `@${username}`, url: `https://t.me/${username}` };
}

export default function BusinessPage() {
  const supportContact = telegramContact(
    process.env.TELEGRAM_ADMIN_HANDLE?.trim() || "https://t.me/OfficalVoxTTS",
  );

  return <BusinessOnboardingClient supportContact={supportContact} />;
}
