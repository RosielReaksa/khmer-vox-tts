"use client";

import { createContext, useContext } from "react";

type DashboardUserContextValue = {
  email: string;
  tokenBalance: number;
  setTokenBalance: (nextBalance: number) => void;
  suspendedAt: string | null;
  suspendedReason: string | null;
};

const DashboardUserContext = createContext<DashboardUserContextValue | null>(null);

export function DashboardUserProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: DashboardUserContextValue;
}) {
  return <DashboardUserContext.Provider value={value}>{children}</DashboardUserContext.Provider>;
}

export function useDashboardUser(): DashboardUserContextValue {
  const value = useContext(DashboardUserContext);
  if (!value) {
    throw new Error("useDashboardUser must be used inside DashboardUserProvider.");
  }
  return value;
}
