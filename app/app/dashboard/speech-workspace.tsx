"use client";

import { type MouseEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import { clearDashboardCache } from "@/app/app/dashboard/dashboard-data-cache";
import { useDashboardUser } from "@/app/app/dashboard/dashboard-user-context";
import { VoxLoader } from "@/app/components/vox-loader";
import { Portal } from "@/app/components/portal";

import { MAX_TEXT_CHARS } from "@/lib/usage-policy";
import {
  DASHBOARD_TTS_VOICE_PRESETS,
  DEFAULT_CLONE_VOICE_INSTRUCTION,
} from "@/lib/voice-defaults";
import {
  STANDARD_CLONE_CREDITS_PER_SECOND,
  TTS_CREDITS_PER_SECOND,
} from "@/lib/credit-rates";

type SpeechWorkspaceProps = {
  mode: "tts" | "clone";
  title: string;
  actionLabel: string;
  onNavigate?: (href: string) => void;
};

type GenerationResponse = {
  generationId: string;
  audioBase64: string;
  contentType: string;
  creditsRequested: number;
  creditsCharged: number;
  remainingTokens: number;
  outputSeconds: number;
  latencyMs: number;
  model: string;
  upstreamRequestId: string | null;
};

type GenerationErrorResponse = {
  error?: string;
  code?: string;
  remainingTokens?: number;
};

type WorkspaceSnapshot = {
  text: string;
  voice: string;
  model: string;
  runMode: string;
  sampleFile: File | null;
  voiceConsent: boolean;
  result: GenerationResponse | null;
  audioUrl: string;
  error: string;
  busy: boolean;
  updatedAtLabel: string;
  showInstructions: boolean;
};

function createWorkspaceSnapshot(mode: "tts" | "clone"): WorkspaceSnapshot {
  return {
    text: "",
    voice: mode === "clone" ? DEFAULT_CLONE_VOICE_INSTRUCTION : DASHBOARD_TTS_VOICE_PRESETS[0],
    model: "voxcpm2",
    runMode: "RunSync",
    sampleFile: null,
    voiceConsent: false,
    result: null,
    audioUrl: "",
    error: "",
    busy: false,
    updatedAtLabel: "--:--:--",
    showInstructions: false,
  };
}

const workspaceSnapshots: Record<"tts" | "clone", WorkspaceSnapshot> = {
  tts: createWorkspaceSnapshot("tts"),
  clone: createWorkspaceSnapshot("clone"),
};

const workspaceListeners: Record<"tts" | "clone", Set<() => void>> = {
  tts: new Set(),
  clone: new Set(),
};

function commitWorkspaceSnapshot(mode: "tts" | "clone", patch: Partial<WorkspaceSnapshot>) {
  workspaceSnapshots[mode] = { ...workspaceSnapshots[mode], ...patch };
  for (const listener of workspaceListeners[mode]) {
    listener();
  }
}

function subscribeWorkspaceSnapshot(mode: "tts" | "clone", listener: () => void): () => void {
  workspaceListeners[mode].add(listener);
  return () => {
    workspaceListeners[mode].delete(listener);
  };
}

export function SpeechWorkspace({ mode, title, onNavigate }: SpeechWorkspaceProps) {
  const isCloneMode = mode === "clone";
  const dashboardUser = useDashboardUser();
  const snapshot = workspaceSnapshots[mode];
  const [text, setText] = useState(snapshot.text);
  const [voice, setVoice] = useState(() => {
    if (mode === "tts" && !DASHBOARD_TTS_VOICE_PRESETS.includes(snapshot.voice)) {
      return DASHBOARD_TTS_VOICE_PRESETS[0];
    }
    return snapshot.voice;
  });
  const [model, setModel] = useState(snapshot.model);
  const [runMode, setRunMode] = useState(snapshot.runMode);
  const [sampleFile, setSampleFile] = useState<File | null>(snapshot.sampleFile);
  const [voiceConsent, setVoiceConsent] = useState(snapshot.voiceConsent);
  const [result, setResult] = useState<GenerationResponse | null>(snapshot.result);
  const [audioUrl, setAudioUrl] = useState(snapshot.audioUrl);
  const [error, setError] = useState(snapshot.error);
  const [busy, setBusy] = useState(snapshot.busy);
  const [updatedAtLabel, setUpdatedAtLabel] = useState(snapshot.updatedAtLabel);
  const [showInstructions, setShowInstructions] = useState(snapshot.showInstructions);

  const [savedVoices, setSavedVoices] = useState<Array<{
    id: string;
    name: string;
    description: string | null;
    fileName: string;
    mimeType: string;
    fileSize: number;
    createdAt: string;
  }>>([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [newVoiceName, setNewVoiceName] = useState("");
  const [newVoiceDesc, setNewVoiceDesc] = useState("");
  const [newVoiceFile, setNewVoiceFile] = useState<File | null>(null);
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [saveVoiceError, setSaveVoiceError] = useState("");

  async function fetchSavedVoices() {
    try {
      const res = await fetch("/api/dashboard/voices");
      const data = await res.json();
      if (res.ok && data.ok) {
        setSavedVoices(data.voices);
      }
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    if (!isCloneMode) return;
    const timer = setTimeout(() => {
      void fetchSavedVoices();
    }, 0);
    return () => clearTimeout(timer);
  }, [isCloneMode]);

  const standardSeconds = useMemo(() => estimateSeconds(text.length, 20, 1), [text.length]);
  const cloneSeconds = useMemo(() => estimateSeconds(text.length, 13, 2), [text.length]);

  const isCustomVoiceSelected = !DASHBOARD_TTS_VOICE_PRESETS.includes(voice) && voice !== DEFAULT_CLONE_VOICE_INSTRUCTION;
  const usingSavedVoice = isCustomVoiceSelected;

  const activeRate = (isCloneMode || isCustomVoiceSelected) ? STANDARD_CLONE_CREDITS_PER_SECOND : TTS_CREDITS_PER_SECOND;
  const activeSeconds = (isCloneMode || isCustomVoiceSelected) ? cloneSeconds : standardSeconds;
  const activeCredits = activeSeconds * activeRate;

  const canGenerate =
    text.trim().length > 0 &&
    text.length <= MAX_TEXT_CHARS &&
    (!isCloneMode || usingSavedVoice || (sampleFile !== null && voiceConsent));
  const historyHref = `/app/dashboard/history?mode=${isCloneMode ? "clone" : "tts"}`;
  const generateBlocker = getGenerateBlocker({
    text,
    isCloneMode,
    usingSavedVoice,
    sampleFile,
    voiceConsent,
    maxChars: MAX_TEXT_CHARS,
  });
  const updatedLabel = updatedAtLabel === "--:--:--" ? "Not generated yet" : `Updated ${updatedAtLabel}`;

  useEffect(() => {
    return subscribeWorkspaceSnapshot(mode, () => {
      const next = workspaceSnapshots[mode];
      setText(next.text);
      let nextVoice = next.voice;
      if (mode === "tts" && !DASHBOARD_TTS_VOICE_PRESETS.includes(nextVoice)) {
        nextVoice = DASHBOARD_TTS_VOICE_PRESETS[0];
      }
      setVoice(nextVoice);
      setModel(next.model);
      setRunMode(next.runMode);
      setSampleFile(next.sampleFile);
      setVoiceConsent(next.voiceConsent);
      setResult(next.result);
      setAudioUrl(next.audioUrl);
      setError(next.error);
      setBusy(next.busy);
      setUpdatedAtLabel(next.updatedAtLabel);
      setShowInstructions(next.showInstructions);
    });
  }, [mode]);

  useEffect(() => {
    workspaceSnapshots[mode] = {
      text,
      voice,
      model,
      runMode,
      sampleFile,
      voiceConsent,
      result,
      audioUrl,
      error,
      busy,
      updatedAtLabel,
      showInstructions,
    };
  }, [
    mode,
    text,
    voice,
    model,
    runMode,
    sampleFile,
    voiceConsent,
    result,
    audioUrl,
    error,
    busy,
    updatedAtLabel,
    showInstructions,
  ]);

  async function onGenerate() {
    if (!canGenerate) return;

    commitWorkspaceSnapshot(mode, {
      busy: true,
      error: "",
      result: null,
      audioUrl: "",
    });

    try {
      let response: Response;

      if (isCloneMode) {
        const formData = new FormData();
        formData.set("text", text);
        formData.set("voice", voice);
        formData.set("model", model);
        if (!usingSavedVoice) {
          if (!sampleFile) {
            commitWorkspaceSnapshot(mode, {
              busy: false,
              error: "Please upload a voice sample file.",
            });
            return;
          }
          formData.set("sample", sampleFile);
          formData.set("voice_consent", voiceConsent ? "true" : "false");
        }
        response = await fetch("/api/generate-clone", {
          method: "POST",
          body: formData,
        });
      } else {
        response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            voice: voice.trim() || DASHBOARD_TTS_VOICE_PRESETS[0],
            model,
          }),
        });
      }

      const data = (await response.json()) as Record<string, unknown> & {
        queued?: boolean;
        jobId?: string;
        remainingTokens?: number;
      };

      if (!response.ok) {
        const reason = data && typeof data.error === "string"
          ? data.error
          : "Generation request failed.";
        commitWorkspaceSnapshot(mode, {
          busy: false,
          error: reason,
        });
        return;
      }

      if (data.queued && data.jobId) {
        const jobId = data.jobId;
        let completed = false;
        let attempts = 0;
        const maxAttempts = 150; // 5 minutes

        while (!completed && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          try {
            const pollRes = await fetch(`/api/batch/jobs/${jobId}`, { cache: "no-store" });
            if (!pollRes.ok) {
              throw new Error("Failed to poll background job status.");
            }
            const pollData = await pollRes.json();
            const job = pollData.job;

            if (job.status === "completed") {
              completed = true;
              const mergedRes = await fetch(`/api/batch/jobs/${jobId}/merged`);
              if (!mergedRes.ok) {
                const errBody = await mergedRes.json().catch(() => ({}));
                throw new Error(errBody.error || "Failed to retrieve merged audio.");
              }
              const mergedData = await mergedRes.json();
              const url = `data:${mergedData.contentType};base64,${mergedData.audioBase64}`;
              commitWorkspaceSnapshot(mode, {
                busy: false,
                error: "",
                result: mergedData,
                audioUrl: url,
                updatedAtLabel: new Date().toLocaleTimeString(),
              });
              dashboardUser.setTokenBalance(mergedData.remainingTokens);
              clearDashboardCache("dashboard:history");
              clearDashboardCache("dashboard:api");
              clearDashboardCache("dashboard:billing");
              break;
            } else if (job.status === "failed" || job.status === "needs_review") {
              throw new Error(job.errorMessage || "Background generation failed.");
            } else {
              const progressMsg = `Generating: Segment ${job.completedItems} of ${job.totalItems} completed...`;
              commitWorkspaceSnapshot(mode, {
                error: progressMsg,
              });
            }
          } catch (pollErr: unknown) {
            const err = pollErr as Error;
            commitWorkspaceSnapshot(mode, {
              busy: false,
              error: err.message || "Failed during background generation polling.",
            });
            return;
          }
          attempts++;
        }

        if (!completed) {
          commitWorkspaceSnapshot(mode, {
            busy: false,
            error: "Generation processing timed out. Please check the Batch Jobs or History tab.",
          });
        }
        return;
      }

      const success = data as GenerationResponse;
      const url = `data:${success.contentType};base64,${success.audioBase64}`;
      commitWorkspaceSnapshot(mode, {
        busy: false,
        error: "",
        result: success,
        audioUrl: url,
        updatedAtLabel: new Date().toLocaleTimeString(),
      });
      dashboardUser.setTokenBalance(success.remainingTokens);
      clearDashboardCache("dashboard:history");
      clearDashboardCache("dashboard:api");
      clearDashboardCache("dashboard:billing");
    } catch {
      commitWorkspaceSnapshot(mode, {
        busy: false,
        error: "Network error while generating speech.",
      });
    }
  }

  async function handleSaveVoice(e: React.FormEvent) {
    e.preventDefault();
    if (!newVoiceName.trim() || !newVoiceFile) return;
    setIsSavingVoice(true);
    setSaveVoiceError("");
    try {
      const fd = new FormData();
      fd.set("name", newVoiceName);
      fd.set("description", newVoiceDesc);
      fd.set("sample", newVoiceFile);
      const res = await fetch("/api/dashboard/voices", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveVoiceError(data.error || "Failed to save voice.");
        return;
      }
      setNewVoiceName("");
      setNewVoiceDesc("");
      setNewVoiceFile(null);
      await fetchSavedVoices();
    } catch {
      setSaveVoiceError("Network error.");
    } finally {
      setIsSavingVoice(false);
    }
  }

  async function handleDeleteVoice(id: string) {
    if (!confirm("Are you sure you want to delete this voice?")) return;
    try {
      const res = await fetch(`/api/dashboard/voices?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchSavedVoices();
        if (voice === id) {
          setVoice(isCloneMode ? DEFAULT_CLONE_VOICE_INSTRUCTION : DASHBOARD_TTS_VOICE_PRESETS[0]);
        }
      } else {
        alert("Failed to delete voice.");
      }
    } catch {
      alert("Network error.");
    }
  }

  function navigateToHref(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!onNavigate || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    onNavigate(href);
  }

  async function pasteFromClipboard() {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText.trim()) {
        setText(clipboardText);
        setError("");
      }
    } catch {
      setError("Clipboard permission was blocked. Paste the text manually into the text box.");
    }
  }

  function addSampleText() {
    setText(
      isCloneMode
        ? "សួស្តី នេះគឺជាការសាកល្បងសំឡេងក្លូនសម្រាប់ប្រព័ន្ធ Khmer Vox TTS។"
        : "សួស្តី នេះគឺជាការសាកល្បងបង្កើតសំឡេងខ្មែរជា MP3។",
    );
    setError("");
  }

  return (
    <section className="dashboard-enter grid w-full min-w-0 gap-5 pb-4 text-[#1a1a1a]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <nav className="flex items-center gap-2 text-xs font-headline uppercase font-bold text-[#4a4a4a]">
            <span>Dashboard</span>
            <span className="text-primary">/</span>
            <span className="text-primary">{title}</span>
          </nav>
          <h1 className="mt-4 font-headline font-black text-3xl md:text-4xl uppercase tracking-tight text-primary">{title}</h1>
          <p className="mt-1 font-body text-sm text-[#4a4a4a] border-l-4 border-primary pl-3">
            {isCloneMode
              ? "Upload a reference voice and generate speech that matches it."
              : "Convert Khmer text to natural speech using our AI voices."}
          </p>
        </div>
        <a
          href={historyHref}
          onClick={(event) => navigateToHref(event, historyHref)}
          className="inline-flex items-center gap-2 border-4 border-primary bg-white px-4 py-2.5 text-xs font-headline uppercase font-black text-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
        >
          <ClockIcon />
          History
        </a>
      </div>

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <article className="min-w-0 border-4 border-primary bg-surface-bright p-5 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
          <ModeTabs activeMode={mode} onNavigate={onNavigate} />

          {isCloneMode ? (
            usingSavedVoice ? (
              <div className="mt-5 border-4 border-primary bg-[#def3e5] p-4 text-xs font-headline font-bold uppercase shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                <div className="flex items-center justify-between border-b-2 border-primary pb-2 mb-3">
                  <p className="font-black text-[#07875f] flex items-center gap-1">
                    <MiniWaveIcon />
                    Using Saved Voice
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setVoice(DEFAULT_CLONE_VOICE_INSTRUCTION);
                      setSampleFile(null);
                    }}
                    className="text-xs text-[#e63b2e] hover:underline font-black cursor-pointer"
                  >
                    Use different voice
                  </button>
                </div>
                <div className="grid gap-3 font-headline uppercase text-xs text-[#1a1a1a] sm:grid-cols-2">
                  <div>
                    <span className="block font-black text-[#4a4a4a] text-[10px]">Voice Name</span>
                    <span className="font-body normal-case font-medium">{savedVoices.find((v) => v.id === voice)?.name || "Saved voice"}</span>
                  </div>
                  {savedVoices.find((v) => v.id === voice)?.description && (
                    <div>
                      <span className="block font-black text-[#4a4a4a] text-[10px]">Description</span>
                      <span className="truncate block font-body normal-case font-medium">{savedVoices.find((v) => v.id === voice)?.description}</span>
                    </div>
                  )}
                  <div>
                    <span className="block font-black text-[#4a4a4a] text-[10px]">File Name</span>
                    <span className="truncate block font-body normal-case font-medium">{savedVoices.find((v) => v.id === voice)?.fileName}</span>
                  </div>
                  <div>
                    <span className="block font-black text-[#4a4a4a] text-[10px]">Format</span>
                    <span className="uppercase font-body normal-case font-medium">{savedVoices.find((v) => v.id === voice)?.mimeType?.split("/")[1] || "audio"}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 grid gap-3">
                <label className="grid gap-2 text-sm font-headline font-black uppercase text-primary">
                  Reference voice
                  <span className="grid cursor-pointer place-items-center gap-2 border-4 border-dashed border-primary bg-white px-5 py-6 text-center hover:bg-[#eee9e0] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(event) => {
                        setSampleFile(event.target.files?.[0] ?? null);
                        setError("");
                      }}
                    />
                    <span className="flex h-9 w-9 items-center justify-center border-2 border-primary bg-[#ffcc00] text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                      <UploadIcon />
                    </span>
                    <span className="grid gap-1 mt-1">
                      <span className="font-headline font-black text-sm text-primary">
                        {sampleFile ? sampleFile.name : "Upload reference audio"}
                      </span>
                      <span className="text-[10px] font-bold text-[#4a4a4a]">MP3, WAV - 5-30 seconds recommended</span>
                    </span>
                  </span>
                </label>
                <label
                  className={`flex items-center gap-3 border-4 border-primary px-4 py-3 text-xs font-headline uppercase font-black cursor-pointer shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] ${
                    voiceConsent
                      ? "bg-[#def3e5] text-primary"
                      : "bg-white text-primary"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={voiceConsent}
                    onChange={(event) => {
                      setVoiceConsent(event.target.checked);
                      setError("");
                    }}
                  />
                  <span>I own this voice or have permission from the owner.</span>
                </label>
              </div>
            )
          ) : null}

          <div className="mt-5 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_170px] lg:items-start 2xl:grid-cols-[minmax(0,1fr)_180px]">
            <div className="grid min-w-0 gap-2">
              <div className="flex items-center justify-between text-xs font-headline uppercase font-black text-primary">
                <span>{isCloneMode ? "Voice source" : "Voice style"}</span>
                {isCloneMode ? (
                  <button
                    type="button"
                    onClick={() => setIsLibraryOpen(true)}
                    className="inline-flex items-center gap-1.5 border-2 border-primary bg-[#ffcc00] px-2.5 py-1 text-[10px] font-black text-primary shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] active:shadow-none hover:bg-[#e6b800] transition-colors cursor-pointer"
                  >
                    <LibraryIcon />
                    Manage Library
                  </button>
                ) : null}
              </div>
              <select
                value={voice}
                onChange={(event) => {
                  setVoice(event.target.value);
                  setError("");
                }}
                className="h-11 w-full border-4 border-primary bg-white px-4 text-xs font-headline font-bold uppercase text-primary outline-none focus:bg-[#faf7f2] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] cursor-pointer"
              >
                {isCloneMode ? (
                  <>
                    <option value={DEFAULT_CLONE_VOICE_INSTRUCTION}>Upload new reference file</option>
                    {savedVoices.length > 0 && (
                      <optgroup label="Saved Voices">
                        {savedVoices.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </>
                ) : (
                  <>
                    <optgroup label="Preset Voices">
                      {DASHBOARD_TTS_VOICE_PRESETS.map((item) => (
                        <option key={item} value={item}>
                          {item === "female" ? "Female (Sokha) (1.5 tokens/sec)" : "Male (Piseth) (1.5 tokens/sec)"}
                        </option>
                      ))}
                    </optgroup>
                  </>
                )}
              </select>

              {/* Dynamic Active Voice Info Card */}
              {(() => {
                const isFemale = voice === "female";
                const isMale = voice === "male";
                const isTempClone = voice === DEFAULT_CLONE_VOICE_INSTRUCTION;

                let name = "";
                let type = "";
                let description = "";
                let costRate = "";
                let icon = "";
                let iconBg = "";

                if (isFemale) {
                  name = "Sokha (Female)";
                  type = "Standard Preset Voice style";
                  description = "A natural, clear, and professional Khmer female voice. Excellent for audiobooks, education, news, and virtual assistants.";
                  costRate = "1.5 tokens per generated second";
                  icon = "face_3";
                  iconBg = "bg-tertiary";
                } else if (isMale) {
                  name = "Piseth (Male)";
                  type = "Standard Preset Voice style";
                  description = "An energetic, clear, and engaging Khmer male voice. Perfect for video recaps, social media, ads, and narrations.";
                  costRate = "1.5 tokens per generated second";
                  icon = "face";
                  iconBg = "bg-primary";
                } else if (isTempClone) {
                  name = "Temporary Clone";
                  type = "Session Voice Cloning";
                  description = "Uses the uploaded reference audio to mirror the speaker. Reference file is deleted immediately after processing.";
                  costRate = "2.0 tokens per generated second";
                  icon = "upload_file";
                  iconBg = "bg-[#ffcc00] text-primary";
                } else {
                  // Custom saved voice
                  const saved = savedVoices.find((v) => v.id === voice);
                  name = saved ? saved.name : "Saved custom voice";
                  type = "Library Saved Clone";
                  description = saved?.description || "Uses a saved cloned voice profile from your voice library catalog.";
                  costRate = "2.0 tokens per generated second";
                  icon = "settings_voice";
                  iconBg = "bg-accent";
                }

                return (
                  <div className="mt-2.5 flex items-start gap-3 border-4 border-primary bg-[#fcfbf9] p-3.5 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] w-full text-[#1a1a1a]">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center border-2 border-primary ${iconBg} text-white`}>
                      <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {icon}
                      </span>
                    </div>
                    <div className="grid gap-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-headline text-xs font-black uppercase text-primary tracking-tight">
                          {name}
                        </span>
                        <span className="font-body text-[9px] font-bold text-gray-500 uppercase">
                          ({type})
                        </span>
                      </div>
                      <p className="font-body text-xs text-gray-700 leading-normal">
                        {description}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="inline-block h-2 w-2 rounded-full bg-green-600"></span>
                        <span className="font-headline text-[9px] font-bold uppercase text-primary">
                          Cost Rate: {costRate}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            <label className="grid min-w-0 gap-2 self-start text-xs font-headline uppercase font-black text-primary">
              Model
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className="h-11 w-full border-4 border-primary bg-white px-4 text-xs font-headline font-bold uppercase text-primary outline-none focus:bg-[#faf7f2] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
              />
            </label>
          </div>

          {showInstructions ? (
            <div className="mt-4 border-4 border-primary bg-[#f5f0e8] p-4 text-xs font-headline font-bold uppercase leading-relaxed text-[#4a4a4a]">
              {isCloneMode
                ? "Clone voice uses a reference sample as the voice source. Use only audio you own or have permission to use."
                : "Standard speech is best for quick tests. For business systems that need the same voice every time, use Voice Cloning with reference audio."}
            </div>
          ) : null}

          <label className="mt-4 block">
            <span className="sr-only">Text input</span>
            <div className="relative">
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={MAX_TEXT_CHARS}
                placeholder="Paste Khmer text..."
                className={`smooth-scroll-region w-full resize-y border-4 border-primary bg-white p-5 text-base leading-7 text-primary outline-none transition focus:bg-[#faf7f2] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] ${
                  isCloneMode ? "min-h-[190px] xl:min-h-[210px]" : "min-h-[250px] xl:min-h-[280px]"
                }`}
              />
              <span className="absolute bottom-4 right-5 border-2 border-primary bg-[#ffcc00] px-2 py-0.5 text-xs font-headline font-black uppercase text-primary shadow-[1px_1px_0px_0px_rgba(26,26,26,1)]">
                {text.length.toLocaleString()} / {MAX_TEXT_CHARS.toLocaleString()}
              </span>
            </div>
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <ToolButton onClick={() => setText("")}>Clear</ToolButton>
            <ToolButton onClick={() => void pasteFromClipboard()}>Paste</ToolButton>
            <ToolButton onClick={addSampleText}>Sample text</ToolButton>
            <button
              type="button"
              aria-pressed={showInstructions}
              onClick={() => setShowInstructions((current) => !current)}
              className="inline-flex h-10 items-center justify-center border-4 border-primary bg-white px-4 text-xs font-headline uppercase font-black text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            >
              Advanced
            </button>
          </div>

          <div className="mt-4 border-t-4 border-primary pt-4">
            <div className="grid min-w-0 items-end gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <div className="flex items-center gap-2 text-xs font-headline uppercase font-black text-primary mb-2">
                  Cost estimate
                  <InfoIcon />
                </div>
                <div className="grid min-w-0 max-w-2xl grid-cols-3 border-4 border-primary bg-[#eee9e0] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                  <CostCell label="Duration" value={`~${formatDuration(activeSeconds)}`} />
                  <CostCell label="Tokens" value={activeCredits.toLocaleString()} />
                  <CostCell label="Output" value="MP3" />
                </div>
              </div>
              <button
                type="button"
                onClick={onGenerate}
                disabled={!canGenerate || busy}
                aria-busy={busy}
                className="inline-flex h-12 min-w-[180px] items-center justify-center gap-3 border-4 border-primary bg-[#10b981] px-5 text-sm font-headline uppercase font-black text-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#059669] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all disabled:cursor-not-allowed disabled:bg-[#8a8d93] disabled:text-white disabled:shadow-none cursor-pointer"
              >
                <MiniWaveIcon tone="light" />
                {busy ? "Generating..." : generateBlocker ?? "Generate MP3"}
              </button>
            </div>
          </div>
        </article>

        <AudioResultPanel
          isCloneMode={isCloneMode}
          usingSavedVoice={usingSavedVoice}
          sampleFile={sampleFile}
          voiceConsent={voiceConsent}
          text={text}
          busy={busy}
          error={error}
          result={result}
          audioUrl={audioUrl}
          mode={mode}
          updatedLabel={updatedLabel}
        />
      </div>

      {isCloneMode && isLibraryOpen && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-[#1a1a1a]">
          <div className="bg-[#f5f0e8] border-4 border-primary max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-[8px_8px_0px_0px_rgba(26,26,26,1)]">
            <div className="p-6 border-b-4 border-primary flex items-start justify-between bg-primary-fixed">
              <div>
                <h3 className="font-headline font-black text-xl uppercase tracking-tight text-primary">Saved Voice Library</h3>
                <p className="mt-1 font-body text-xs font-bold uppercase text-[#4a4a4a]">
                  Upload reference samples in MP3 or WAV (up to 8MB) to save them. Saved voices cost 2 tokens/second.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsLibraryOpen(false);
                  setSaveVoiceError("");
                }}
                className="border-2 border-primary p-1 bg-white hover:bg-[#ffb3ab] shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] active:shadow-none transition-all cursor-pointer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Add New Voice Form */}
              <form onSubmit={handleSaveVoice} className="bg-white border-4 border-primary p-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] space-y-4">
                <h4 className="font-headline font-black text-sm uppercase text-primary border-b-2 border-[#eee9e0] pb-2">Save a New Voice</h4>
                {saveVoiceError && (
                  <p className="text-xs font-bold text-red-600 bg-red-50 p-2 border-2 border-red-200">
                    {saveVoiceError}
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <label className="text-xs font-headline uppercase font-black text-[#4a4a4a]">Voice Name *</label>
                    <input
                      type="text"
                      required
                      value={newVoiceName}
                      onChange={(e) => setNewVoiceName(e.target.value)}
                      placeholder="e.g. Sokha Natural, Piseth energetic"
                      className="h-10 px-3 border-2 border-primary bg-white text-sm font-medium focus:bg-[#faf7f2] outline-none text-[#1a1a1a]"
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className="text-xs font-headline uppercase font-black text-[#4a4a4a]">Description (optional)</label>
                    <input
                      type="text"
                      value={newVoiceDesc}
                      onChange={(e) => setNewVoiceDesc(e.target.value)}
                      placeholder="e.g. Good for news reading"
                      className="h-10 px-3 border-2 border-primary bg-white text-sm font-medium focus:bg-[#faf7f2] outline-none text-[#1a1a1a]"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className="text-xs font-headline uppercase font-black text-[#4a4a4a]">Reference Audio * (MP3 or WAV, max 8MB)</label>
                  <label className="flex flex-col items-center justify-center border-4 border-dashed border-primary p-4 bg-[#fcfbf9] hover:bg-[#eee9e0] cursor-pointer transition">
                    <input
                      type="file"
                      required
                      accept="audio/wav,audio/x-wav,audio/mpeg,audio/mp3"
                      onChange={(e) => setNewVoiceFile(e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                    <svg className="h-6 w-6 text-primary mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-xs font-headline font-black uppercase text-primary max-w-[200px] truncate text-center">
                      {newVoiceFile ? newVoiceFile.name : "Select MP3 or WAV file"}
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isSavingVoice || !newVoiceName.trim() || !newVoiceFile}
                  className="w-full h-10 border-4 border-primary bg-[#10b981] hover:bg-[#059669] disabled:bg-[#8a8d93] text-white text-sm font-headline uppercase font-black transition shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:shadow-none active:translate-y-0.5 cursor-pointer"
                >
                  {isSavingVoice ? "Saving voice..." : "Save to Library"}
                </button>
              </form>

              {/* Saved Voices List */}
              <div className="space-y-3">
                <h4 className="font-headline font-black text-sm uppercase text-primary">Saved Voices ({savedVoices.length})</h4>
                {savedVoices.length === 0 ? (
                  <p className="text-xs font-bold text-[#4a4a4a] py-6 text-center border-4 border-dashed border-primary bg-[#eee9e0]/30">
                    No custom voices saved yet.
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {savedVoices.map((v) => (
                      <div key={v.id} className="p-3 border-4 border-primary bg-white flex flex-col justify-between space-y-3 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]">
                        <div>
                          <div className="flex items-start justify-between gap-2 border-b-2 border-[#eee9e0] pb-2">
                            <h5 className="font-headline font-black text-sm text-primary truncate">{v.name}</h5>
                            <span className="shrink-0 px-2 py-0.5 border border-primary text-[9px] font-headline font-black bg-primary-fixed text-primary uppercase">
                              {v.mimeType?.split("/")[1] || "audio"}
                            </span>
                          </div>
                          {v.description && (
                            <p className="text-xs text-[#4a4a4a] mt-2 font-body font-medium">{v.description}</p>
                          )}
                          <p className="text-[9px] text-[#4a4a4a] mt-2 truncate font-mono">File: {v.fileName}</p>
                        </div>
                        <div className="flex items-center justify-between border-t-2 border-[#eee9e0] pt-2 text-[10px] font-headline font-bold uppercase text-[#4a4a4a]">
                          <span>{(v.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteVoice(v.id)}
                            className="border-2 border-primary bg-[#ffb3ab] text-primary hover:bg-[#e63b2e] hover:text-white px-2 py-1 text-[9px] font-black uppercase flex items-center gap-1 shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] active:shadow-none transition cursor-pointer"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t-4 border-primary bg-[#eee9e0] flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsLibraryOpen(false);
                  setSaveVoiceError("");
                }}
                className="px-4 py-2 border-4 border-primary rounded-none text-xs font-headline uppercase font-black hover:bg-[#eee9e0] transition bg-white text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-y-0.5 active:shadow-none cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </section>
  );
}

function estimateSeconds(charCount: number, charsPerSecond: number, minSeconds: number): number {
  if (charCount <= 0) return minSeconds;
  return Math.max(minSeconds, Math.ceil(charCount / charsPerSecond));
}

function ModeTabs({
  activeMode,
  onNavigate,
}: {
  activeMode: "tts" | "clone";
  onNavigate?: (href: string) => void;
}) {
  function onClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!onNavigate || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    onNavigate(href);
  }

  return (
    <div className="inline-flex border-4 border-primary bg-[#eee9e0] p-1 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] mb-4">
      <a
        href="/app/dashboard"
        onClick={(event) => onClick(event, "/app/dashboard")}
        className={`inline-flex h-11 items-center gap-2 border-2 px-5 text-sm font-headline uppercase font-black transition-all ${
          activeMode === "tts"
            ? "bg-[#ffcc00] border-primary text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] translate-y-[-2px] translate-x-[-2px]"
            : "border-transparent text-[#4a4a4a] hover:bg-white/40"
        }`}
      >
        <MiniWaveIcon />
        Standard TTS
      </a>
      <a
        href="/app/dashboard/voice-cloning"
        onClick={(event) => onClick(event, "/app/dashboard/voice-cloning")}
        className={`inline-flex h-11 items-center gap-2 border-2 px-5 text-sm font-headline uppercase font-black transition-all ${
          activeMode === "clone"
            ? "bg-[#ffcc00] border-primary text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] translate-y-[-2px] translate-x-[-2px]"
            : "border-transparent text-[#4a4a4a] hover:bg-white/40"
        }`}
      >
        <MiniWaveIcon />
        Clone Voice
      </a>
    </div>
  );
}

function AudioResultPanel({
  isCloneMode,
  usingSavedVoice,
  sampleFile,
  voiceConsent,
  text,
  busy,
  error,
  result,
  audioUrl,
  mode,
  updatedLabel,
}: {
  isCloneMode: boolean;
  usingSavedVoice: boolean;
  sampleFile: File | null;
  voiceConsent: boolean;
  text: string;
  busy: boolean;
  error: string;
  result: GenerationResponse | null;
  audioUrl: string;
  mode: "tts" | "clone";
  updatedLabel: string;
}) {
  return (
    <aside className="border-4 border-primary bg-surface-bright p-5 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] grid gap-5">
      <div className="flex items-center justify-between gap-3 border-b-4 border-primary pb-2">
        <h2 className="font-headline font-black text-lg uppercase tracking-tight text-primary">Audio result</h2>
        <span className="text-primary font-black">
          <ChevronUpIcon />
        </span>
      </div>

      <div
        className={`border-4 border-primary p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] ${
          error
            ? "bg-[#ffdad6]"
            : result
              ? "bg-[#def3e5]"
              : "bg-white"
        }`}
      >
        {busy ? (
          <div className="grid place-items-center gap-3 py-8 text-center">
            <VoxLoader variant="compact" label="" />
            <p className="font-headline font-black uppercase text-sm text-primary">Generating audio...</p>
            {error && error.startsWith("Generating:") ? (
              <p className="text-xs font-body font-semibold text-[#4a4a4a] bg-[#fbf9f4] border-2 border-primary/20 px-3 py-1.5 mt-1 rounded-sm shadow-[1px_1px_0px_0px_rgba(26,26,26,0.15)]">
                {error}
              </p>
            ) : (
              <p className="text-xs font-headline font-bold uppercase text-[#4a4a4a]">Your MP3 preview will appear here.</p>
            )}
          </div>
        ) : error ? (
          <div className="grid gap-2 text-xs font-headline font-bold uppercase text-red-700">
            <p className="font-black text-sm">Needs attention</p>
            <p className="leading-relaxed font-body normal-case font-medium">{error}</p>
          </div>
        ) : result && audioUrl ? (
          <div className="grid gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center border-2 border-primary bg-[#ffcc00] text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                <MiniWaveIcon />
              </span>
              <div>
                <p className="font-headline font-black text-sm uppercase text-primary">Ready</p>
                <p className="text-[10px] font-headline font-bold uppercase text-primary">{updatedLabel}</p>
              </div>
            </div>
            <audio controls src={audioUrl} className="w-full border-2 border-primary" />
            <a
              href={audioUrl}
              download={`voxtts-${mode}-${result.generationId}.${extensionFor(result.contentType)}`}
              className="inline-flex h-11 items-center justify-center border-4 border-primary bg-white text-xs font-headline uppercase font-black text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            >
              Download audio
            </a>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <ResultStat label="Credits" value={result.creditsCharged.toLocaleString()} />
              <ResultStat label="Remaining" value={result.remainingTokens.toLocaleString()} />
              <ResultStat label="Duration" value={`${result.outputSeconds}s`} />
              <ResultStat label="Model" value={result.model} />
            </div>
          </div>
        ) : (
          <div className="grid place-items-center gap-4 py-12 text-center text-primary">
            <span className="flex h-16 w-16 items-center justify-center border-4 border-primary bg-[#eee9e0] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
              <SpeakerIcon />
            </span>
            <div>
              <p className="font-headline font-black text-sm uppercase">No audio yet</p>
              <p className="mt-1 text-xs font-headline font-bold uppercase text-[#4a4a4a]">Your generated speech will appear here.</p>
            </div>
          </div>
        )}
      </div>

      {isCloneMode ? (
        <div className="border-t-4 border-primary pt-4">
          <p className="text-xs font-headline font-black uppercase text-primary mb-4">Status Checklist</p>
          <div className="grid gap-4">
            <StatusStep done={usingSavedVoice || sampleFile !== null} label="Reference audio" value={usingSavedVoice ? "Saved voice selected" : (sampleFile ? "Uploaded" : "Not uploaded")} />
            <StatusStep done={usingSavedVoice || voiceConsent} label="Permission" value={usingSavedVoice ? "Confirmed (saved)" : (voiceConsent ? "Confirmed" : "Pending")} />
            <StatusStep done={text.trim().length > 0} label="Text input" value={text.trim() ? "Ready" : "Waiting"} />
            <StatusStep done={Boolean(result)} label="Audio ready" value={result ? "Ready" : "Waiting"} />
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function ToolButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center border-4 border-primary bg-white px-4 text-xs font-headline uppercase font-black text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
    >
      {children}
    </button>
  );
}

function CostCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 first:pl-0 border-r-2 border-primary last:border-r-0">
      <p className="text-[10px] font-headline font-black uppercase text-[#4a4a4a]">{label}</p>
      <p className="mt-1 text-xl font-headline font-black tracking-tight text-primary">{value}</p>
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <p className="border-2 border-primary bg-[#eee9e0] p-2 text-xs font-headline font-bold uppercase">
      <span className="block text-[9px] opacity-75">{label}</span>
      <span className="font-black text-primary">{value}</span>
    </p>
  );
}

function StatusStep({ done, label, value }: { done: boolean; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-7 w-7 items-center justify-center border-2 border-primary text-xs font-black ${
          done ? "bg-[#10b981] text-white" : "bg-white text-primary"
        }`}
      >
        {done ? "✓" : "✗"}
      </span>
      <span className="font-headline font-bold uppercase text-xs">
        <span className="block text-[#1a1a1a] font-black">{label}</span>
        <span className="text-[#4a4a4a] text-[10px] font-normal font-body normal-case">{value}</span>
      </span>
    </div>
  );
}

function MiniWaveIcon({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const color = tone === "light" ? "currentColor" : "#1a1a1a";
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
      <path d="M4 8v4M7 5v10M10 7v6M13 4v12M16 8v4" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
      <path d="M10 13V5m0 0L7 8m3-3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12v2.5A1.5 1.5 0 0 0 6.5 16h7a1.5 1.5 0 0 0 1.5-1.5V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 text-primary" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M10 9.5V14M10 6.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
      <path d="m5 12 5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
      <path d="M2 5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="12" r="1.5" stroke="currentColor" strokeWidth="2" />
      <path d="M9.5 10v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none">
      <path d="M4 10v4h4l5 4V6l-5 4H4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function getGenerateBlocker({
  text,
  isCloneMode,
  usingSavedVoice,
  sampleFile,
  voiceConsent,
  maxChars,
}: {
  text: string;
  isCloneMode: boolean;
  usingSavedVoice: boolean;
  sampleFile: File | null;
  voiceConsent: boolean;
  maxChars: number;
}): string | null {
  if (!text.trim()) return "Add text first";
  if (text.length > maxChars) return "Text is too long";
  if (isCloneMode && !usingSavedVoice && !sampleFile) return "Upload reference audio";
  if (isCloneMode && !usingSavedVoice && !voiceConsent) return "Confirm voice permission";
  return null;
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function extensionFor(contentType: string): string {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("webm")) return "webm";
  return "wav";
}
