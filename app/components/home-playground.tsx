"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LineAudioPlayer from "@/app/components/line-audio-player";
import VoicePreviewCard from "@/app/components/voice-preview-card";
import { useT } from "@/app/components/locale-provider";

export default function HomePlayground() {
  const [text, setText] = useState("សូមស្វាគមន៍មកកាន់ Khmer Vox TTS។");
  const [voice, setVoice] = useState("female");
  const [busy, setBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);

  const router = useRouter();
  const t = useT();

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    setAudioUrl("");

    try {
      // Check if logged in
      const meRes = await fetch("/api/me");
      if (!meRes.ok) {
        setShowModal(true);
        setBusy(false);
        return;
      }
      const meData = await meRes.json();
      if (!meData.user) {
        setShowModal(true);
        setBusy(false);
        return;
      }

      // Generate speech
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice,
          model: "voxcpm2",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("playground.errorFailed"));
        setBusy(false);
        return;
      }

      const url = `data:${data.contentType};base64,${data.audioBase64}`;
      setAudioUrl(url);
      setBusy(false);
    } catch {
      setError(t("playground.errorConnect"));
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface-bright border-4 border-primary p-4 md:p-8 flex flex-col gap-5 md:gap-6 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] sm:shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] w-full text-[#1a1a1a]">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b-4 border-primary pb-4 mb-2 gap-3 sm:gap-0">
        <h2 className="font-headline font-black text-xl md:text-2xl uppercase tracking-tighter flex items-center gap-2">
          <span className="material-symbols-outlined text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
            graphic_eq
          </span>
          {t("playground.title")}
        </h2>
        <span className="bg-tertiary text-on-tertiary font-label text-xs uppercase font-bold px-2 py-1 border-2 border-primary self-start sm:self-auto">
          {t("playground.liveDemo")}
        </span>
      </div>

      {error && (
        <div className="bg-[#ffdad6] border-2 border-[#e63b2e] p-3 text-sm font-bold text-[#93000a]">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="font-label text-sm uppercase font-bold text-primary">{t("playground.inputLabel")}</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          className="w-full bg-surface border-4 border-primary p-3 md:p-4 font-body text-base md:text-lg focus:outline-none focus:ring-0 focus:border-tertiary focus:bg-white transition-colors resize-none h-24 md:h-32 text-[#1a1a1a]"
          placeholder={t("playground.inputPlaceholder")}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-label text-sm uppercase font-bold text-primary">{t("playground.voiceModel")}</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <VoicePreviewCard
            voice="female"
            selected={voice === "female"}
            onSelect={() => setVoice("female")}
            disabled={busy}
            name="Sokha"
            gender={t("playground.femaleLabel")}
            costRate="1.5 tok/sec"
            icon="face_3"
            previewLabel={t("playground.preview")}
            playLabel={t("playground.previewPlay")}
            stopLabel={t("playground.previewStop")}
          />
          <VoicePreviewCard
            voice="male"
            selected={voice === "male"}
            onSelect={() => setVoice("male")}
            disabled={busy}
            name="Piseth"
            gender={t("playground.maleLabel")}
            costRate="1.5 tok/sec"
            icon="face"
            previewLabel={t("playground.preview")}
            playLabel={t("playground.previewPlay")}
            stopLabel={t("playground.previewStop")}
          />
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={busy || !text.trim()}
        className="w-full font-headline text-xl md:text-2xl uppercase font-black bg-primary text-primary-fixed border-4 border-primary py-3 md:py-4 mt-2 hover:bg-primary-fixed hover:text-primary transition-colors duration-100 ease-linear active:translate-y-1 active:bg-tertiary active:text-on-tertiary group flex items-center justify-center gap-2 md:gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined group-hover:animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
          {busy ? "hourglass_empty" : "play_circle"}
        </span>
        {busy ? t("playground.generating") : t("playground.generate")}
      </button>

      {audioUrl && (
        <div className="mt-4 p-3 md:p-4 border-4 border-primary bg-surface">
          <LineAudioPlayer src={audioUrl} />
        </div>
      )}

      {/* Auth Modal overlay */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[#f5f0e8] border-4 border-primary p-6 md:p-8 max-w-sm w-full shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] relative">
            <h3 className="font-headline font-black text-xl uppercase tracking-tighter mb-4 text-primary">
              {t("playground.modalTitle")}
            </h3>
            <p className="font-body text-sm text-on-surface-variant mb-6 border-l-4 border-primary pl-3">
              {t("playground.modalBody")}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => router.push("/app/signup")}
                className="w-full font-headline text-lg uppercase font-bold bg-primary text-on-primary border-4 border-primary py-2.5 hover:bg-primary-fixed hover:text-primary transition-colors duration-100 ease-linear shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                {t("playground.modalCreateAccount")}
              </button>
              <button
                onClick={() => router.push("/app/signin")}
                className="w-full font-headline text-lg uppercase font-bold bg-transparent text-primary border-4 border-primary py-2.5 hover:bg-surface-container-high transition-colors duration-100 ease-linear shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                {t("playground.modalSignIn")}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="w-full font-headline text-sm uppercase font-bold text-on-surface-variant hover:underline mt-2"
              >
                {t("playground.modalClose")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
