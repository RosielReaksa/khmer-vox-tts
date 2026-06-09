"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { VoxLoader } from "@/app/components/vox-loader";
import type { BatchJobItemRecord, BatchJobRecord, GenerationMode } from "@/lib/types";
import {
  DASHBOARD_TTS_VOICE_PRESETS,
  DEFAULT_CLONE_VOICE_INSTRUCTION,
  DEFAULT_TTS_VOICE_PROMPT,
} from "@/lib/voice-defaults";
import {
  STANDARD_CLONE_CREDITS_PER_SECOND,
  TTS_CREDITS_PER_SECOND,
} from "@/lib/credit-rates";

type JobDetail = {
  job: BatchJobRecord;
  items: BatchJobItemRecord[];
};

type JobsResponse = {
  jobs: BatchJobRecord[];
};

type SavedVoiceSummary = {
  id: string;
  name: string;
  description: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
};

type VoicesResponse = {
  voices: SavedVoiceSummary[];
};

type BatchInputMode = "plain" | "dubbing_json";
type CloneVoiceSource = "upload" | "library";

type DashboardBatchLine = {
  text: string;
  external_id?: string | null;
  speaker?: string | null;
  start_ms?: number | null;
  end_ms?: number | null;
  metadata?: unknown;
};

const exampleDubbingJson = JSON.stringify(
  [
    {
      text: "line one for customer system",
      external_id: "line-001",
      speaker: "main",
      start_ms: 0,
      end_ms: 2400,
      metadata: { scene: 1, take: "A" },
    },
    {
      text: "line two keeps the same speaker",
      external_id: "line-002",
      speaker: "main",
      start_ms: 2600,
      end_ms: 5200,
      metadata: { scene: 1, take: "A" },
    },
  ],
  null,
  2,
);

const exampleLines = [
  "សួស្តី! នេះគឺជាការសាកល្បងសំឡេងខ្មែរ។",
  "អ្នកអាចបង្កើតសំឡេងច្រើនក្នុងពេលតែមួយបានយ៉ាងងាយស្រួល។",
  "សូមអរគុណសម្រាប់ការប្រើប្រាស់ Khmer Vox TTS។",
].join("\n");

export function BatchJobsPanel() {
  const [mode, setMode] = useState<GenerationMode>("tts");
  const [inputMode, setInputMode] = useState<BatchInputMode>("plain");
  const [title, setTitle] = useState("Khmer batch");
  const [voice, setVoice] = useState(DEFAULT_TTS_VOICE_PROMPT);
  const [model, setModel] = useState("voxcpm2");
  const [externalId, setExternalId] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [input, setInput] = useState(exampleLines);
  const [sample, setSample] = useState<File | null>(null);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [cloneVoiceSource, setCloneVoiceSource] = useState<CloneVoiceSource>("upload");
  const [savedVoices, setSavedVoices] = useState<SavedVoiceSummary[]>([]);
  const [selectedSavedVoiceId, setSelectedSavedVoiceId] = useState("");
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [jobs, setJobs] = useState<BatchJobRecord[]>([]);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detailLoadingJobId, setDetailLoadingJobId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detailRequestRef = useRef(0);

  const parsedInput = useMemo(() => parseBatchInput(input, inputMode), [input, inputMode]);
  const lines = parsedInput.lines;
  const estimate = useMemo(() => estimateLines(lines, mode), [lines, mode]);
  const selectedSavedVoice = savedVoices.find((item) => item.id === selectedSavedVoiceId) ?? null;
  const selectedJob = useMemo(() => {
    if (detail && detail.job.id === selectedJobId) return detail.job;
    return jobs.find((job) => job.id === selectedJobId) ?? null;
  }, [detail, jobs, selectedJobId]);
  const activeJobId = selectedJob?.id ?? null;
  const activeJobStatus = selectedJob?.status ?? null;
  const selectedDetailReady = Boolean(detail && detail.job.id === selectedJobId);
  const isDetailLoading = Boolean(selectedJobId && detailLoadingJobId === selectedJobId);
  const needsSavedVoice = mode === "clone" && cloneVoiceSource === "library" && !selectedSavedVoice;
  const needsCloneSample = mode === "clone" && cloneVoiceSource === "upload" && !sample;
  const needsCloneConsent = mode === "clone" && cloneVoiceSource === "upload" && !voiceConsent;
  const consentError = Boolean(error?.toLowerCase().includes("permission") || error?.toLowerCase().includes("consent"));
  const canQueue = !submitting && !parsedInput.error && lines.length > 0 && !needsSavedVoice && !needsCloneSample && !needsCloneConsent;
  const queueHint = getQueueHint({
    mode,
    linesCount: lines.length,
    inputError: parsedInput.error,
    needsSavedVoice,
    needsCloneSample,
    needsCloneConsent,
  });

  async function loadJobs() {
    setLoadingJobs(true);
    try {
      const response = await fetch("/api/batch/jobs", { cache: "no-store" });
      const body = (await response.json()) as JobsResponse | { error?: string };
      if (!response.ok) throw new Error("error" in body ? body.error : "Could not load batch jobs.");
      setJobs("jobs" in body ? body.jobs : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load batch jobs.");
    } finally {
      setLoadingJobs(false);
    }
  }

  async function loadSavedVoices() {
    setLoadingVoices(true);
    try {
      const response = await fetch("/api/dashboard/voices", { cache: "no-store" });
      const body = (await response.json()) as VoicesResponse | { error?: string };
      if (!response.ok) throw new Error("error" in body ? body.error : "Could not load saved voices.");
      const voices = "voices" in body ? body.voices : [];
      setSavedVoices(voices);
      setSelectedSavedVoiceId((current) => {
        if (current && voices.some((item) => item.id === current)) return current;
        return voices[0]?.id ?? "";
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load saved voices.");
    } finally {
      setLoadingVoices(false);
    }
  }

  async function loadDetail(jobId: string, options: { silent?: boolean } = {}) {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    if (!options.silent) {
      setDetailLoadingJobId(jobId);
      setDetailError(null);
    }
    try {
      const response = await fetch(`/api/batch/jobs/${jobId}`, { cache: "no-store" });
      const body = (await response.json()) as JobDetail | { error?: string };
      if (!response.ok) throw new Error("error" in body ? body.error : "Could not load job detail.");
      if (detailRequestRef.current !== requestId) return;
      setDetail(body as JobDetail);
    } catch (loadError) {
      if (detailRequestRef.current !== requestId) return;
      setDetailError(loadError instanceof Error ? loadError.message : "Could not load job detail.");
    } finally {
      if (detailRequestRef.current === requestId && !options.silent) {
        setDetailLoadingJobId(null);
      }
    }
  }

  function selectJob(job: BatchJobRecord) {
    setSelectedJobId(job.id);
    setDetailError(null);
    if (detail?.job.id !== job.id) {
      setDetailLoadingJobId(job.id);
    }
    void loadDetail(job.id);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadJobs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (mode !== "clone") return;
    const timer = window.setTimeout(() => {
      void loadSavedVoices();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode]);

  useEffect(() => {
    if (!activeJobId || (activeJobStatus !== "queued" && activeJobStatus !== "running")) return;
    const timer = window.setInterval(() => {
      void loadDetail(activeJobId, { silent: true });
      void loadJobs();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [activeJobId, activeJobStatus]);

  async function submitBatch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (lines.length === 0) {
      setError("Add at least one text line.");
      return;
    }
    if (parsedInput.error) {
      setError(parsedInput.error);
      return;
    }
    if (mode === "clone" && cloneVoiceSource === "library" && !selectedSavedVoice) {
      setError("Choose one saved voice from your library.");
      return;
    }
    if (mode === "clone" && cloneVoiceSource === "upload" && !sample) {
      setError("Choose one voice sample for clone batch.");
      return;
    }
    if (mode === "clone" && cloneVoiceSource === "upload" && !voiceConsent) {
      setError("Check the permission box under the reference voice sample before queuing this clone batch.");
      return;
    }

    setSubmitting(true);
    try {
      let response: Response;
      const requestVoice = mode === "clone" && cloneVoiceSource === "library" && selectedSavedVoice
        ? selectedSavedVoice.id
        : voice.trim() || (mode === "clone" ? DEFAULT_CLONE_VOICE_INSTRUCTION : DEFAULT_TTS_VOICE_PROMPT);
      const requestExternalId = externalId.trim();
      const requestWebhookUrl = webhookUrl.trim();
      if (mode === "clone") {
        const formData = new FormData();
        formData.set("input", input);
        formData.set("title", title);
        formData.set("voice", requestVoice);
        formData.set("model", model);
        formData.set("voice_consent", cloneVoiceSource === "library" || voiceConsent ? "true" : "false");
        if (requestExternalId) formData.set("external_id", requestExternalId);
        if (requestWebhookUrl) formData.set("webhook_url", requestWebhookUrl);
        if (inputMode === "dubbing_json") {
          formData.set("input_json", JSON.stringify(lines));
        }
        if (cloneVoiceSource === "upload" && sample) formData.set("sample", sample);
        response = await fetch("/api/batch-clone", { method: "POST", body: formData });
      } else {
        response = await fetch("/api/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: inputMode === "dubbing_json" ? lines : lines.map((line) => line.text),
            title,
            voice: requestVoice,
            model,
            external_id: requestExternalId || undefined,
            webhook_url: requestWebhookUrl || undefined,
          }),
        });
      }

      const body = (await response.json()) as JobDetail & { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Batch generation failed.");
      setDetail({ job: body.job, items: body.items });
      setSelectedJobId(body.job.id);
      setDetailLoadingJobId(null);
      setDetailError(null);
      await loadJobs();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Batch generation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="dashboard-enter grid grid-cols-12 gap-8 min-w-0">
      {/* Left Workspace Section */}
      <div className="col-span-12 lg:col-span-8 flex flex-col gap-6 min-w-0">
        {/* Title Header with Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-primary pb-4">
          <div>
            <h2 className="font-headline text-4xl md:text-6xl font-black uppercase tracking-tighter text-primary">Batch Jobs</h2>
            <p className="font-body text-base text-on-surface-variant max-w-xl mt-2">
              Generate mass speech files from raw Khmer script. Optimize workflows with automated parallel processing and centralized audio management.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadJobs()}
            className="px-4 py-2 border-2 border-primary bg-white text-primary font-headline font-bold uppercase text-xs hover:bg-[#faf7f2] transition-colors cursor-pointer shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
          >
            {loadingJobs ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error ? <InlineError message={error} /> : null}

        {/* Main Workspace Card */}
        <form onSubmit={submitBatch} className="bg-surface border-4 border-primary shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] p-6 md:p-8 flex flex-col gap-6">
          {/* Tab Switcher */}
          <div className="flex gap-4 border-b-4 border-primary -mx-6 md:-mx-8 px-6 md:px-8 pb-4">
            <button
              type="button"
              onClick={() => {
                setMode("tts");
                setVoice(DEFAULT_TTS_VOICE_PROMPT);
                setCloneVoiceSource("upload");
                setError(null);
              }}
              className={`px-6 py-3 font-headline font-bold uppercase text-sm transition-colors cursor-pointer ${
                mode === "tts"
                  ? "bg-primary text-surface"
                  : "bg-surface-variant text-on-surface-variant border-2 border-primary hover:bg-primary-container"
              }`}
            >
              Text to Speech Batch
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("clone");
                setVoice(DEFAULT_CLONE_VOICE_INSTRUCTION);
                setError(null);
              }}
              className={`px-6 py-3 font-headline font-bold uppercase text-sm transition-colors cursor-pointer ${
                mode === "clone"
                  ? "bg-primary text-surface"
                  : "bg-surface-variant text-on-surface-variant border-2 border-primary hover:bg-primary-container"
              }`}
            >
              Clone Voice Batch
            </button>
          </div>

          {/* Informational Banner */}
          <div className="bg-primary-container border-2 border-primary p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-primary">info</span>
            <p className="text-sm font-medium">
              {mode === "clone"
                ? "Use Clone Voice Batch when you need the same voice across many lines. Upload one clear reference sample, confirm permission, then paste one line per audio file."
                : "Use Text to Speech for rapid Khmer MP3 generation. Input one sentence per line to create discrete audio segments for each entry."}
            </p>
          </div>

          {mode === "tts" ? (
            <div className="border-2 border-primary bg-surface-bright p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-headline font-bold uppercase text-xs tracking-widest text-on-surface-variant">
                    Standard voice
                  </p>
                  <p className="mt-1 text-xs font-body font-semibold text-on-surface-variant">
                    Choose the preset speaker for every line in this batch.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {DASHBOARD_TTS_VOICE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setVoice(preset);
                        setError(null);
                      }}
                      className={`min-w-28 border-2 border-primary px-4 py-3 text-left font-headline font-bold uppercase text-xs transition-all cursor-pointer ${
                        voice === preset
                          ? "bg-[#ffcc00] text-primary shadow-[3px_3px_0px_0px_#1a1a1a] -translate-y-0.5"
                          : "bg-white text-primary hover:bg-[#faf7f2]"
                      }`}
                    >
                      <span className="material-symbols-outlined mr-2 align-middle text-base">graphic_eq</span>
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {/* Voice Cloning Reference Audio / Consent Checkbox */}
          {mode === "clone" ? (
            <div className="grid gap-3">
              <div className="border-2 border-primary bg-surface-bright p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-headline font-bold uppercase text-xs tracking-widest text-on-surface-variant">
                      Clone voice source
                    </p>
                    <p className="mt-1 text-xs font-body font-semibold text-on-surface-variant">
                      Use a saved voice from your library or upload a new reference sample for this batch.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCloneVoiceSource("upload");
                        setError(null);
                      }}
                      className={`border-2 border-primary px-4 py-3 font-headline font-bold uppercase text-xs transition-all cursor-pointer ${
                        cloneVoiceSource === "upload"
                          ? "bg-[#ffcc00] text-primary shadow-[3px_3px_0px_0px_#1a1a1a] -translate-y-0.5"
                          : "bg-white text-primary hover:bg-[#faf7f2]"
                      }`}
                    >
                      Upload sample
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCloneVoiceSource("library");
                        setError(null);
                      }}
                      className={`border-2 border-primary px-4 py-3 font-headline font-bold uppercase text-xs transition-all cursor-pointer ${
                        cloneVoiceSource === "library"
                          ? "bg-[#ffcc00] text-primary shadow-[3px_3px_0px_0px_#1a1a1a] -translate-y-0.5"
                          : "bg-white text-primary hover:bg-[#faf7f2]"
                      }`}
                    >
                      Saved library
                    </button>
                  </div>
                </div>
              </div>

              {cloneVoiceSource === "library" ? (
                <div className="grid gap-3 border-2 border-primary bg-[#fafbfe] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="grid flex-1 gap-1 text-sm text-[#596274] font-headline font-bold uppercase">
                      Saved voice
                      <select
                        value={selectedSavedVoiceId}
                        onChange={(event) => {
                          setSelectedSavedVoiceId(event.target.value);
                          setError(null);
                        }}
                        className="min-w-0 border-2 border-primary p-3 bg-white focus:outline-none text-sm font-semibold"
                        disabled={loadingVoices || savedVoices.length === 0}
                      >
                        {savedVoices.length === 0 ? (
                          <option value="">{loadingVoices ? "Loading saved voices..." : "No saved voices yet"}</option>
                        ) : (
                          savedVoices.map((savedVoice) => (
                            <option key={savedVoice.id} value={savedVoice.id}>
                              {savedVoice.name}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    <a
                      href="/app/dashboard/voices"
                      className="self-end border-2 border-primary bg-white px-4 py-3 font-headline font-bold uppercase text-xs text-primary hover:bg-[#faf7f2]"
                    >
                      Open library
                    </a>
                  </div>
                  {selectedSavedVoice ? (
                    <div className="border-2 border-primary bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
                      <p className="font-headline font-bold uppercase text-xs">{selectedSavedVoice.name}</p>
                      <p className="mt-1 text-xs font-body font-semibold text-emerald-900">
                        {selectedSavedVoice.description || "Saved reference voice"} - {selectedSavedVoice.fileName} -{" "}
                        {formatBytes(selectedSavedVoice.fileSize)}
                      </p>
                    </div>
                  ) : (
                    <p className="border-2 border-primary bg-white px-4 py-3 text-sm font-semibold text-on-surface-variant">
                      Save a reference voice in the voice library first, or switch back to Upload sample.
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid gap-3">
                  <label className="grid cursor-pointer place-items-center gap-2 border-4 border-dashed border-primary bg-surface-bright px-4 py-8 text-center text-sm text-[#4f5665] hover:bg-white transition-colors">
                    <span className="font-headline font-bold uppercase text-xs text-primary">
                      {sample ? sample.name : "Choose one reference voice sample"}
                    </span>
                    <span className="font-body text-xs">MP3 or WAV, clear single speaker</span>
                    <input
                      type="file"
                      accept="audio/*"
                      className="sr-only"
                      onChange={(event) => {
                        setSample(event.target.files?.[0] ?? null);
                        setError(null);
                      }}
                    />
                  </label>
                  <label
                    className={`flex items-start gap-3 border-2 border-primary px-4 py-3 text-sm transition-colors cursor-pointer ${
                      consentError
                        ? "bg-[#ffdad6] text-[#93000a]"
                        : voiceConsent
                          ? "bg-emerald-50 text-emerald-900"
                          : "bg-[#f5f0e8] text-primary"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={voiceConsent}
                      onChange={(event) => {
                        setVoiceConsent(event.target.checked);
                        setError(null);
                      }}
                      className="mt-1"
                    />
                    <span className="grid gap-1">
                      <span className="font-headline font-bold uppercase text-xs">
                        I own this voice sample or have explicit permission to use it.
                      </span>
                      <span className="font-body text-xs text-on-surface-variant">
                        Required for uploaded clone voice batches. Saved library voices already use your stored reference sample.
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </div>
          ) : null}

          {/* Input Area */}
          <div className="flex flex-col gap-2">
            <label className="font-headline font-bold uppercase text-xs tracking-widest text-on-surface-variant">
              {inputMode === "dubbing_json" ? "Dubbing line JSON" : "Khmer Script Input"}
            </label>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="w-full h-64 bg-surface-bright border-4 border-primary p-6 font-body text-lg focus:ring-0 focus:outline-none placeholder:text-outline-variant"
              placeholder={inputMode === "dubbing_json" ? "JSON array of line objects..." : "បញ្ចូលអត្ថបទខ្មែរនៅទីនេះ..."}
            />
          </div>

          {parsedInput.error ? (
            <p className="border-2 border-error bg-[#ffdad6] px-4 py-3 text-sm text-[#93000a] font-bold">
              {parsedInput.error}
            </p>
          ) : inputMode === "dubbing_json" ? (
            <p className="border-2 border-primary bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
              Accepted fields: text, external_id, speaker, start_ms, end_ms, metadata. Clone batches still require reference voice and permission.
            </p>
          ) : null}

          {/* Advanced Settings details collapsible */}
          <details className="group border-2 border-primary bg-surface-bright">
            <summary className="flex items-center justify-between p-4 cursor-pointer font-headline font-bold uppercase text-sm select-none group-open:bg-primary group-open:text-surface transition-colors">
              <span>Advanced Engine Settings</span>
              <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
            </summary>
            <div className="p-6 flex flex-col gap-4 bg-surface-bright border-t-2 border-primary">
              <div className="rounded-2xl border border-primary bg-[#fafbfe] p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode("plain");
                      setInput(exampleLines);
                      setError(null);
                    }}
                    className={`px-4 py-2 border border-primary font-headline font-bold uppercase text-xs transition-all cursor-pointer ${
                      inputMode === "plain"
                        ? "bg-[#ffcc00] text-primary shadow-[2px_2px_0px_0px_#1a1a1a] -translate-y-0.5"
                        : "bg-white text-primary hover:bg-[#faf7f2]"
                    }`}
                  >
                    Simple lines
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode("dubbing_json");
                      setInput(exampleDubbingJson);
                      setError(null);
                    }}
                    className={`px-4 py-2 border border-primary font-headline font-bold uppercase text-xs transition-all cursor-pointer ${
                      inputMode === "dubbing_json"
                        ? "bg-[#ffcc00] text-primary shadow-[2px_2px_0px_0px_#1a1a1a] -translate-y-0.5"
                        : "bg-white text-primary hover:bg-[#faf7f2]"
                    }`}
                  >
                    Dubbing JSON
                  </button>
                </div>
                <p className="mt-2 px-2 text-xs leading-5 text-on-surface-variant font-body font-semibold">
                  Dubbing JSON is only needed when your app must keep customer line IDs, speakers, timings, or metadata.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-sm text-[#596274] font-headline font-bold uppercase">
                  Job title
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="border-2 border-primary p-2 bg-surface focus:outline-none text-sm font-semibold"
                  />
                </label>
                <label className="grid gap-1 text-sm text-[#596274] font-headline font-bold uppercase">
                  {mode === "clone" ? "Clone instruction" : "Voice prompt"}
                  {mode === "tts" ? (
                    <select
                      value={voice}
                      onChange={(event) => setVoice(event.target.value)}
                      className="border-2 border-primary p-2 bg-surface focus:outline-none text-sm font-semibold"
                    >
                      {DASHBOARD_TTS_VOICE_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset}
                        </option>
                      ))}
                    </select>
                  ) : cloneVoiceSource === "library" ? (
                    <input
                      value={selectedSavedVoice?.name ?? "Select saved voice above"}
                      readOnly
                      className="border-2 border-primary p-2 bg-[#f5f0e8] focus:outline-none text-sm font-semibold"
                    />
                  ) : (
                    <input
                      value={voice}
                      onChange={(event) => setVoice(event.target.value)}
                      className="border-2 border-primary p-2 bg-surface focus:outline-none text-sm font-semibold"
                    />
                  )}
                </label>
                <label className="grid gap-1 text-sm text-[#596274] font-headline font-bold uppercase">
                  Model
                  <input
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    className="border-2 border-primary p-2 bg-surface focus:outline-none text-sm font-semibold"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm text-[#596274] font-headline font-bold uppercase">
                  External job ID
                  <input
                    value={externalId}
                    onChange={(event) => setExternalId(event.target.value)}
                    className="border-2 border-primary p-2 bg-surface focus:outline-none text-sm font-semibold"
                    placeholder="customer-job-123"
                  />
                </label>
                <label className="grid gap-1 text-sm text-[#596274] font-headline font-bold uppercase">
                  Webhook callback URL
                  <input
                    value={webhookUrl}
                    onChange={(event) => setWebhookUrl(event.target.value)}
                    className="border-2 border-primary p-2 bg-surface focus:outline-none text-sm font-semibold"
                    placeholder="https://your-app.example.com/tts-callback"
                  />
                </label>
              </div>
            </div>
          </details>

          {/* Metrics Bar */}
          <div className="grid grid-cols-3 gap-4">
            <div className="border-2 border-primary p-4 flex flex-col items-center justify-center bg-surface-bright shadow-[4px_4px_0px_0px_#1a1a1a]">
              <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant mb-1">Lines</span>
              <span className="text-3xl font-black">{lines.length.toLocaleString()}</span>
            </div>
            <div className="border-2 border-primary p-4 flex flex-col items-center justify-center bg-surface-bright shadow-[4px_4px_0px_0px_#1a1a1a]">
              <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant mb-1">Est. Seconds</span>
              <span className="text-3xl font-black">{estimate.seconds.toLocaleString()}s</span>
            </div>
            <div className="border-2 border-primary p-4 flex flex-col items-center justify-center bg-surface-bright shadow-[4px_4px_0px_0px_#1a1a1a]">
              <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant mb-1">Est. Tokens</span>
              <span className="text-3xl font-black">{estimate.credits.toLocaleString()}</span>
            </div>
          </div>

          {/* Queue Button */}
          <button
            type="submit"
            disabled={!canQueue}
            className="w-full bg-primary text-surface font-headline font-black text-2xl uppercase tracking-widest py-6 border-4 border-primary shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none hover:-translate-y-0.5 hover:shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] transition-all cursor-pointer group disabled:opacity-55 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            <span className="flex items-center justify-center gap-4">
              {submitting ? "Queuing batch..." : queueHint ?? "Queue Batch"}
              <span className="material-symbols-outlined text-4xl group-hover:translate-x-2 transition-transform">bolt</span>
            </span>
          </button>
          {submitting ? <VoxLoader variant="inline" label="Preparing batch job..." /> : null}
        </form>
      </div>

      {/* Right Sidebar Section */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-6 min-w-0">
        {/* Recent Jobs */}
        <section className="flex flex-col min-w-0">
          <div className="flex justify-between items-end mb-4 border-b-2 border-primary pb-2">
            <h3 className="font-headline text-2xl font-black uppercase tracking-tighter">Recent Jobs</h3>
          </div>
          <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto pr-1">
            {loadingJobs && jobs.length === 0 ? (
              <VoxLoader variant="inline" label="Loading jobs..." />
            ) : jobs.length === 0 ? (
              <div className="border-4 border-dashed border-primary bg-surface-variant flex flex-col items-center justify-center p-8 text-center gap-4">
                <div className="w-16 h-16 border-2 border-primary border-dashed rounded-full flex items-center justify-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-3xl">history</span>
                </div>
                <p className="font-label text-xs uppercase font-bold text-on-surface-variant">No active or previous batch jobs found for this cycle.</p>
              </div>
            ) : (
              jobs.map((job) => (
                <button
                  type="button"
                  key={job.id}
                  onClick={() => selectJob(job)}
                  className={`click-soft border-4 border-primary p-4 text-left transition-all duration-100 will-change-transform ${
                    selectedJobId === job.id
                      ? "bg-primary-fixed text-primary shadow-[4px_4px_0px_0px_#1a1a1a] translate-y-0.5"
                      : "bg-white text-primary hover:bg-[#faf7f2]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-headline font-bold uppercase">{job.title}</p>
                    <StatusPill status={job.status} />
                  </div>
                  <p className="mt-1 text-xs font-body font-semibold text-on-surface-variant">
                    {job.completedItems}/{job.totalItems} done - {job.creditsCharged.toLocaleString()} tokens
                    {job.externalId ? ` - ${job.externalId}` : ""}
                  </p>
                  {job.webhookCallbackUrl ? (
                    <p className="mt-1 text-[10px] font-body text-on-surface-variant">
                      Webhook {job.webhookStatus ?? "pending"} / {job.webhookAttempts.toLocaleString()} attempts
                    </p>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </section>

        {/* Selected Job Detail */}
        <section className="flex flex-col min-w-0">
          <h3 className="font-headline text-2xl font-black uppercase tracking-tighter mb-4 border-b-2 border-primary pb-2">Selected Job</h3>
          {selectedJob ? (
            <div className="border-4 border-primary bg-surface p-6 flex flex-col gap-4 relative overflow-hidden shadow-[4px_4px_0px_0px_#1a1a1a]">
              <div className="border-2 border-primary bg-surface-bright p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-headline font-black uppercase text-sm">{selectedJob.title}</p>
                  <StatusPill status={selectedJob.status} />
                </div>
                <p className="mt-2 text-xs font-body font-semibold text-on-surface-variant">
                  {selectedJob.completedItems}/{selectedJob.totalItems} files - {selectedJob.outputSeconds}s -{" "}
                  {selectedJob.creditsCharged.toLocaleString()} tokens
                </p>
                {selectedJob.externalId || selectedJob.webhookCallbackUrl ? (
                  <div className="mt-3 grid gap-1 text-[10px] text-on-surface-variant font-body">
                    {selectedJob.externalId ? <p>External ID: {selectedJob.externalId}</p> : null}
                    {selectedJob.webhookCallbackUrl ? (
                      <p>
                        Webhook {selectedJob.webhookStatus ?? "pending"} /{" "}
                        {selectedJob.webhookAttempts.toLocaleString()} attempts
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {isDetailLoading ? (
                <p className="border-2 border-primary bg-[#faf7f2] px-4 py-3 text-xs font-headline font-bold uppercase text-on-surface-variant">
                  Loading item details...
                </p>
              ) : null}
              {detailError ? <InlineError message={detailError} /> : null}
              {canDownloadBatchJob(selectedJob) ? (
                <a
                  href={`/api/batch/jobs/${selectedJob.id}/download`}
                  className="w-full bg-primary text-surface border-2 border-primary py-3 text-center font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_#1a1a1a] hover:bg-tertiary hover:text-white transition-all active:translate-x-0.5 active:translate-y-0.5 cursor-pointer block"
                >
                  Download ZIP
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full bg-[#eee9e0] text-on-surface-variant border-2 border-primary py-3 text-center font-headline font-bold uppercase text-xs cursor-not-allowed"
                >
                  No audio files yet
                </button>
              )}
            </div>
          ) : (
            <div className="border-4 border-primary bg-surface p-8 flex flex-col items-center justify-center text-center gap-4 relative overflow-hidden shadow-[4px_4px_0px_0px_#1a1a1a] min-h-[160px]">
              <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: "radial-gradient(#1a1a1a 1px, transparent 1px)", backgroundSize: "20px 20px" }}></div>
              <p className="font-headline text-lg font-bold uppercase tracking-tight">Focus Context</p>
              <p className="text-xs text-on-surface-variant font-body font-semibold px-4">Select a batch from the history panel to view detailed metadata, generation metrics, and download links.</p>
            </div>
          )}
        </section>
      </div>

      <div className="col-span-12">
        <BatchHistoryPanel
          jobs={jobs}
          loading={loadingJobs}
          selectedJobId={selectedJobId}
          onSelect={selectJob}
        />
      </div>

      {/* Selected Job Items List */}
      {selectedJob ? (
        <div className="col-span-12 mt-6">
          {selectedDetailReady && detail ? (
            <JobItemsTable items={detail.items} />
          ) : (
            <JobItemsPlaceholder loading={isDetailLoading} error={detailError} />
          )}
        </div>
      ) : null}
    </section>
  );
}

function BatchHistoryPanel({
  jobs,
  loading,
  selectedJobId,
  onSelect,
}: {
  jobs: BatchJobRecord[];
  loading: boolean;
  selectedJobId: string | null;
  onSelect: (job: BatchJobRecord) => void;
}) {
  const completedJobs = jobs.filter((job) => job.status === "completed" || job.status === "partial").length;
  const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "running").length;
  const failedJobs = jobs.filter((job) => job.status === "failed" || job.status === "needs_review").length;
  const totalTokens = jobs.reduce((sum, job) => sum + job.creditsCharged, 0);

  return (
    <section className="mt-2 flex flex-col gap-4 border-4 border-primary bg-surface p-5 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-primary pb-4">
        <div>
          <p className="font-headline text-3xl font-black uppercase tracking-tighter">Batch Voice History</p>
          <p className="mt-1 max-w-2xl text-sm font-body font-semibold text-on-surface-variant">
            Track every batch voice job, open item details instantly, and download completed MP3 files as one ZIP.
          </p>
        </div>
        <span className="border-2 border-primary bg-[#ffcc00] px-3 py-1 font-headline text-xs font-bold uppercase text-primary">
          {loading ? "Refreshing" : `${jobs.length.toLocaleString()} jobs`}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <HistoryMetric label="Completed" value={completedJobs.toLocaleString()} />
        <HistoryMetric label="Queued / Running" value={activeJobs.toLocaleString()} />
        <HistoryMetric label="Needs Attention" value={failedJobs.toLocaleString()} />
        <HistoryMetric label="Tokens Used" value={totalTokens.toLocaleString()} />
      </div>

      {jobs.length === 0 ? (
        <div className="border-4 border-dashed border-primary bg-surface-variant p-8 text-center">
          <p className="font-headline text-lg font-black uppercase">No batch voice history yet</p>
          <p className="mt-2 text-sm font-body font-semibold text-on-surface-variant">
            Queue one Text to Speech Batch or Clone Voice Batch and it will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[940px]">
            <div className="grid grid-cols-12 gap-3 border-b-2 border-primary px-4 py-3 font-headline text-xs font-black uppercase text-on-surface-variant">
              <div className="col-span-3">Job</div>
              <div className="col-span-1">Mode</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-2">Progress</div>
              <div className="col-span-1 text-right">Seconds</div>
              <div className="col-span-1 text-right">Tokens</div>
              <div className="col-span-2">Updated</div>
              <div className="col-span-1 text-right">Action</div>
            </div>
            <div className="grid gap-3 pt-3">
              {jobs.map((job) => {
                const selected = selectedJobId === job.id;
                return (
                  <div
                    key={job.id}
                    className={`grid grid-cols-12 gap-3 border-4 border-primary px-4 py-4 transition-all duration-100 will-change-transform ${
                      selected
                        ? "bg-primary-fixed shadow-[4px_4px_0px_0px_#1a1a1a]"
                        : "bg-white hover:bg-[#faf7f2] hover:-translate-y-0.5"
                    }`}
                  >
                    <div className="col-span-3 min-w-0">
                      <p className="truncate font-headline text-sm font-black uppercase text-primary" title={job.title}>
                        {job.title}
                      </p>
                      <p className="mt-1 truncate text-[11px] font-body font-semibold text-on-surface-variant">
                        {job.externalId || job.id}
                      </p>
                    </div>
                    <div className="col-span-1 self-center font-headline text-xs font-bold uppercase">
                      {job.mode === "clone" ? "Clone" : "TTS"}
                    </div>
                    <div className="col-span-1 self-center">
                      <StatusPill status={job.status} />
                    </div>
                    <div className="col-span-2 self-center">
                      <p className="font-body text-xs font-bold text-primary">
                        {job.completedItems}/{job.totalItems} files
                      </p>
                      <div className="mt-2 h-2 border border-primary bg-white">
                        <div
                          className="h-full bg-[#10b981]"
                          style={{ width: `${jobProgressPercent(job)}%` }}
                        />
                      </div>
                    </div>
                    <div className="col-span-1 self-center text-right font-body text-xs font-bold">
                      {job.outputSeconds.toLocaleString()}s
                    </div>
                    <div className="col-span-1 self-center text-right font-body text-xs font-bold">
                      {job.creditsCharged.toLocaleString()}
                    </div>
                    <div className="col-span-2 self-center font-body text-xs font-semibold text-on-surface-variant">
                      {formatBatchDate(job.updatedAt)}
                    </div>
                    <div className="col-span-1 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onSelect(job)}
                        className="border-2 border-primary bg-white px-3 py-2 font-headline text-[10px] font-bold uppercase text-primary hover:bg-[#ffcc00] transition-colors"
                      >
                        View
                      </button>
                      {canDownloadBatchJob(job) ? (
                        <a
                          href={`/api/batch/jobs/${job.id}/download`}
                          className="border-2 border-primary bg-primary px-3 py-2 font-headline text-[10px] font-bold uppercase text-surface hover:bg-tertiary transition-colors"
                        >
                          ZIP
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function HistoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-primary bg-surface-bright p-4 shadow-[3px_3px_0px_0px_#1a1a1a]">
      <p className="font-headline text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</p>
      <p className="mt-2 font-headline text-2xl font-black text-primary">{value}</p>
    </div>
  );
}

function JobItemsPlaceholder({ loading, error }: { loading: boolean; error: string | null }) {
  return (
    <section className="mt-6 border-4 border-primary bg-surface p-8 text-center shadow-[4px_4px_0px_0px_#1a1a1a]">
      <p className="font-headline text-2xl font-black uppercase tracking-tighter">
        {error ? "Could not load job items" : loading ? "Loading job items" : "Select a job to load items"}
      </p>
      <p className="mt-2 text-sm font-body font-semibold text-on-surface-variant">
        {error ?? "The job summary is ready. Detailed line results are loading in the background."}
      </p>
    </section>
  );
}

function JobItemsTable({ items }: { items: BatchJobItemRecord[] }) {
  return (
    <section className="flex flex-col gap-4 mt-6">
      <div className="border-b-4 border-primary pb-3">
        <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Job Items</h2>
      </div>

      {/* Desktop Column Guide */}
      <div className="hidden lg:grid grid-cols-12 gap-4 px-6 py-3 font-label font-black uppercase text-sm border-b-2 border-primary text-on-surface-variant">
        <div className="col-span-1">#</div>
        <div className="col-span-1">Status</div>
        <div className="col-span-2">External ID</div>
        <div className="col-span-1">Speaker</div>
        <div className="col-span-1">Timing</div>
        <div className="col-span-2">Input Text</div>
        <div className="col-span-1 text-right">Duration</div>
        <div className="col-span-1 text-right">Cost</div>
        <div className="col-span-2 text-center">Actions / Result</div>
      </div>

      {/* Data Card Rows */}
      <div className="flex flex-col gap-4">
        {items.map((item) => {
          const isFailed = item.status === "failed";
          const isSuccess = item.status === "success";

          return (
            <div
              key={item.id}
              className={`group relative border-4 p-0 flex flex-col lg:grid lg:grid-cols-12 lg:gap-4 lg:items-center hover:-translate-y-0.5 transition-all duration-150 min-w-0 ${
                isFailed
                  ? "border-error bg-error-container lg:items-stretch hover:shadow-[4px_4px_0px_0px_#cc0000]"
                  : "border-primary bg-surface hover:bg-surface-bright hover:shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]"
              }`}
            >
              {/* Item Number */}
              <div className={`p-4 lg:p-6 lg:col-span-1 border-b-2 lg:border-b-0 lg:border-r-2 font-body font-bold text-sm text-primary ${isFailed ? "border-error bg-surface" : "border-primary bg-surface-container-low"}`}>
                #{item.itemIndex + 1}
              </div>

              {/* Status */}
              <div className="p-4 lg:p-6 lg:col-span-1 flex items-center">
                <StatusPill status={item.status} />
              </div>

              {/* External ID */}
              <div className="p-4 lg:p-6 lg:col-span-2 font-mono text-xs truncate text-primary" title={item.externalId ?? ""}>
                <span className="lg:hidden font-headline font-bold uppercase mr-2 text-on-surface-variant">Ext ID:</span>
                {item.externalId ?? "-"}
              </div>

              {/* Speaker */}
              <div className="p-4 lg:p-6 lg:col-span-1 font-body text-sm font-semibold truncate text-primary" title={item.speaker ?? ""}>
                <span className="lg:hidden font-headline font-bold uppercase mr-2 text-on-surface-variant">Speaker:</span>
                {item.speaker ?? "-"}
              </div>

              {/* Timing */}
              <div className="p-4 lg:p-6 lg:col-span-1 font-body text-xs font-semibold text-primary">
                <span className="lg:hidden font-headline font-bold uppercase mr-2 text-on-surface-variant">Timing:</span>
                {formatTiming(item)}
              </div>

              {/* Input Preview */}
              <div className="p-4 lg:p-6 lg:col-span-2 font-body text-sm font-medium truncate text-primary" title={item.inputPreview}>
                {item.inputPreview}
              </div>

              {/* Duration */}
              <div className="p-4 lg:p-6 lg:col-span-1 font-body font-bold text-left lg:text-right lg:border-l-2 border-dashed text-sm text-primary border-primary">
                <span className="lg:hidden text-on-surface-variant mr-2">Duration:</span>
                {item.outputSeconds}s
              </div>

              {/* Cost */}
              <div className="p-4 lg:p-6 lg:col-span-1 font-body font-bold text-left lg:text-right text-sm text-primary">
                <span className="lg:hidden text-on-surface-variant mr-2">Cost:</span>
                {item.creditsCharged.toLocaleString()}t
              </div>

              {/* Result / Action */}
              <div className={`p-4 lg:p-6 lg:col-span-2 flex items-center justify-center gap-2 border-t-2 lg:border-t-0 lg:border-l-2 text-xs font-semibold text-center ${isFailed ? "border-error bg-surface text-error" : "border-primary bg-surface-container text-[#6a7282]"}`}>
                {isSuccess ? (
                  <a
                    href={`/api/batch/jobs/${item.jobId}/items/${item.id}/download`}
                    className="inline-flex min-w-20 items-center justify-center border-2 border-primary bg-primary px-3 py-2 font-headline text-[10px] font-bold uppercase text-surface shadow-[2px_2px_0px_0px_#1a1a1a] hover:bg-tertiary transition-colors"
                  >
                    MP3
                  </a>
                ) : (
                  <span className="max-w-full break-words text-left leading-5" title={item.errorMessage ?? "Error"}>
                    {shortErrorMessage(item.errorMessage)}
                  </span>
                )}
              </div>
              {isFailed && item.errorMessage ? (
                <div className="border-t-2 border-error bg-[#fff7f6] px-4 py-3 font-body text-sm font-semibold leading-6 text-error lg:col-span-12 lg:px-6">
                  <span className="font-headline text-xs font-black uppercase tracking-wider">Error: </span>
                  <span className="break-words">{item.errorMessage}</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: BatchJobRecord["status"] | BatchJobItemRecord["status"] }) {
  const className =
    status === "completed" || status === "success"
      ? "bg-[#10b981] text-primary border-primary"
      : status === "failed"
        ? "bg-[#e63b2e] text-white border-primary"
        : status === "needs_review"
          ? "bg-[#ffcc00] text-primary border-primary"
          : status === "partial"
            ? "bg-amber-100 text-primary border-primary"
            : "bg-[#eee9e0] text-primary border-primary";
  return (
    <span className={`inline-block px-2.5 py-0.5 border-2 font-headline font-bold text-[10px] uppercase tracking-wider ${className}`}>
      {status}
    </span>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p className="border-2 border-error bg-[#ffdad6] px-4 py-3 text-sm text-[#cc0000] font-bold">
      {message}
    </p>
  );
}

function parseBatchInput(input: string, inputMode: BatchInputMode): { lines: DashboardBatchLine[]; error: string | null } {
  if (inputMode === "plain") {
    return {
      lines: input
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((text) => ({ text })),
      error: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { lines: [], error: "Dubbing JSON is not valid JSON." };
  }

  const payload = isRecord(parsed) && Array.isArray(parsed.input) ? parsed.input : parsed;
  if (!Array.isArray(payload)) {
    return { lines: [], error: "Dubbing JSON must be an array, or an object with an input array." };
  }

  const lines: DashboardBatchLine[] = [];
  for (let index = 0; index < payload.length; index += 1) {
    const item = payload[index];
    if (typeof item === "string") {
      const text = item.trim();
      if (text) lines.push({ text });
      continue;
    }
    if (!isRecord(item)) {
      return { lines: [], error: `Line ${index + 1} must be a string or object.` };
    }
    if (typeof item.text !== "string" || !item.text.trim()) {
      return { lines: [], error: `Line ${index + 1} needs a non-empty text field.` };
    }
    const startMs = optionalNumber(item.start_ms, `Line ${index + 1} start_ms`);
    if (!startMs.ok) return { lines: [], error: startMs.error };
    const endMs = optionalNumber(item.end_ms, `Line ${index + 1} end_ms`);
    if (!endMs.ok) return { lines: [], error: endMs.error };
    if (startMs.value !== null && endMs.value !== null && endMs.value < startMs.value) {
      return { lines: [], error: `Line ${index + 1} end_ms must be greater than or equal to start_ms.` };
    }
    lines.push({
      text: item.text.trim(),
      external_id: optionalString(item.external_id),
      speaker: optionalString(item.speaker),
      start_ms: startMs.value,
      end_ms: endMs.value,
      metadata: item.metadata,
    });
  }

  return { lines, error: lines.length > 0 ? null : "Add at least one text line." };
}

function estimateLines(lines: DashboardBatchLine[], mode: GenerationMode): { seconds: number; credits: number } {
  return lines.reduce(
    (acc, line) => {
      const chars = Array.from(line.text).length;
      const seconds = Math.max(1, Math.ceil(chars / (mode === "clone" ? 13 : 20)));
      return {
        seconds: acc.seconds + seconds,
        credits: acc.credits + seconds * (mode === "clone" ? STANDARD_CLONE_CREDITS_PER_SECOND : TTS_CREDITS_PER_SECOND),
      };
    },
    { seconds: 0, credits: 0 },
  );
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function optionalString(input: unknown): string | null {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

function optionalNumber(input: unknown, fieldName: string): { ok: true; value: number | null } | { ok: false; error: string } {
  if (input === null || input === undefined || input === "") return { ok: true, value: null };
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0) {
    return { ok: false, error: `${fieldName} must be a non-negative number.` };
  }
  return { ok: true, value: Math.round(input) };
}

function getQueueHint({
  mode,
  linesCount,
  inputError,
  needsSavedVoice,
  needsCloneSample,
  needsCloneConsent,
}: {
  mode: GenerationMode;
  linesCount: number;
  inputError: string | null;
  needsSavedVoice: boolean;
  needsCloneSample: boolean;
  needsCloneConsent: boolean;
}): string | null {
  if (inputError) return "Fix dubbing JSON first";
  if (linesCount === 0) return "Add text lines first";
  if (mode === "clone" && needsSavedVoice) return "Choose saved voice first";
  if (mode === "clone" && needsCloneSample) return "Choose reference voice first";
  if (mode === "clone" && needsCloneConsent) return "Confirm voice permission first";
  return null;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB"] as const;
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toLocaleString(undefined, { maximumFractionDigits: unitIndex === 0 ? 0 : 1 })} ${units[unitIndex]}`;
}

function shortErrorMessage(message: string | null): string {
  if (!message) return "-";
  const trimmed = message.trim();
  if (trimmed.length <= 90) return trimmed;
  return `${trimmed.slice(0, 87)}...`;
}

function canDownloadBatchJob(job: BatchJobRecord): boolean {
  return job.completedItems > 0;
}

function jobProgressPercent(job: BatchJobRecord): number {
  if (job.totalItems <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((job.completedItems / job.totalItems) * 100)));
}

function formatBatchDate(input: string | null | undefined): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTiming(item: BatchJobItemRecord): string {
  if (item.startMs === null && item.endMs === null) return "-";
  const start = item.startMs === null ? "?" : `${item.startMs}ms`;
  const end = item.endMs === null ? "?" : `${item.endMs}ms`;
  return `${start}-${end}`;
}
