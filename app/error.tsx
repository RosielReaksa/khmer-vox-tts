"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f5f8] p-6">
      <div className="w-full max-w-md rounded-3xl border border-[#e3e6ee] bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="#dc2626" strokeWidth="1.8" />
            <path d="M12 8v5M12 16h.01" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-[#17181b]">Something went wrong</h1>
        <p className="mt-2 text-sm text-[#6a7282]">
          An unexpected error occurred. Please try again.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-[#9ca3af]">Error ID: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-full bg-[#090b11] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#131722]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
