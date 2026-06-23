"use client";

import { useEffect, useRef, useState } from "react";

export type VoicePreviewCardProps = {
  voice: "female" | "male";
  selected: boolean;
  onSelect: () => void;
  name: string;
  gender: string;
  costRate: string;
  icon: string;
  previewLabel: string;
  playLabel: string;
  stopLabel: string;
  disabled?: boolean;
};

export default function VoicePreviewCard({
  voice,
  selected,
  onSelect,
  name,
  gender,
  costRate,
  icon,
  previewLabel,
  playLabel,
  stopLabel,
  disabled = false,
}: VoicePreviewCardProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  // Pause playback if the component becomes disabled (e.g. during generation).
  useEffect(() => {
    if (disabled && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
    }
  }, [disabled]);

  // Stop audio when the card is unmounted.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  async function togglePreview(event: React.MouseEvent) {
    event.stopPropagation();
    if (disabled) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }

    try {
      audio.currentTime = 0;
      await audio.play();
      setPlaying(true);
    } catch {
      // Autoplay can be blocked by the browser; fail silently.
    }
  }

  function handleEnded() {
    setPlaying(false);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !disabled) {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`relative flex flex-col gap-3 border-4 p-3.5 md:p-4 transition-all shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] active:translate-y-0.5 active:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-tertiary ${
        selected
          ? "bg-primary text-primary-fixed border-primary"
          : "bg-surface text-primary border-primary hover:bg-[#faf7f2]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <audio ref={audioRef} src={`/voices/reference_${voice}.wav`} preload="none" onEnded={handleEnded} />

      {/* Header row: icon + name + selected check */}
      <div className="flex items-center gap-2.5">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center border-2 border-primary ${
            selected ? "bg-primary-fixed text-primary" : "bg-tertiary text-on-tertiary"
          }`}
        >
          <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
            {icon}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-headline text-sm font-black uppercase leading-none tracking-tight truncate">
            {name}
          </p>
          <p className={`font-label text-[10px] uppercase font-bold ${selected ? "text-primary-fixed/80" : "text-on-surface-variant"}`}>
            {gender}
          </p>
        </div>
        {selected ? (
          <span className="material-symbols-outlined text-xl shrink-0" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
            check_circle
          </span>
        ) : null}
      </div>

      {/* Cost rate */}
      <p className={`font-headline text-[10px] font-bold uppercase tracking-wide ${selected ? "text-primary-fixed/80" : "text-on-surface-variant"}`}>
        {costRate}
      </p>

      {/* Preview button + equalizer */}
      <button
        type="button"
        onClick={togglePreview}
        disabled={disabled}
        aria-label={playing ? stopLabel : playLabel}
        className={`flex items-center gap-2 border-2 px-3 py-1.5 font-headline text-[11px] font-bold uppercase tracking-wide transition-colors ${
          selected
            ? "border-primary-fixed bg-primary-fixed/15 text-primary-fixed hover:bg-primary-fixed/25"
            : "border-primary bg-white text-primary hover:bg-[#f2ede5]"
        } disabled:cursor-not-allowed self-start`}
      >
        <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
          {playing ? "stop" : "play_arrow"}
        </span>
        {playing ? stopLabel : previewLabel}
        {playing ? (
          <span className="flex items-end gap-[2px] ml-0.5" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="voice-eq-bar w-[2px] bg-current"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </span>
        ) : null}
      </button>
    </div>
  );
}

/**
 * Compact inline preview button for use inside existing voice info cards
 * (e.g. dashboard speech-workspace). Plays the preset reference WAV.
 */
export function VoicePreviewButton({ voice }: { voice: "female" | "male" }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  async function toggle(event: React.MouseEvent) {
    event.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    try {
      audio.currentTime = 0;
      await audio.play();
      setPlaying(true);
    } catch {
      // ignore autoplay block
    }
  }

  return (
    <>
      <audio ref={audioRef} src={`/voices/reference_${voice}.wav`} preload="none" onEnded={() => setPlaying(false)} />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Stop preview" : "Play preview"}
        className="flex items-center gap-1 border-2 border-primary bg-white px-2 py-0.5 font-headline text-[9px] font-bold uppercase tracking-wide text-primary hover:bg-[#f2ede5] transition-colors"
      >
        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
          {playing ? "stop" : "play_arrow"}
        </span>
        {playing ? "Stop" : "Preview"}
        {playing ? (
          <span className="flex items-end gap-[2px] ml-0.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="voice-eq-bar w-[2px] bg-current" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </span>
        ) : null}
      </button>
    </>
  );
}
