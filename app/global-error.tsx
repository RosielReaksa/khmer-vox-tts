"use client";

import { useEffect } from "react";

/**
 * Top-level error boundary. This replaces the root layout when the layout
 * itself throws, so it must render its own <html>/<body> and cannot depend on
 * globals.css being loaded — styles are inlined to stay robust.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#f5f0e8",
          color: "#1a1a1a",
          fontFamily: "'Space Grotesk', 'Segoe UI', sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            border: "4px solid #1a1a1a",
            background: "#faf7f2",
            padding: "32px",
            textAlign: "center",
            boxShadow: "8px 8px 0px 0px #1a1a1a",
          }}
        >
          <div
            style={{
              margin: "0 auto 20px",
              display: "grid",
              placeItems: "center",
              height: "64px",
              width: "64px",
              border: "4px solid #1a1a1a",
              background: "#ffdad6",
              boxShadow: "3px 3px 0px 0px #1a1a1a",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="#93000a" strokeWidth="2" />
              <path d="M12 8v5M12 16h.01" stroke="#93000a" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "20px",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
            }}
          >
            Something went wrong
          </h1>
          <p style={{ marginTop: "12px", fontSize: "14px", color: "#4a4a4a" }}>
            A critical error occurred while loading the app. Please try again.
          </p>
          {error.digest ? (
            <p
              style={{
                marginTop: "8px",
                fontSize: "12px",
                fontFamily: "'IBM Plex Mono', monospace",
                color: "#4a4a4a",
              }}
            >
              Error ID: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "24px",
              height: "44px",
              padding: "0 24px",
              border: "2px solid #1a1a1a",
              background: "#ffcc00",
              color: "#1a1a1a",
              fontSize: "12px",
              fontWeight: 900,
              textTransform: "uppercase",
              boxShadow: "3px 3px 0px 0px #1a1a1a",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
