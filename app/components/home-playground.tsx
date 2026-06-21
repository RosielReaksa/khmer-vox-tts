"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePlayground() {
  const [text, setText] = useState("សូមស្វាគមន៍មកកាន់ Khmer Vox TTS។");
  const [voice, setVoice] = useState("female");
  const [speed, setSpeed] = useState(1.0);
  const [busy, setBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showModal, setShowModal] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const togglePlay = () => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((err) => console.error(err));
      setIsPlaying(true);
    }
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    setAudioUrl("");
    setIsPlaying(false);
    setCurrentTime(0);

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
        setError(data.error || "Generation failed.");
        setBusy(false);
        return;
      }

      const url = `data:${data.contentType};base64,${data.audioBase64}`;
      setAudioUrl(url);
      setDuration(data.outputSeconds || 4.0);
      setBusy(false);

      // Play immediately
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load();
          audioRef.current.playbackRate = speed;
          audioRef.current.play().then(() => {
            setIsPlaying(true);
          }).catch(err => console.error("Audio playback error:", err));
        }
      }, 50);

    } catch {
      setError("Failed to connect. Please try again.");
      setBusy(false);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Simple animation tick for waveform if playing
  const [animationTick, setAnimationTick] = useState(0);
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setAnimationTick((t) => t + 1);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  return (
    <div className="bg-surface-bright border-4 border-primary p-4 md:p-8 flex flex-col gap-5 md:gap-6 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] sm:shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] w-full text-[#1a1a1a]">
      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleAudioEnded}
          className="hidden"
        />
      )}

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b-4 border-primary pb-4 mb-2 gap-3 sm:gap-0">
        <h2 className="font-headline font-black text-xl md:text-2xl uppercase tracking-tighter flex items-center gap-2">
          <span className="material-symbols-outlined text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
            graphic_eq
          </span>
          Playground
        </h2>
        <span className="bg-tertiary text-on-tertiary font-label text-xs uppercase font-bold px-2 py-1 border-2 border-primary self-start sm:self-auto">
          Live Demo
        </span>
      </div>

      {error && (
        <div className="bg-[#ffdad6] border-2 border-[#e63b2e] p-3 text-sm font-bold text-[#93000a]">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="font-label text-sm uppercase font-bold text-primary">Input Text (Khmer)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          className="w-full bg-surface border-4 border-primary p-3 md:p-4 font-body text-base md:text-lg focus:outline-none focus:ring-0 focus:border-tertiary focus:bg-white transition-colors resize-none h-24 md:h-32 text-[#1a1a1a]"
          placeholder="សូមស្វាគមន៍មកកាន់ Khmer Vox TTS។"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        <div className="flex flex-col gap-2">
          <label className="font-label text-sm uppercase font-bold text-primary">Voice Model</label>
          <div className="grid grid-cols-2 gap-2 w-full">
            <button
              type="button"
              disabled={busy}
              onClick={() => setVoice("female")}
              className={`flex items-center justify-center gap-1.5 border-4 p-2.5 font-label font-bold text-xs sm:text-sm md:text-base transition-all shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
                voice === "female"
                  ? "bg-primary text-primary-fixed border-primary"
                  : "bg-surface text-primary border-primary hover:bg-[#faf7f2]"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="material-symbols-outlined text-sm md:text-base shrink-0" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                face_3
              </span>
              <span className="truncate">Female (Sokha)</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setVoice("male")}
              className={`flex items-center justify-center gap-1.5 border-4 p-2.5 font-label font-bold text-xs sm:text-sm md:text-base transition-all shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
                voice === "male"
                  ? "bg-primary text-primary-fixed border-primary"
                  : "bg-surface text-primary border-primary hover:bg-[#faf7f2]"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="material-symbols-outlined text-sm md:text-base shrink-0" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                face
              </span>
              <span className="truncate">Male (Piseth)</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-label text-sm uppercase font-bold text-primary flex justify-between">
            <span>Speed</span>
            <span>{speed.toFixed(1)}x</span>
          </label>
          <div className="h-12 md:h-14 flex items-center group">
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              disabled={busy}
              className="w-full accent-tertiary bg-surface h-2 border-2 border-primary appearance-none cursor-pointer"
            />
          </div>
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
        {busy ? "Generating..." : "Generate Speech"}
      </button>

      <div className="mt-4 p-3 md:p-4 border-4 border-primary bg-surface flex flex-wrap sm:flex-nowrap items-center gap-3 md:gap-4 justify-between sm:justify-start">
        <button
          onClick={togglePlay}
          disabled={!audioUrl}
          type="button"
          aria-label={isPlaying ? "Pause preview audio" : "Play preview audio"}
          className="w-10 h-10 md:w-12 md:h-12 bg-primary text-surface rounded-none border-2 border-primary flex items-center justify-center hover:bg-tertiary hover:text-white transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
            {isPlaying ? "pause" : "play_arrow"}
          </span>
        </button>
        <div className="flex-1 h-12 hidden sm:flex items-center justify-between gap-1 overflow-hidden">
          {[...Array(16)].map((_, i) => {
            const active = isPlaying && currentTime > 0;
            // Generate some height based on standard wave shape
            let baseHeight = 12 + ((i * 7) % 24);
            if (i > 8) baseHeight = 12 + (((16 - i) * 7) % 24);
            // If playing, add sin animation
            const height = active
              ? Math.max(8, Math.min(44, baseHeight + Math.sin(i + animationTick) * 12))
              : baseHeight;
            return (
              <div
                key={i}
                className={`w-1.5 md:w-2 border border-primary ${
                  active ? "bg-primary" : "bg-surface-variant"
                }`}
                style={{ height: `${height}px` }}
              />
            );
          })}
        </div>
        <span className="font-label font-bold text-xs md:text-sm shrink-0 w-full sm:w-auto text-center sm:text-right mt-2 sm:mt-0">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* Auth Modal overlay */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[#f5f0e8] border-4 border-primary p-6 md:p-8 max-w-sm w-full shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] relative">
            <h3 className="font-headline font-black text-xl uppercase tracking-tighter mb-4 text-primary">
              SIGN UP TO GENERATE SPEECH
            </h3>
            <p className="font-body text-sm text-on-surface-variant mb-6 border-l-4 border-primary pl-3">
              To use the live voice generator and get <strong>100 free tokens</strong>, you need a free account.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => router.push("/app/signup")}
                className="w-full font-headline text-lg uppercase font-bold bg-primary text-on-primary border-4 border-primary py-2.5 hover:bg-primary-fixed hover:text-primary transition-colors duration-100 ease-linear shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                Create Free Account
              </button>
              <button
                onClick={() => router.push("/app/signin")}
                className="w-full font-headline text-lg uppercase font-bold bg-transparent text-primary border-4 border-primary py-2.5 hover:bg-surface-container-high transition-colors duration-100 ease-linear shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                Sign In
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="w-full font-headline text-sm uppercase font-bold text-on-surface-variant hover:underline mt-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
