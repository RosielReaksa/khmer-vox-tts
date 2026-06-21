"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PointerEvent = React.PointerEvent<HTMLDivElement>;

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Simple linear audio scrubber — a thin track with a draggable playhead dot,
 * like a video player progress bar. Replaces the heavier waveform visualization
 * with a cleaner, familiar control. Click/drag anywhere on the line to seek.
 *
 * Renders its own <audio> element (hidden) and drives the playhead with
 * requestAnimationFrame for smooth ~60fps movement while playing.
 */
export default function LineAudioPlayer({
  src,
  onPlayingChange,
}: {
  src: string;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  // Mirror `scrubbing` in a ref so the pointermove handler always reads the
  // current value without waiting for a re-render (avoids a stale-closure race
  // where the first move after pointer-down was ignored).
  const scrubbingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [rate, setRate] = useState(1);

  // Smooth playhead via rAF while playing (browser timeupdate is ~4Hz).
  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }
    const tick = () => {
      const audio = audioRef.current;
      if (audio && !scrubbing) {
        setCurrentTime(audio.currentTime);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playing, scrubbing]);

  useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);

  const progress = duration > 0 ? currentTime / duration : 0;

  const seekToClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    const audio = audioRef.current;
    if (!track || !audio || !Number.isFinite(audio.duration)) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setCurrentTime(audio.currentTime);
  }, []);

  const handlePointerDown = useCallback(
    (event: PointerEvent) => {
      event.preventDefault();
      scrubbingRef.current = true;
      setScrubbing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      seekToClientX(event.clientX);
    },
    [seekToClientX],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      // Read from the ref, not state, so the first move after pointer-down is
      // not dropped waiting for React to re-render with the new scrubbing flag.
      if (!scrubbingRef.current) return;
      seekToClientX(event.clientX);
    },
    [seekToClientX],
  );

  const handlePointerUp = useCallback((event: PointerEvent) => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    setScrubbing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }, []);

  const skipToStart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
  }, []);

  const cycleRate = useCallback(() => {
    const order = [1, 1.25, 1.5, 0.75];
    setRate((prev) => {
      const idx = order.indexOf(prev);
      const next = order[(idx + 1) % order.length];
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  }, []);

  return (
    <div className="flex items-center gap-2 sm:gap-3 w-full">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => {
          if (!scrubbing) setCurrentTime(event.currentTarget.currentTime);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        className="hidden"
      />

      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ffcc00] text-[#1a1a1a] hover:bg-[#ffd633] transition-colors cursor-pointer"
      >
        {playing ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      <button
        type="button"
        onClick={skipToStart}
        aria-label="Restart"
        className="hidden sm:flex h-8 w-8 shrink-0 items-center justify-center text-[#4a4a4a] hover:text-[#1a1a1a] transition-colors cursor-pointer"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
      </button>

      {/* The thin scrub line. Taller hit area (h-8) than the visible line (h-1)
          so the user has a generous grab target for drag-to-seek. */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.floor(duration))}
        aria-valuenow={Math.floor(currentTime)}
        className="group relative flex h-8 flex-1 cursor-pointer items-center touch-none select-none"
      >
        {/* Track */}
        <div className="absolute left-0 right-0 h-1 rounded-full bg-[#1a1a1a]/15" />
        {/* Played portion */}
        <div
          className="absolute left-0 h-1 rounded-full bg-[#ffcc00]"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
        {/* Draggable playhead dot */}
        <div
          className={`absolute h-4 w-4 -translate-x-1/2 rounded-full border-2 border-[#1a1a1a] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform ${
            scrubbing ? "scale-125" : "group-hover:scale-110"
          }`}
          style={{ left: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>

      {/* Time readout */}
      <div className="shrink-0 font-headline font-black tabular-nums text-[11px] text-[#1a1a1a]">
        <span>{formatClock(currentTime)}</span>
        <span className="mx-1 text-[#4a4a4a]">/</span>
        <span className="text-[#4a4a4a]">{formatClock(duration)}</span>
      </div>

      <button
        type="button"
        onClick={cycleRate}
        aria-label="Playback speed"
        className="flex h-8 shrink-0 items-center justify-center rounded-full border border-[#1a1a1a]/20 px-2 text-[10px] font-headline font-black uppercase text-[#1a1a1a] hover:bg-[#1a1a1a]/5 transition-colors cursor-pointer"
      >
        {rate}x
      </button>
    </div>
  );
}
