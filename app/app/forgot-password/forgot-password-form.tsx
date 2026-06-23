"use client";

import Link from "next/link";
import { useState } from "react";
import { useT } from "@/app/components/locale-provider";

export function ForgotPasswordForm({ initialEmail = "", csrfToken = "" }: { initialEmail?: string; csrfToken?: string }) {
  const t = useT();
  const [email, setEmail] = useState(initialEmail);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setError(data.error ?? t("auth.forgot.errorDefault"));
        return;
      }
      setSuccess(true);
    } catch {
      setError(t("auth.forgot.errorNetwork"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col font-body bg-[#f5f0e8] text-[#1a1a1a] selection:bg-[#ffcc00] selection:text-[#1a1a1a]">
      <main className="flex-grow flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-6xl flex flex-col md:flex-row brutalist-border brutalist-shadow bg-white min-h-[716px]">
          {/* Left Panel (Brand Hero) */}
          <div className="w-full md:w-1/2 bg-[#1a1a1a] p-12 flex flex-col justify-center items-start relative overflow-hidden text-white">
            <div className="z-10 w-full">
              <h1 className="font-headline font-black text-5xl md:text-7xl uppercase tracking-tighter leading-none mb-8 text-white select-none">
                RESTORE
                <br />
                ACCESS.
              </h1>
              {/* Abstract geometric representation (waveform/key) */}
              <div className="flex gap-2 items-end h-32 w-full mt-12 opacity-80">
                <div className="w-8 h-8 bg-[#0055ff] brutalist-border border-white"></div>
                <div className="w-8 h-24 bg-[#ffcc00] brutalist-border border-white"></div>
                <div className="w-8 h-12 bg-[#e63b2e] brutalist-border border-white"></div>
                <div className="w-8 h-32 bg-[#0055ff] brutalist-border border-white"></div>
                <div className="w-8 h-16 bg-[#ffcc00] brutalist-border border-white"></div>
                <div className="w-8 h-8 bg-[#e63b2e] brutalist-border border-white"></div>
              </div>
            </div>
            {/* Decorative background elements */}
            <div className="absolute -right-20 -top-20 w-64 h-64 border-8 border-[#e8e3da] opacity-10 rounded-full"></div>
            <div className="absolute -left-10 bottom-10 w-32 h-32 border-8 border-[#e8e3da] opacity-10 rotate-45"></div>
          </div>

          {/* Right Panel (Form Panel) */}
          <div className="w-full md:w-1/2 p-8 md:p-16 flex flex-col justify-center bg-[#f5f0e8]">
            <div className="w-full max-w-md mx-auto">
              <h2 className="font-headline font-black text-3xl md:text-4xl uppercase tracking-tighter mb-4 text-[#1a1a1a]">
                Recover Password
              </h2>
              <p className="text-[#4a4a4a] font-body mb-10 text-lg">
                {t("auth.forgot.body")} and we&apos;ll send you a recovery link to reset your password.
              </p>
              
              <form className="space-y-8" onSubmit={onSubmit} method="POST">
                <input type="hidden" name="csrf_token" value={csrfToken} />
                <div className="relative">
                  <label className="block font-label font-bold uppercase text-sm mb-2 text-[#1a1a1a]" htmlFor="email">
                    EMAIL ADDRESS
                  </label>
                  <input
                    className="w-full brutalist-input py-3 text-lg font-body placeholder:text-[#d0cbc3] focus:border-[#0055ff] transition-colors bg-transparent rounded-none"
                    id="email"
                    name="email"
                    placeholder={t("auth.emailPlaceholder")}
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setSuccess(false);
                      setError("");
                    }}
                    disabled={submitting}
                  />
                </div>

                {error && (
                  <div role="alert" className="border-4 border-[#1a1a1a] bg-[#ffdad6] p-3 text-sm font-bold text-[#93000a]">
                    {error}
                  </div>
                )}

                {success && (
                  <div role="status" className="border-4 border-[#1a1a1a] bg-[#d8f8e7] p-3 text-sm font-bold text-[#075e3b]">
                    {t("auth.forgot.success")}, the recovery link is on its way. Check spam or junk mail too.
                  </div>
                )}

                <button
                  className={`w-full font-headline font-black uppercase tracking-wider py-4 px-6 brutalist-border brutalist-shadow transition-all flex items-center justify-center gap-2 group ${
                    success
                      ? "bg-[#0055ff] text-white"
                      : "bg-[#1a1a1a] text-white hover:bg-[#0055ff] hover:text-white hover:translate-y-1 hover:translate-x-1 hover:shadow-none"
                  }`}
                  type="submit"
                  disabled={submitting || success}
                  aria-busy={submitting}
                >
                  {submitting ? (
                    <>
                      <span>{t("auth.forgot.submitting")}</span>
                      <span className="material-symbols-outlined animate-spin" aria-hidden="true">sync</span>
                    </>
                  ) : success ? (
                    <>
                      <span>{t("auth.forgot.sent")}</span>
                      <span className="material-symbols-outlined" aria-hidden="true">check</span>
                    </>
                  ) : (
                    <>
                      <span>{t("auth.forgot.submit")}</span>
                      <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform" aria-hidden="true">
                        arrow_forward
                      </span>
                    </>
                  )}
                </button>
              </form>

              <div className="mt-12 pt-8 border-t-4 border-[#1a1a1a]">
                <Link
                  className="inline-flex items-center gap-2 font-headline font-bold uppercase text-sm text-[#1a1a1a] hover:text-[#0055ff] transition-colors"
                  href="/app/signin"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_back</span>
                  Back to Sign In
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#eee9e0] text-[#1a1a1a] font-label font-bold uppercase text-xs docked full-width bottom-0 border-t-4 border-[#1a1a1a] flex flex-col md:flex-row justify-between items-center px-8 py-4 w-full gap-4 flat no shadows mt-8">
        <div className="font-headline font-black text-lg">{t("auth.brand")}</div>
        <div className="flex gap-4 md:gap-8 flex-wrap justify-center">
          <Link className="text-[#1a1a1a] hover:text-[#0055ff] transition-colors" href="/privacy">
            PRIVACY
          </Link>
          <Link className="text-[#1a1a1a] hover:text-[#0055ff] transition-colors" href="/terms">
            TERMS
          </Link>
          <Link className="text-[#1a1a1a] hover:text-[#0055ff] transition-colors" href="https://t.me/OfficalVoxTTS" target="_blank" rel="noreferrer">
            ACCESSIBILITY
          </Link>
        </div>
        <div className="text-[#4a4a4a] text-center md:text-right">
          {t("footer.copyright")} — FORM FOLLOWS FUNCTION
        </div>
      </footer>
    </div>
  );
}
