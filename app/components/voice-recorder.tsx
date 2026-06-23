"use client";

import { useEffect, useRef, useState } from "react";

type RecorderState = "idle" | "requesting" | "recording" | "done" | "error";

type VoiceRecorderProps = {
  /** Called when recording is complete with a File object */
  onRecordingComplete: (file: File) => void;
  /** Called when the user discards/clears a recording */
  onClear?: () => void;
  /** Existing file — if present, show as already selected */
  existingFile?: File | null;
  disabled?: boolean;
};

const BAR_COUNT = 24;

export default function VoiceRecorder({
  onRecordingComplete,
  onClear,
  existingFile,
  disabled = false,
}: VoiceRecorderProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isRecordingRef = useRef(false);

  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [playing, setPlaying] = useState(false);
  const [barHeights, setBarHeights] = useState<number[]>(
    Array.from({ length: BAR_COUNT }, () => 0)
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracks();
      stopTimer();
      stopRaf();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  function stopTracks() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function stopRaf() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function drawBars() {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    // Sample down to BAR_COUNT bars
    const step = Math.floor(bufferLength / BAR_COUNT);
    const heights: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += dataArray[i * step + j] ?? 0;
      }
      const avg = sum / step;
      // Normalize: 0-255 → 0-1
      heights.push(avg / 255);
    }
    setBarHeights(heights);

    rafRef.current = requestAnimationFrame(drawBars);
  }

  async function startRecording() {
    if (disabled) return;
    setState("requesting");
    setErrorMsg("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio analyser for waveform visualization
      try {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;
      } catch {
        // Analyser is optional — waveform bars will stay at 0
      }

      // Determine a supported mime type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stopTracks();
        isRecordingRef.current = false;

        if (analyserRef.current) {
          analyserRef.current.disconnect();
          analyserRef.current = null;
        }

        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = new File([blob], `recording.${mimeType.includes("mp4") ? "mp4" : "webm"}`, {
          type: blob.type,
        });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState("done");
        onRecordingComplete(file);

        stopTimer();
        stopRaf();
        setBarHeights(Array.from({ length: BAR_COUNT }, () => 0));
      };

      recorder.onerror = () => {
        stopTracks();
        setState("error");
        setErrorMsg("Recording failed. Please try again.");
      };

      recorder.start(250);
      setState("recording");
      isRecordingRef.current = true;

      // Start drawing waveform bars
      if (analyserRef.current) {
        rafRef.current = requestAnimationFrame(drawBars);
      } else {
        // Fallback: animate bars randomly
        animateFallbackBars();
      }

      // Start elapsed timer
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 200);
    } catch (err) {
      stopTracks();
      setState("error");
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setErrorMsg("Microphone access denied. Please allow microphone permissions in your browser settings.");
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        setErrorMsg("No microphone found. Please connect a microphone and try again.");
      } else {
        setErrorMsg("Could not start recording. Please check your microphone permissions.");
      }
    }
  }

  function animateFallbackBars() {
    if (!isRecordingRef.current) return;
    const heights = Array.from({ length: BAR_COUNT }, () => Math.random());
    setBarHeights(heights);
    rafRef.current = requestAnimationFrame(animateFallbackBars);
  }

  function stopRecording() {
    isRecordingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  function clearRecording() {
    isRecordingRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlaying(false);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setState("idle");
    setElapsed(0);
    setErrorMsg("");
    chunksRef.current = [];
    stopTimer();
    stopRaf();
    setBarHeights(Array.from({ length: BAR_COUNT }, () => 0));
    onClear?.();
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.currentTime = 0;
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }

  const hasDoneFile = state === "done" && audioUrl;

  return (
    <div className="grid gap-2">
      {/* Hidden audio for playback */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          preload="auto"
        />
      )}

      {/* Existing file summary (when switching from upload tab) */}
      {existingFile && !audioUrl && (
        <div className="flex items-center gap-3 border-4 border-primary bg-white px-4 py-3 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
          <span className="flex h-7 w-7 items-center justify-center border-2 border-primary bg-amber-100">
            <span className="material-symbols-outlined text-sm text-amber-800" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">upload_file</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-headline text-xs font-bold uppercase text-primary truncate">{existingFile.name}</p>
            <p className="font-body text-[10px] text-gray-500">{(existingFile.size / 1024).toFixed(0)} KB</p>
          </div>
          <button
            type="button"
            onClick={clearRecording}
            className="flex items-center gap-1 border-2 border-primary bg-white px-2 py-1 font-headline text-[9px] font-bold uppercase text-primary hover:bg-red-50 transition-colors"
          >
            <span className="material-symbols-outlined text-xs" aria-hidden="true">close</span>
            Remove
          </button>
        </div>
      )}

      {/* Main recorder card — dark style with amber glow */}
      {(!existingFile || audioUrl || hasDoneFile) && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-white/15 shadow-xl"
          style={{
            background: "radial-gradient(ellipse at center, rgba(255,180,40,0.12) 0%, rgba(0,0,0,0.95) 70%)",
            backgroundColor: "#111",
          }}
        >
          {/* Inner content */}
          <div className="relative z-10 flex flex-col items-center gap-3 px-5 py-6">

            {/* Header */}
            <span className="font-headline text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
              Voice Recorder
            </span>

            {/* Timer */}
            <span className="font-headline text-3xl font-black tracking-[0.08em] text-white/90 tabular-nums">
              {state === "recording" ? formatTime(elapsed) : formatTime(0)}
            </span>

            {/* Recording indicator dot */}
            {state === "recording" && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-headline text-[9px] font-bold uppercase tracking-widest text-red-400">REC</span>
              </span>
            )}

            {/* Done state: play / re-record buttons */}
            {hasDoneFile && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlayback}
                  className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-4 py-2 font-headline text-xs font-bold uppercase text-white hover:bg-white/20 transition-all backdrop-blur-sm"
                >
                  <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                    {playing ? "pause" : "play_arrow"}
                  </span>
                  {playing ? "Playing" : "Listen"}
                </button>
                <button
                  type="button"
                  onClick={clearRecording}
                  className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-4 py-2 font-headline text-xs font-bold uppercase text-white/60 hover:bg-white/10 transition-all"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">refresh</span>
                  Re-record
                </button>
              </div>
            )}

            {/* Main mic button — centered, large, circular */}
            {!hasDoneFile && (
              <button
                type="button"
                onClick={state === "recording" ? stopRecording : startRecording}
                disabled={disabled || state === "requesting"}
                className={`flex items-center justify-center rounded-full border border-white/30 bg-black/40 w-[72px] h-[72px] transition-all backdrop-blur-sm
                  ${state === "recording" ? "animate-pulse border-red-400/60" : "hover:bg-white/10 hover:scale-105 active:scale-95"}
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
                aria-label={state === "recording" ? "Stop recording" : "Start recording"}
              >
                <span className="material-symbols-outlined text-3xl text-white" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                  {state === "recording" ? "stop" : "mic"}
                </span>
              </button>
            )}

            {/* Idle / requesting hint text */}
            {state === "idle" && !hasDoneFile && (
              <span className="font-headline text-[10px] font-bold uppercase tracking-wide text-white/40">
                Tap to record
              </span>
            )}
            {state === "requesting" && (
              <span className="flex items-center gap-2 font-headline text-[10px] font-bold uppercase tracking-wide text-white/60">
                <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                Requesting microphone...
              </span>
            )}
          </div>

          {/* Waveform visualizer at the bottom */}
          <div className="absolute bottom-0 left-0 right-0 z-0 flex items-end justify-center gap-[3px] px-4 pb-3">
            {state === "recording"
              ? barHeights.map((h, i) => (
                  <div
                    key={i}
                    className="w-[5px] rounded-t-full transition-all duration-75"
                    style={{
                      height: `${Math.max(2, h * 32)}px`,
                      background: "linear-gradient(to top, rgba(255,180,40,0.3), rgba(255,200,80,0.8))",
                    }}
                  />
                ))
              : state === "idle"
                ? Array.from({ length: BAR_COUNT }).map((_, i) => (
                    <div
                      key={i}
                      className="w-[5px] rounded-t-full"
                      style={{
                        height: "3px",
                        background: "rgba(255,255,255,0.08)",
                      }}
                    />
                  ))
                : null}
          </div>
        </div>
      )}

      {/* Error message */}
      {state === "error" && (
        <div className="flex items-start gap-2 px-1">
          <span className="material-symbols-outlined text-sm text-red-500 shrink-0 mt-0.5" aria-hidden="true">error</span>
          <p className="font-body text-xs leading-relaxed text-red-500">
            {errorMsg}
          </p>
        </div>
      )}

      {/* Retry button after error */}
      {state === "error" && (
        <button
          type="button"
          onClick={() => setState("idle")}
          className="self-start rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-1.5 font-headline text-[10px] font-bold uppercase tracking-wide text-red-400 hover:bg-red-950/50 transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
}
