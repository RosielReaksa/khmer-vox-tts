import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";

export default async function AppIndexPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/app/dashboard");
  }
  redirect("/app/signin");
}

