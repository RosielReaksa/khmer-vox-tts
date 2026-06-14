"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { GoogleAuthButton, authErrorMessage } from "@/app/app/google-auth-button";

export function SigninForm({
  csrfToken = "",
  googleEnabled = false,
  errorCode = null,
}: {
  csrfToken?: string;
  googleEnabled?: boolean;
  errorCode?: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(authErrorMessage(errorCode) ?? "");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Could not sign in.");
        return;
      }

      router.replace("/app/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col antialiased bg-[#f5f0e8] text-[#1a1a1a]">
      {/* Header / Nav Shell */}
      <header className="bg-[#f5f0e8] flex justify-between items-center w-full px-6 py-4 border-b-4 border-[#1a1a1a] fixed top-0 z-50">
        <Link
          href="/"
          className="text-4xl font-headline font-black tracking-tighter text-[#1a1a1a] uppercase flex items-center gap-2 select-none"
        >
          <span
            className="material-symbols-outlined text-4xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            graphic_eq
          </span>
          KHMER VOX TTS
        </Link>
        <Link
          href="https://t.me/OfficalVoxTTS"
          target="_blank"
          rel="noreferrer"
          className="brutal-button bg-[#ffcc00] text-[#1a1a1a] px-6 py-2 font-black uppercase tracking-tighter hover:bg-[#1a1a1a] hover:text-[#ffffff] transition-colors duration-100"
        >
          SUPPORT
        </Link>
      </header>

      {/* Main Content Area - Split Screen */}
      <main className="flex-grow flex flex-col md:flex-row mt-20 md:mt-24 w-full min-h-[calc(100vh-160px)]">
        {/* Left Panel: Graphic / Brand */}
        <div className="w-full md:w-1/2 bg-[#0b0f19] flex flex-col justify-center items-center p-8 md:p-16 relative overflow-hidden min-h-[409px] md:min-h-full border-b-4 md:border-b-0 md:border-r-4 border-[#1a1a1a]">
          {/* Soundwave Abstract Graphic (CSS driven) */}
          <div className="absolute inset-0 soundwave-bg opacity-30 flex items-center justify-center">
            {/* Abstract waves */}
            <div className="flex items-center gap-2 h-64">
              <div className="w-4 bg-[#10b981] h-1/4 animate-pulse"></div>
              <div className="w-4 bg-[#10b981] h-3/4 animate-pulse" style={{ animationDelay: "0.1s" }}></div>
              <div className="w-4 bg-[#10b981] h-1/2 animate-pulse" style={{ animationDelay: "0.2s" }}></div>
              <div className="w-4 bg-[#10b981] h-full animate-pulse" style={{ animationDelay: "0.3s" }}></div>
              <div className="w-4 bg-[#10b981] h-2/3 animate-pulse" style={{ animationDelay: "0.4s" }}></div>
              <div className="w-4 bg-[#10b981] h-1/3 animate-pulse" style={{ animationDelay: "0.5s" }}></div>
            </div>
          </div>
          {/* Content */}
          <div className="relative z-10 text-center flex flex-col gap-6 max-w-lg">
            <span
              className="material-symbols-outlined text-[#10b981] text-8xl mb-4 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              record_voice_over
            </span>
            <h1 className="text-5xl md:text-6xl font-headline font-black text-white leading-tight uppercase tracking-tighter">
              Cambodia&apos;s Leading{" "}
              <span className="text-[#10b981] border-b-4 border-[#10b981] pb-1 inline-block">
                Khmer AI
              </span>{" "}
              Voice Engine.
            </h1>
            <p className="text-[#e8e3da] font-body text-lg max-w-md mx-auto mt-4 font-medium border-l-4 border-[#10b981] pl-4 text-left">
              Synthesis, cloning, and expressive prosody engineered for the Khmer language.
            </p>
          </div>
        </div>

        {/* Right Panel: Auth Form */}
        <div className="w-full md:w-1/2 bg-[#e2e8f0] flex flex-col justify-center items-center p-8 md:p-16 relative">
          <div className="w-full max-w-md bg-[#f5f0e8] p-8 brutal-border brutal-shadow relative">
            {/* Decorative element */}
            <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#ffcc00] brutal-border"></div>
            <div className="mb-10 text-center md:text-left">
              <h2 className="text-4xl font-headline font-black text-[#1a1a1a] uppercase tracking-tighter mb-2">
                Sign In
              </h2>
              <p className="text-[#4a4a4a] font-body font-bold text-sm uppercase tracking-widest border-b-2 border-[#1a1a1a] inline-block pb-1">
                Authenticate User
              </p>
            </div>
            
            <form className="space-y-6 flex flex-col" onSubmit={onSubmit} method="POST">
              <input type="hidden" name="csrf_token" value={csrfToken} />
              <div className="space-y-2 flex flex-col">
                <label
                  className="font-label font-bold text-[#1a1a1a] uppercase text-sm flex items-center gap-2"
                  htmlFor="email"
                >
                  <span className="material-symbols-outlined text-sm">mail</span>
                  Email Address
                </label>
                <input
                  className="brutal-input w-full p-4 bg-[#f5f0e8] text-[#1a1a1a] font-body font-medium placeholder:text-[#4a4a4a]/50 rounded-none"
                  id="email"
                  placeholder="user@domain.com"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2 flex flex-col">
                <div className="flex justify-between items-center">
                  <label
                    className="font-label font-bold text-[#1a1a1a] uppercase text-sm flex items-center gap-2"
                    htmlFor="password"
                  >
                    <span className="material-symbols-outlined text-sm">key</span>
                    Password
                  </label>
                  <Link
                    className="text-[#0055ff] font-label font-bold text-xs uppercase hover:text-[#e63b2e] hover:underline transition-colors"
                    href="/app/forgot-password"
                  >
                    Forgot Password?
                  </Link>
                </div>
                <input
                  className="brutal-input w-full p-4 bg-[#f5f0e8] text-[#1a1a1a] font-body font-medium placeholder:text-[#4a4a4a]/50 rounded-none"
                  id="password"
                  placeholder="••••••••"
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="border-4 border-[#1a1a1a] bg-[#ffdad6] p-3 text-xs font-bold text-[#93000a] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                  {error}
                </div>
              )}

              <button
                className="brutal-button w-full bg-[#10b981] text-[#1a1a1a] p-4 mt-8 text-xl flex items-center justify-center gap-3 hover:bg-[#1a1a1a] hover:text-[#10b981] disabled:opacity-50 group"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin">sync</span>
                    AUTHENTICATING...
                  </>
                ) : (
                  <>
                    SIGN IN
                    <span className="material-symbols-outlined group-hover:translate-x-2 transition-transform">
                      arrow_forward
                    </span>
                  </>
                )}
              </button>
            </form>

            {googleEnabled && (
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex-grow h-1 bg-[#1a1a1a]" />
                  <span className="font-label font-bold text-xs uppercase tracking-widest text-[#4a4a4a]">
                    Or
                  </span>
                  <div className="flex-grow h-1 bg-[#1a1a1a]" />
                </div>
                <GoogleAuthButton label="Sign in with Google" />
              </div>
            )}

            <div className="mt-8 pt-8 border-t-4 border-[#1a1a1a] text-center flex flex-col gap-4">
              <p className="font-body font-medium text-sm text-[#4a4a4a]">
                Don&apos;t have an access key?
              </p>
              <Link
                className="inline-block brutal-button bg-[#f5f0e8] text-[#1a1a1a] px-6 py-3 text-sm hover:bg-[#ffcc00] hover:text-[#1a1a1a] self-center"
                href="/app/signup"
              >
                CREATE ACCOUNT
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Shell */}
      <footer className="bg-[#eee9e0] flex flex-col md:flex-row justify-between items-center px-8 py-4 w-full gap-4 border-t-4 border-[#1a1a1a] mt-auto">
        <div className="font-headline font-black text-lg text-[#1a1a1a]">
          KHMER VOX TTS
        </div>
        <div className="text-[#1a1a1a] font-label font-bold uppercase text-xs text-center md:text-left">
          © 2024 KHMER VOX TTS — FORM FOLLOWS FUNCTION
        </div>
        <div className="flex gap-6">
          <Link
            className="text-[#1a1a1a] font-label font-bold uppercase text-xs hover:text-[#0055ff] transition-colors"
            href="/privacy"
          >
            PRIVACY
          </Link>
          <Link
            className="text-[#1a1a1a] font-label font-bold uppercase text-xs hover:text-[#0055ff] transition-colors"
            href="/terms"
          >
            TERMS
          </Link>
          <Link
            className="text-[#1a1a1a] font-label font-bold uppercase text-xs hover:text-[#0055ff] transition-colors"
            href="https://t.me/OfficalVoxTTS"
            target="_blank"
            rel="noreferrer"
          >
            ACCESSIBILITY
          </Link>
        </div>
      </footer>
    </div>
  );
}
