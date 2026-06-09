import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { listUserVoices } from "@/lib/store";
import { VoicesPanel } from "@/app/app/dashboard/voices/voices-panel";

export const runtime = "nodejs";

export default async function VoicesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }

  const voices = await listUserVoices(user.id);
  // Strip audioBase64 from initial render payload to keep transfer light
  const initialVoices = voices.map((v) => ({
    id: v.id,
    userId: v.userId,
    name: v.name,
    description: v.description,
    fileName: v.fileName,
    mimeType: v.mimeType,
    fileSize: v.fileSize,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  }));

  return <VoicesPanel initialVoices={initialVoices} />;
}
