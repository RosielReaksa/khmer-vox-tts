import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";
import { withDatabaseGuard } from "@/lib/db-guard";

export async function GET() {
  return withDatabaseGuard(async () => {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    return NextResponse.json({
      user: {
        ...user,
        isAdmin: isAdminEmail(user.email),
      },
    });
  });
}
