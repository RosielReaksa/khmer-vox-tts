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

  useEffect(() => {
    if (disabled && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
    }
  }, [disabled]);

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
      // autoplay blocked
    }
  }

  function handleEnded() {
    setPlaying(false);
  }

  return (
    <div
      role="radio"
      tabIndex={0}
      aria-checked={selected}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !disabled) {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`relative flex flex-col gap-2.5 border-3 p-3.5 cursor-pointer outline-none transition-all duration-100 ease-linear
        ${selected
          ? "bg-primary text-primary-fixed border-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
          : "bg-surface text-primary border-primary hover:bg-[#faf7f2] shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
      `}
    >
      <audio ref={audioRef} src={`/voices/reference_${voice}.wav`} preload="none" onEnded={handleEnded} />

      {/* Top row: icon + name + selected badge */}
      <div className="flex items-center gap-2.5">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center border-2 border-primary text-base ${
            selected ? "bg-primary-fixed text-primary" : "bg-tertiary text-on-tertiary"
          }`}
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
            {icon}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-headline text-sm font-black uppercase leading-tight truncate">
            {name}
          </p>
          <p className={`font-label text-[10px] uppercase font-bold ${selected ? "text-primary-fixed/75" : "text-on-surface-variant"}`}>
            {gender}
          </p>
        </div>
        {selected && (
          <span className="material-symbols-outlined text-lg shrink-0" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
            check_circle
          </span>
        )}
      </div>

      {/* Bottom row: cost rate + preview button */}
      <div className="flex items-center justify-between gap-2">
        <span className={`font-headline text-[10px] font-bold uppercase tracking-wide ${selected ? "text-primary-fixed/70" : "text-on-surface-variant"}`}>
          {costRate}
        </span>

        <button
          type="button"
          onClick={togglePreview}
          disabled={disabled}
          aria-label={playing ? stopLabel : playLabel}
          className={`flex items-center gap-1.5 border-2 px-2.5 py-1 font-headline text-[10px] font-bold uppercase tracking-wide transition-all shrink-0
            ${selected
              ? "border-primary-fixed bg-primary-fixed/15 text-primary-fixed hover:bg-primary-fixed/25"
              : "border-primary bg-white text-primary hover:bg-[#f2ede5]"
            }
            disabled:cursor-not-allowed
          `}
        >
          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
            {playing ? "stop" : "play_arrow"}
          </span>
          <span>{playing ? stopLabel : previewLabel}</span>
          {playing && (
            <span className="flex items-end gap-[2.5px] h-3" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className="voice-eq-bar block w-[2.5px] bg-current rounded-[1px]"
                  style={{ animationDelay: `${i * 0.1}s`, height: `${8 + (i % 3) * 5}px` }}
                />
              ))}
            </span>
          )}
        </button>
      </div>
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
        <span>{playing ? "Stop" : "Preview"}</span>
        {playing && (
          <span className="flex items-end gap-[2px] h-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="voice-eq-bar w-[2px] bg-current rounded-[1px]" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </span>
        )}
      </button>
    </>
  );
}
