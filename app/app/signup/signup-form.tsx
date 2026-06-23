"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { GoogleAuthButton, authErrorMessage } from "@/app/app/google-auth-button";
import { useT } from "@/app/components/locale-provider";

export function SignupForm({
  csrfToken = "",
  googleEnabled = false,
  errorCode = null,
}: {
  csrfToken?: string;
  googleEnabled?: boolean;
  errorCode?: string | null;
}) {
  const router = useRouter();
  const t = useT();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(authErrorMessage(errorCode, t) ?? "");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? t("auth.signup.errorDefault"));
        return;
      }

      router.replace("/app/dashboard");
      router.refresh();
    } catch {
      setError(t("auth.signup.errorNetwork"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row antialiased bg-[#f5f0e8] text-[#1a1a1a] selection:bg-[#ffcc00] selection:text-[#1a1a1a]">
      {/* Left Panel: Brand & Visuals (Bauhaus / Neo-Brutalist) */}
      <div className="hidden md:flex md:w-[45%] lg:w-1/2 bg-[#1a1a1a] relative overflow-hidden flex-col justify-between p-12 border-r-4 border-[#1a1a1a]">
        {/* Geometric Bauhaus Patterns */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#ffcc00] rounded-full border-8 border-[#1a1a1a] mix-blend-normal z-0 opacity-90 shadow-[8px_8px_0_0_#f5f0e8]"></div>
        <div className="absolute bottom-20 -right-10 w-64 h-64 bg-[#e63b2e] border-8 border-[#1a1a1a] z-0 rotate-12 shadow-[-8px_8px_0_0_#f5f0e8]"></div>
        <div className="absolute top-1/2 left-1/3 w-32 h-32 bg-[#0055ff] border-8 border-[#1a1a1a] rounded-none z-0 -rotate-12"></div>
        
        {/* Header Content */}
        <div className="relative z-10 mt-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#f5f0e8] border-4 border-[#1a1a1a] shadow-[4px_4px_0_0_#ffcc00] mb-8 select-none"
          >
            <span className="material-symbols-outlined font-bold text-[#1a1a1a]">graphic_eq</span>
            <span className="font-headline font-black uppercase text-[#1a1a1a] tracking-tighter">
              {t("auth.brand")}
            </span>
          </Link>
          <h1 className="font-headline font-black text-6xl lg:text-8xl text-white uppercase tracking-tighter leading-[0.9] drop-shadow-[4px_4px_0_rgba(230,59,46,1)]">
            {t("auth.signup.tagline")}
          </h1>
        </div>
        
        <div className="relative z-10 mb-8 max-w-sm">
          <p className="text-white text-xl font-bold border-l-4 border-[#ffcc00] pl-4">
            {t("auth.signup.body")}
          </p>
        </div>
      </div>

      {/* Right Panel: Authentication Form */}
      <div className="w-full md:w-[55%] lg:w-1/2 bg-[#f5f0e8] flex flex-col justify-center items-center p-8 sm:p-12 lg:p-24 relative">
        {/* Mobile Brand Indicator */}
        <div className="md:hidden w-full flex justify-center mb-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] text-white border-4 border-[#1a1a1a] shadow-[4px_4px_0_0_#ffcc00]"
          >
            <span className="material-symbols-outlined font-bold">graphic_eq</span>
            <span className="font-headline font-black uppercase tracking-tighter">{t("auth.signup.brandMobile")}</span>
          </Link>
        </div>
        
        <div className="w-full max-w-lg">
          <div className="mb-12">
            <h2 className="font-headline font-black text-4xl sm:text-5xl uppercase tracking-tighter mb-4 text-[#1a1a1a]">
              Create Account
            </h2>
            <p className="font-body text-[#4a4a4a] font-bold text-lg">
              Enter your coordinates to establish a secure connection.
            </p>
          </div>
          
          <form className="space-y-8" onSubmit={onSubmit} method="POST">
            <input type="hidden" name="csrf_token" value={csrfToken} />
            {/* Full Name Field */}
            <div className="relative group">
              <label className="block font-label font-black uppercase text-[#1a1a1a] text-sm mb-2" htmlFor="fullName">
                Full Name
              </label>
              <div className="relative">
                <input
                  className="w-full bg-transparent border-b-4 border-[#1a1a1a] text-[#1a1a1a] text-xl font-bold py-3 px-0 focus:outline-none focus:border-[#0055ff] transition-colors placeholder:text-[#4a4a4a]/50 rounded-none"
                  id="fullName"
                  placeholder={t("auth.fullNamePlaceholder")}
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={loading}
                />
                <span className="material-symbols-outlined absolute right-0 bottom-3 text-[#1a1a1a] opacity-0 group-focus-within:opacity-100 transition-opacity" aria-hidden="true">
                  person
                </span>
              </div>
            </div>
            
            {/* Email Field */}
            <div className="relative group">
              <label className="block font-label font-black uppercase text-[#1a1a1a] text-sm mb-2" htmlFor="email">
                Email Address *
              </label>
              <div className="relative">
                <input
                  className="w-full bg-transparent border-b-4 border-[#1a1a1a] text-[#1a1a1a] text-xl font-bold py-3 px-0 focus:outline-none focus:border-[#0055ff] transition-colors placeholder:text-[#4a4a4a]/50 rounded-none"
                  id="email"
                  placeholder="CODER@NODE.IO"
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
                <span className="material-symbols-outlined absolute right-0 bottom-3 text-[#1a1a1a] opacity-0 group-focus-within:opacity-100 transition-opacity" aria-hidden="true">
                  alternate_email
                </span>
              </div>
            </div>
            
            {/* Password Field */}
            <div className="relative group">
              <label className="block font-label font-black uppercase text-[#1a1a1a] text-sm mb-2" htmlFor="password">
                Password * (min 8 chars)
              </label>
              <div className="relative">
                <input
                  className="w-full bg-transparent border-b-4 border-[#1a1a1a] text-[#1a1a1a] text-xl font-bold py-3 px-0 focus:outline-none focus:border-[#0055ff] transition-colors placeholder:text-[#4a4a4a]/50 rounded-none"
                  id="password"
                  placeholder={t("auth.passwordPlaceholder")}
                  required
                  minLength={8}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <span className="material-symbols-outlined absolute right-0 bottom-3 text-[#1a1a1a] opacity-0 group-focus-within:opacity-100 transition-opacity" aria-hidden="true">
                  key
                </span>
              </div>
            </div>

            {error && (
              <div role="alert" className="border-4 border-[#1a1a1a] bg-[#ffdad6] p-3 text-xs font-bold text-[#93000a] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                <p>{error}</p>
                {error.toLowerCase().includes("already") && (
                  <Link href="/app/signin" className="mt-2 inline-block font-semibold underline underline-offset-2 hover:text-[#0055ff]">
                    {t("auth.signup.signInInstead")}
                  </Link>
                )}
              </div>
            )}
            
            {/* Submit Action */}
            <div className="pt-8">
              <button
                className="w-full bg-[#ffcc00] text-[#1a1a1a] border-4 border-[#1a1a1a] py-5 font-headline font-black uppercase text-2xl tracking-tight shadow-[6px_6px_0_0_#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#ffcc00] active:shadow-none active:translate-x-[6px] active:translate-y-[6px] transition-all flex justify-center items-center gap-3 disabled:opacity-50 disabled:pointer-events-none"
                type="submit"
                disabled={loading}
                aria-busy={loading}
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin" aria-hidden="true">sync</span>
                    {t("auth.signup.submitting")}
                  </>
                ) : (
                  <>
                    Create Account
                    <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                      arrow_forward
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>

          {googleEnabled && (
            <div className="mt-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-grow h-1 bg-[#1a1a1a]" />
                <span className="font-label font-bold text-xs uppercase tracking-widest text-[#4a4a4a]">
                  Or
                </span>
                <div className="flex-grow h-1 bg-[#1a1a1a]" />
              </div>
              <GoogleAuthButton label={t("auth.google.signup")} />
            </div>
          )}

          {/* Footer Links */}
          <div className="mt-12 text-center border-t-4 border-[#1a1a1a] pt-8">
            <p className="font-body font-bold text-[#4a4a4a]">
              Already have clearance?{" "}
              <Link
                className="text-[#0055ff] hover:text-[#e63b2e] uppercase font-black tracking-tight border-b-2 border-transparent hover:border-[#e63b2e] transition-colors inline-flex items-center gap-1 ml-1"
                href="/app/signin"
              >
                Sign In
              </Link>
            </p>
          </div>
        </div>
        
        {/* Decorative Brutalist Accent on Form Side */}
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-[#f5f0e8] border-t-4 border-l-4 border-[#1a1a1a] items-end justify-end p-2 pointer-events-none hidden lg:flex">
          <div className="w-4 h-4 bg-[#1a1a1a] rounded-full"></div>
        </div>
      </div>
    </div>
  );
}
