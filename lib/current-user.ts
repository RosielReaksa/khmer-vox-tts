import "server-only";

import { cache } from "react";

import { readSessionFromCookie } from "@/lib/session";
import { findUserById, getUserTokenBalance } from "@/lib/store";

export const getCurrentUser = cache(async function getCurrentUser() {
  try {
    const session = await readSessionFromCookie();
    if (!session) return null;

    const [user, tokenBalance] = await Promise.all([
      findUserById(session.userId),
      getUserTokenBalance(session.userId),
    ]);
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      suspendedAt: user.suspendedAt,
      suspendedReason: user.suspendedReason,
      tokenBalance,
    };
  } catch {
    return null;
  }
});
