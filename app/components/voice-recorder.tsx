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

  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [playing, setPlaying] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracks();
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  function stopTracks() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  async function startRecording() {
    if (disabled) return;
    setState("requesting");
    setErrorMsg("");
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Determine a supported mime type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stopTracks();
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = new File([blob], `recording.${mimeType.includes("mp4") ? "mp4" : "webm"}`, {
          type: blob.type,
        });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState("done");
        onRecordingComplete(file);

        if (timerRef.current) clearInterval(timerRef.current);
        setElapsed(0);
      };

      recorder.onerror = () => {
        stopTracks();
        setState("error");
        setErrorMsg("Recording failed. Please try again.");
      };

      recorder.start(250); // collect data every 250ms
      setState("recording");

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
        setErrorMsg("Could not start recording. Please check your microphone.");
      }
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  function clearRecording() {
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
    if (timerRef.current) clearInterval(timerRef.current);
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

  // Whether there is a recorded or already uploaded file to show
  const hasFile = state === "done" || Boolean(existingFile && !audioUrl);

  return (
    <div className="grid gap-2.5">
      {/* Hidden audio element for playback */}
      <audio
        ref={audioRef}
        src={audioUrl ?? ""}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        preload="auto"
      />

      {/* State: idle — show start button */}
      {state === "idle" && !existingFile && (
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled}
          className="flex items-center justify-center gap-2 border-4 border-primary bg-white px-4 py-3 font-headline text-sm font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#faf7f2] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600">
            <span className="h-2.5 w-2.5 rounded-full bg-white" />
          </span>
          Start Recording
        </button>
      )}

      {/* State: requesting permission */}
      {state === "requesting" && (
        <div className="flex items-center gap-3 border-4 border-primary bg-white px-4 py-3 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="font-headline text-xs font-bold uppercase text-primary">Requesting microphone access...</span>
        </div>
      )}

      {/* State: recording */}
      {state === "recording" && (
        <div className="flex flex-wrap items-center gap-3 border-4 border-primary bg-red-50 px-4 py-3 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 animate-ping rounded-full bg-red-600" />
            <span className="font-headline text-xs font-bold uppercase text-red-800">REC</span>
          </span>
          <span className="font-headline text-sm font-black text-primary tabular-nums">
            {formatTime(elapsed)}
          </span>
          <div className="flex items-end gap-[2px] h-6 ml-1" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className="voice-rec-bar block w-[3px] bg-red-500 rounded-[1px]"
                style={{
                  height: `${12 + Math.random() * 16}px`,
                  animationDelay: `${i * 0.08}s`,
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={stopRecording}
            className="ml-auto flex items-center gap-1.5 border-2 border-primary bg-red-600 px-3 py-1.5 font-headline text-[10px] font-bold uppercase text-white shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] hover:bg-red-700 transition-all"
          >
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
              stop
            </span>
            Stop
          </button>
        </div>
      )}

      {/* State: done — show preview */}
      {state === "done" && audioUrl && (
        <div className="flex flex-wrap items-center gap-3 border-4 border-primary bg-white px-4 py-3 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
          <span className="flex h-7 w-7 items-center justify-center border-2 border-primary bg-emerald-100">
            <span className="material-symbols-outlined text-sm text-emerald-800" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
              check
            </span>
          </span>
          <span className="font-headline text-xs font-bold uppercase text-primary">
            Recorded ({formatTime(elapsed)})
          </span>

          <button
            type="button"
            onClick={togglePlayback}
            className="flex items-center gap-1.5 border-2 border-primary bg-white px-2.5 py-1 font-headline text-[10px] font-bold uppercase text-primary hover:bg-[#f2ede5] transition-colors"
          >
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
              {playing ? "pause" : "play_arrow"}
            </span>
            {playing ? "Playing" : "Listen"}
          </button>

          <button
            type="button"
            onClick={clearRecording}
            className="ml-auto flex items-center gap-1.5 border-2 border-primary bg-white px-2.5 py-1 font-headline text-[10px] font-bold uppercase text-primary hover:bg-red-50 transition-colors"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              delete
            </span>
            Re-record
          </button>
        </div>
      )}

      {/* Error state */}
      {state === "error" && (
        <div className="flex flex-wrap items-center gap-2 border-4 border-[#e63b2e] bg-[#ffdad6] px-4 py-3 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
          <span className="font-headline text-xs font-bold uppercase text-[#93000a] flex-1">
            {errorMsg}
          </span>
          <button
            type="button"
            onClick={() => setState("idle")}
            className="border-2 border-[#e63b2e] bg-white px-2.5 py-1 font-headline text-[10px] font-bold uppercase text-[#93000a] hover:bg-[#ffdad6] transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Existing file from upload — show a summary */}
      {existingFile && !audioUrl && (
        <div className="flex items-center gap-3 border-4 border-primary bg-white px-4 py-3 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
          <span className="flex h-7 w-7 items-center justify-center border-2 border-primary bg-amber-100">
            <span className="material-symbols-outlined text-sm text-amber-800" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
              upload_file
            </span>
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
            <span className="material-symbols-outlined text-xs" aria-hidden="true">
              close
            </span>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
