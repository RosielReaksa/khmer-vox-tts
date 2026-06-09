"use client";

import { useState } from "react";

import { DashboardUserProvider } from "@/app/app/dashboard/dashboard-user-context";

type CheckoutUserProviderProps = {
  children: React.ReactNode;
  email: string;
  tokenBalance: number;
  suspendedAt: string | null;
  suspendedReason: string | null;
};

export function CheckoutUserProvider({
  children,
  email,
  tokenBalance,
  suspendedAt,
  suspendedReason,
}: CheckoutUserProviderProps) {
  const [liveTokenBalance, setLiveTokenBalance] = useState(tokenBalance);

  return (
    <DashboardUserProvider
      value={{
        email,
        tokenBalance: liveTokenBalance,
        setTokenBalance: setLiveTokenBalance,
        suspendedAt,
        suspendedReason,
      }}
    >
      {children}
    </DashboardUserProvider>
  );
}
