"use client";

import Link from "next/link";
import { useState } from "react";

export function ForgotPasswordForm({ initialEmail = "", csrfToken = "" }: { initialEmail?: string; csrfToken?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    // Simulate sending recovery link
    setTimeout(() => {
      setSubmitting(false);
      setSuccess(true);

      setTimeout(() => {
        setSuccess(false);
        setEmail("");
      }, 3000);
    }, 1500);
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
                Enter your registered email address and we&apos;ll send you a recovery link to reset your password.
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
                    placeholder="user@domain.com"
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting || success}
                  />
                </div>

                <button
                  className={`w-full font-headline font-black uppercase tracking-wider py-4 px-6 brutalist-border brutalist-shadow transition-all flex items-center justify-center gap-2 group ${
                    success
                      ? "bg-[#0055ff] text-white"
                      : "bg-[#1a1a1a] text-white hover:bg-[#0055ff] hover:text-white hover:translate-y-1 hover:translate-x-1 hover:shadow-none"
                  }`}
                  type="submit"
                  disabled={submitting || success}
                >
                  {submitting ? (
                    <>
                      <span>SENDING LINK...</span>
                      <span className="material-symbols-outlined animate-spin">sync</span>
                    </>
                  ) : success ? (
                    <>
                      <span>LINK SENT</span>
                      <span className="material-symbols-outlined">check</span>
                    </>
                  ) : (
                    <>
                      <span>SEND RECOVERY LINK</span>
                      <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">
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
                  <span className="material-symbols-outlined text-base">arrow_back</span>
                  Back to Sign In
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#eee9e0] text-[#1a1a1a] font-label font-bold uppercase text-xs docked full-width bottom-0 border-t-4 border-[#1a1a1a] flex flex-col md:flex-row justify-between items-center px-8 py-4 w-full gap-4 flat no shadows mt-8">
        <div className="font-headline font-black text-lg">KHMER VOX TTS</div>
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
          © 2024 KHMER VOX TTS — FORM FOLLOWS FUNCTION
        </div>
      </footer>
    </div>
  );
}
