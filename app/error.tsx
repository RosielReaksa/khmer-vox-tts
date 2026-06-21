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
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md border-4 border-primary bg-surface-bright p-8 text-center shadow-[8px_8px_0px_0px_rgba(26,26,26,1)]">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center border-4 border-primary bg-[#ffdad6] shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="#93000a" strokeWidth="2" />
            <path d="M12 8v5M12 16h.01" stroke="#93000a" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="font-headline text-xl font-black uppercase tracking-tight text-primary">
          Something went wrong
        </h1>
        <p className="mt-3 font-body text-sm font-medium text-on-surface-variant">
          An unexpected error occurred. Please try again.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-on-surface-variant">Error ID: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex h-11 items-center justify-center border-2 border-primary bg-[#ffcc00] px-6 font-headline text-xs font-black uppercase text-primary shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] transition-all hover:bg-[#e6b800] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
