"use client";

import Link from "next/link";
import { useState } from "react";

export function ResetPasswordForm({
  token,
  csrfToken,
}: {
  token: string;
  csrfToken: string;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const tokenLooksValid = /^[A-Za-z0-9_-]{43}$/.test(token);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ token, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not reset the password.");
        return;
      }
      setPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f0e8] text-[#1a1a1a] flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-5xl grid md:grid-cols-2 brutalist-border brutalist-shadow bg-white min-h-[620px]">
        <section className="bg-[#1a1a1a] p-10 md:p-14 text-white flex flex-col justify-center">
          <div className="text-[#ffcc00] font-label font-bold uppercase tracking-widest text-sm mb-5">
            Khmer Vox TTS
          </div>
          <h1 className="font-headline font-black text-5xl md:text-6xl uppercase tracking-tighter leading-none">
            Secure your
            <br />
            account.
          </h1>
          <p className="mt-8 max-w-sm text-[#e8e3da] text-lg">
            Choose a new password that you do not use on another website.
          </p>
        </section>

        <section className="p-8 md:p-14 bg-[#f5f0e8] flex flex-col justify-center">
          <h2 className="font-headline font-black text-3xl uppercase tracking-tighter mb-3">
            Reset Password
          </h2>

          {!tokenLooksValid ? (
            <div className="space-y-6">
              <div className="border-4 border-[#1a1a1a] bg-[#ffdad6] p-4 font-bold text-[#93000a]">
                This recovery link is invalid. Request a new link to continue.
              </div>
              <Link className="inline-block brutal-button bg-[#1a1a1a] text-white px-5 py-3" href="/app/forgot-password">
                Request new link
              </Link>
            </div>
          ) : success ? (
            <div className="space-y-6">
              <div className="border-4 border-[#1a1a1a] bg-[#d8f8e7] p-4 font-bold text-[#075e3b]">
                Password updated. Your recovery link cannot be used again.
              </div>
              <Link className="inline-block brutal-button bg-[#10b981] text-[#1a1a1a] px-5 py-3" href="/app/signin">
                Sign in
              </Link>
            </div>
          ) : (
            <form className="space-y-6 mt-5" onSubmit={onSubmit}>
              <input type="hidden" name="csrf_token" value={csrfToken} />
              <div>
                <label className="block font-label font-bold uppercase text-sm mb-2" htmlFor="password">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={200}
                  required
                  className="w-full brutal-input p-4 bg-white rounded-none"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block font-label font-bold uppercase text-sm mb-2" htmlFor="confirm-password">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={200}
                  required
                  className="w-full brutal-input p-4 bg-white rounded-none"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={submitting}
                />
              </div>

              {error && (
                <div className="border-4 border-[#1a1a1a] bg-[#ffdad6] p-3 text-sm font-bold text-[#93000a]">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full brutal-button bg-[#1a1a1a] text-white p-4 disabled:opacity-50"
              >
                {submitting ? "UPDATING..." : "UPDATE PASSWORD"}
              </button>
            </form>
          )}

          <Link className="mt-8 font-label font-bold uppercase text-sm hover:text-[#0055ff]" href="/app/signin">
            Back to sign in
          </Link>
        </section>
      </div>
    </main>
  );
}
