"use client";

import { useState, useEffect } from "react";

type HistoryRowActionsProps = {
  itemId: string;
  hasAudio: boolean;
};

// Global singleton to coordinate audio playing across different rows
let globalAudio: HTMLAudioElement | null = null;
let globalSetPlayingId: ((id: string | null) => void) | null = null;
let globalPlayingId: string | null = null;

export function HistoryRowActions({ itemId, hasAudio }: HistoryRowActionsProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  // Sync state if another row starts playing
  useEffect(() => {
    if (globalPlayingId === itemId && globalAudio && !globalAudio.paused) {
      setTimeout(() => setIsPlaying(true), 0);
      globalSetPlayingId = (id) => {
        if (id !== itemId) {
          setIsPlaying(false);
        }
      };
    }
  }, [itemId]);

  const handlePlay = () => {
    if (typeof window === "undefined") return;

    if (!globalAudio) {
      globalAudio = new Audio();
    }

    if (isPlaying) {
      globalAudio.pause();
      setIsPlaying(false);
      globalPlayingId = null;
      globalSetPlayingId = null;
    } else {
      // If there was something else playing, turn off its playing state
      if (globalSetPlayingId) {
        globalSetPlayingId(null);
      }

      globalAudio.src = `/api/dashboard/history/${itemId}/download?inline=true`;
      globalAudio.load();
      globalAudio.play().catch((err) => {
        console.error("Audio playback error:", err);
        setIsPlaying(false);
        globalPlayingId = null;
        globalSetPlayingId = null;
      });

      setIsPlaying(true);
      globalPlayingId = itemId;
      globalSetPlayingId = (id) => {
        if (id !== itemId) {
          setIsPlaying(false);
        }
      };

      globalAudio.onended = () => {
        setIsPlaying(false);
        if (globalPlayingId === itemId) {
          globalPlayingId = null;
          globalSetPlayingId = null;
        }
      };
    }
  };

  useEffect(() => {
    return () => {
      // Clean up if component unmounts and it was the active playing audio
      if (globalPlayingId === itemId && globalAudio) {
        globalAudio.pause();
        globalPlayingId = null;
        globalSetPlayingId = null;
      }
    };
  }, [itemId]);

  if (!hasAudio) {
    return (
      <>
        <button
          className="w-10 h-10 flex items-center justify-center border-2 border-outline-variant bg-surface-container opacity-50 cursor-not-allowed"
          disabled
        >
          <span className="material-symbols-outlined">play_arrow</span>
        </button>
        <button
          className="w-10 h-10 flex items-center justify-center border-2 border-outline-variant bg-surface-container opacity-50 cursor-not-allowed"
          disabled
        >
          <span className="material-symbols-outlined">download</span>
        </button>
      </>
    );
  }

  return (
    <>
      <button
        onClick={handlePlay}
        aria-label="Play"
        className={`w-10 h-10 flex items-center justify-center border-2 border-primary transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[0px_0px_0px_0px_rgba(26,26,26,1)] ${
          isPlaying
            ? "bg-tertiary text-white hover:bg-[#e6b800] hover:text-primary"
            : "bg-primary-fixed text-primary hover:bg-primary hover:text-primary-fixed"
        }`}
      >
        <span className="material-symbols-outlined">{isPlaying ? "pause" : "play_arrow"}</span>
      </button>
      <a
        href={`/api/dashboard/history/${itemId}/download`}
        download
        aria-label="Download"
        className="w-10 h-10 flex items-center justify-center border-2 border-primary bg-surface text-primary hover:bg-primary hover:text-surface transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[0px_0px_0px_0px_rgba(26,26,26,1)]"
      >
        <span className="material-symbols-outlined">download</span>
      </a>
    </>
  );
}
