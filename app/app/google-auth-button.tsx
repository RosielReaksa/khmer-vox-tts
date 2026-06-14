"use client";

/**
 * "Continue with Google" button. Navigates to the server-side OAuth start
 * route, which redirects to Google. Rendered only when Google sign-in is
 * enabled (controlled by the parent via the `enabled` prop).
 */
export function GoogleAuthButton({ label = "Continue with Google" }: { label?: string }) {
  return (
    <a
      href="/api/auth/google/start"
      className="brutal-button w-full bg-[#ffffff] text-[#1a1a1a] border-4 border-[#1a1a1a] p-4 flex items-center justify-center gap-3 font-black uppercase tracking-tight hover:bg-[#1a1a1a] hover:text-[#ffffff] transition-colors duration-100 shadow-[4px_4px_0_0_#1a1a1a] active:shadow-none active:translate-x-[4px] active:translate-y-[4px]"
    >
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
        <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
      </svg>
      {label}
    </a>
  );
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  google_unavailable: "Google sign-in is not available right now. Use email and password.",
  google_cancelled: "Google sign-in was cancelled.",
  google_state: "Google sign-in session expired. Please try again.",
  google_unverified: "Your Google email is not verified. Use a verified Google account.",
  google_already_linked: "That Google account is already linked to another user.",
  account_suspended: "This account is suspended. Contact support.",
  google_failed: "Could not complete Google sign-in. Please try again.",
};

export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return AUTH_ERROR_MESSAGES[code] ?? "Sign-in failed. Please try again.";
}
