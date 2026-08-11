"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PointerEvent = React.PointerEvent<HTMLDivElement>;

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function pickDuration(...candidates: number[]): number {
  for (const value of candidates) {
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function clampTime(time: number, duration: number): number {
  if (!Number.isFinite(time) || time < 0) return 0;
  if (duration > 0) return Math.min(time, duration);
  return time;
}

type PlaybackState = {
  offset: number;
  startCtxTime: number;
  rate: number;
  playing: boolean;
};

/**
 * Linear audio scrubber for dashboard / playground results.
 *
 * Uses the Web Audio API (decoded AudioBuffer) instead of relying on
 * `<audio>.currentTime`, because large generated WAVs — even as blob URLs —
 * often cannot be seeked reliably in HTMLMediaElement.
 */
export default function LineAudioPlayer({
  src,
  durationHint,
  onPlayingChange,
}: {
  src: string;
  /** Fallback while decoding or when buffer metadata is unavailable. */
  durationHint?: number;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackRef = useRef<PlaybackState>({
    offset: 0,
    startCtxTime: 0,
    rate: 1,
    playing: false,
  });
  const scrubbingRef = useRef(false);
  const resumeAfterScrubRef = useRef(false);
  const endedHandlerRef = useRef<(() => void) | null>(null);

  const [ready, setReady] = useState(false);
  const [decodeError, setDecodeError] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);

  const readPosition = useCallback((): number => {
    const playback = playbackRef.current;
    const ctx = audioContextRef.current;
    if (!playback.playing || !ctx || !sourceRef.current) {
      return playback.offset;
    }
    const elapsed = (ctx.currentTime - playback.startCtxTime) * playback.rate;
    return playback.offset + elapsed;
  }, []);

  const stopSource = useCallback((captureOffset = true) => {
    const source = sourceRef.current;
    // Capture the position BEFORE nulling the source ref: readPosition()
    // returns early with the (wrong) segment start offset when
    // sourceRef.current is null, which made pause/resume reset to 0.
    if (captureOffset && playbackRef.current.playing) {
      playbackRef.current.offset = readPosition();
      playbackRef.current.playing = false;
    }
    if (source) {
      if (endedHandlerRef.current) {
        source.removeEventListener("ended", endedHandlerRef.current);
        endedHandlerRef.current = null;
      }
      try {
        source.stop();
      } catch {
        // already stopped
      }
      source.disconnect();
      sourceRef.current = null;
    }
  }, [readPosition]);

  const effectiveDuration = useMemo(
    () => pickDuration(duration, durationHint ?? 0),
    [duration, durationHint],
  );

  const startAt = useCallback(
    async (offset: number) => {
      const ctx = audioContextRef.current;
      const buffer = bufferRef.current;
      if (!ctx || !buffer) return;

      await ctx.resume();

      const startOffset = clampTime(offset, buffer.duration);
      stopSource(true);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = playbackRef.current.rate;
      source.connect(ctx.destination);

      const onEnded = () => {
        const atEnd = startOffset >= buffer.duration - 0.05;
        stopSource(false);
        playbackRef.current.playing = false;
        playbackRef.current.offset = atEnd ? 0 : startOffset;
        setPlaying(false);
        setCurrentTime(atEnd ? 0 : startOffset);
      };
      endedHandlerRef.current = onEnded;
      source.addEventListener("ended", onEnded);

      source.start(0, startOffset);
      sourceRef.current = source;
      playbackRef.current.offset = startOffset;
      playbackRef.current.startCtxTime = ctx.currentTime;
      playbackRef.current.playing = true;
      setPlaying(true);
      setCurrentTime(startOffset);
    },
    [stopSource],
  );

  const applySeek = useCallback((targetTime: number) => {
    const buffer = bufferRef.current;
    const dur = pickDuration(buffer?.duration ?? 0, effectiveDuration);
    const next = clampTime(targetTime, dur);
    playbackRef.current.offset = next;
    setCurrentTime(next);
  }, [effectiveDuration]);

  // Decode audio into an AudioBuffer for sample-accurate seeking.
  useEffect(() => {
    let cancelled = false;

    const resetPlayback = () => {
      stopSource(false);
      playbackRef.current = {
        offset: 0,
        startCtxTime: 0,
        rate: playbackRef.current.rate,
        playing: false,
      };
      bufferRef.current = null;
      setReady(false);
      setDecodeError(false);
      setDuration(0);
      setCurrentTime(0);
      setPlaying(false);
    };

    resetPlayback();

    void (async () => {
      try {
        let fetchUrl = src;
        if (src.startsWith("data:")) {
          const response = await fetch(src);
          const blob = await response.blob();
          if (cancelled) return;
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          fetchUrl = url;
        }

        const response = await fetch(fetchUrl);
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        const ctx = audioContextRef.current ?? new AudioContext();
        audioContextRef.current = ctx;
        const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        if (cancelled) return;

        bufferRef.current = buffer;
        setDuration(pickDuration(buffer.duration, durationHint ?? 0));
        setReady(true);
      } catch {
        if (!cancelled) {
          setDecodeError(true);
          setDuration(durationHint ?? 0);
        }
      }
    })();

    return () => {
      cancelled = true;
      stopSource(false);
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [src, durationHint, stopSource]);

  // Smooth playhead while playing.
  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = () => {
      if (!scrubbingRef.current) {
        setCurrentTime(readPosition());
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
  }, [playing, readPosition]);

  useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);

  const progress = effectiveDuration > 0 ? currentTime / effectiveDuration : 0;

  const seekToClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || !ready) return;
      const dur = effectiveDuration;
      if (!dur || dur <= 0) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      applySeek(ratio * dur);
    },
    [applySeek, effectiveDuration, ready],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent) => {
      if (!ready) return;
      event.preventDefault();
      resumeAfterScrubRef.current = playbackRef.current.playing;
      stopSource(true);
      setPlaying(false);
      scrubbingRef.current = true;
      setScrubbing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      seekToClientX(event.clientX);
    },
    [ready, seekToClientX, stopSource],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!scrubbingRef.current) return;
      seekToClientX(event.clientX);
    },
    [seekToClientX],
  );

  const finishScrub = useCallback(
    (event: PointerEvent) => {
      if (!scrubbingRef.current) return;
      scrubbingRef.current = false;
      setScrubbing(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (resumeAfterScrubRef.current) {
        resumeAfterScrubRef.current = false;
        void startAt(playbackRef.current.offset);
      }
    },
    [startAt],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      finishScrub(event);
    },
    [finishScrub],
  );

  const handlePointerCancel = useCallback(
    (event: PointerEvent) => {
      finishScrub(event);
    },
    [finishScrub],
  );

  const togglePlay = useCallback(async () => {
    if (!ready) return;
    if (playbackRef.current.playing) {
      stopSource(true);
      setPlaying(false);
      setCurrentTime(playbackRef.current.offset);
      return;
    }
    await startAt(playbackRef.current.offset);
  }, [ready, startAt, stopSource]);

  const skipToStart = useCallback(() => {
    const wasPlaying = playbackRef.current.playing;
    stopSource(true);
    playbackRef.current.offset = 0;
    setCurrentTime(0);
    setPlaying(false);
    if (wasPlaying) {
      void startAt(0);
    }
  }, [startAt, stopSource]);

  const cycleRate = useCallback(() => {
    const order = [1, 1.25, 1.5, 0.75];
    setRate((prev) => {
      const idx = order.indexOf(prev);
      const next = order[(idx + 1) % order.length];
      playbackRef.current.rate = next;
      if (playbackRef.current.playing) {
        const position = readPosition();
        stopSource(true);
        playbackRef.current.offset = position;
        void startAt(position);
      }
      return next;
    });
  }, [readPosition, startAt, stopSource]);

  return (
    <div className="flex flex-col gap-3 w-full">
      {!ready && !decodeError ? (
        <p className="text-center text-[10px] font-headline font-bold uppercase text-[#4a4a4a]">
          Preparing player...
        </p>
      ) : null}
      {decodeError ? (
        <p className="text-center text-[10px] font-headline font-bold uppercase text-red-700">
          Could not decode audio for seeking.
        </p>
      ) : null}

      <div className="flex items-center gap-3 w-full">
        <span className="shrink-0 w-10 text-right font-headline font-black tabular-nums text-[11px] text-[#1a1a1a]">
          {formatClock(currentTime)}
        </span>

        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, Math.floor(effectiveDuration))}
          aria-valuenow={Math.floor(currentTime)}
          aria-disabled={!ready}
          className={`group relative flex h-10 flex-1 items-center touch-none select-none ${
            ready ? "cursor-pointer" : "cursor-not-allowed opacity-70"
          }`}
        >
          <div className="absolute left-0 right-0 h-1.5 rounded-full bg-[#1a1a1a]/15" />
          <div
            className="absolute left-0 h-1.5 rounded-full bg-[#ffcc00]"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
          <div
            className={`pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#1a1a1a] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition-transform ${
              scrubbing ? "scale-125" : "group-hover:scale-110"
            }`}
            style={{ left: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>

        <span className="shrink-0 w-10 font-headline font-black tabular-nums text-[11px] text-[#4a4a4a]">
          {formatClock(effectiveDuration)}
        </span>
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => void togglePlay()}
          disabled={!ready}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ffcc00] text-[#1a1a1a] shadow-[0_1px_3px_rgba(0,0,0,0.2)] hover:bg-[#ffd633] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          {playing ? (
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={skipToStart}
          disabled={!ready}
          aria-label="Restart"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#4a4a4a] hover:bg-[#1a1a1a]/5 hover:text-[#1a1a1a] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        <button
          type="button"
          onClick={cycleRate}
          disabled={!ready}
          aria-label="Playback speed"
          className="flex h-10 shrink-0 items-center justify-center rounded-full border border-[#1a1a1a]/20 px-3 text-[11px] font-headline font-black uppercase text-[#1a1a1a] hover:bg-[#1a1a1a]/5 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          {rate}x
        </button>
      </div>
    </div>
  );
}
