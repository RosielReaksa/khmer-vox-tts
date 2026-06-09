"use client";

import { useEffect, useState } from "react";
import { useCachedJson, clearDashboardCache } from "@/app/app/dashboard/dashboard-data-cache";
import { VoxLoader } from "@/app/components/vox-loader";
import { MAX_CLONE_SAMPLE_BYTES } from "@/lib/usage-policy";

type UserVoiceListItem = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
};

type VoicesPanelProps = {
  initialVoices?: UserVoiceListItem[];
  onNavigate?: (href: string) => void;
};

export function VoicesPanel({ initialVoices = [], onNavigate }: VoicesPanelProps) {
  const [newVoiceName, setNewVoiceName] = useState("");
  const [newVoiceDesc, setNewVoiceDesc] = useState("");
  const [newVoiceFile, setNewVoiceFile] = useState<File | null>(null);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [saveVoiceError, setSaveVoiceError] = useState("");
  const [saveVoiceSuccess, setSaveVoiceSuccess] = useState("");

  // Playback States
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);

  const key = "dashboard:voices";
  const url = "/api/dashboard/voices";
  const { data, error, loading, refresh } = useCachedJson<{ ok: boolean; voices: UserVoiceListItem[] }>(key, url);

  const voices = data?.ok && data.voices ? data.voices : initialVoices;

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (activeAudio) {
        activeAudio.pause();
      }
    };
  }, [activeAudio]);

  async function handleSaveVoice(e: React.FormEvent) {
    e.preventDefault();
    if (!newVoiceName.trim() || !newVoiceFile) return;

    if (!voiceConsent) {
      setSaveVoiceError("You must accept the voice clone consent checkbox.");
      return;
    }

    if (newVoiceFile.size > MAX_CLONE_SAMPLE_BYTES) {
      setSaveVoiceError(`Voice sample must be smaller than ${(MAX_CLONE_SAMPLE_BYTES / (1024 * 1024))}MB.`);
      return;
    }

    setIsSavingVoice(true);
    setSaveVoiceError("");
    setSaveVoiceSuccess("");

    try {
      const fd = new FormData();
      fd.set("name", newVoiceName);
      fd.set("description", newVoiceDesc);
      fd.set("sample", newVoiceFile);

      const res = await fetch("/api/dashboard/voices", {
        method: "POST",
        body: fd,
      });
      const resData = await res.json();

      if (!res.ok) {
        setSaveVoiceError(resData.error || "Failed to save voice.");
        return;
      }

      setNewVoiceName("");
      setNewVoiceDesc("");
      setNewVoiceFile(null);
      setVoiceConsent(false);
      setSaveVoiceSuccess("Voice template successfully saved to your library!");

      // Refresh list
      clearDashboardCache("dashboard:voices");
      void refresh();
    } catch {
      setSaveVoiceError("Network error. Please try again.");
    } finally {
      setIsSavingVoice(false);
    }
  }

  async function handleDeleteVoice(id: string) {
    if (!confirm("Are you sure you want to delete this voice template?")) return;

    // If deleting the active playing voice, stop audio first
    if (playingId === id && activeAudio) {
      activeAudio.pause();
      setPlayingId(null);
      setActiveAudio(null);
    }

    try {
      const res = await fetch(`/api/dashboard/voices?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        clearDashboardCache("dashboard:voices");
        void refresh();
      } else {
        alert("Failed to delete voice.");
      }
    } catch {
      alert("Network error.");
    }
  }

  function handlePlayToggle(id: string) {
    if (playingId === id && activeAudio) {
      activeAudio.pause();
      setPlayingId(null);
      setActiveAudio(null);
      return;
    }

    if (activeAudio) {
      activeAudio.pause();
    }

    const audio = new Audio(`/api/dashboard/voices?id=${id}`);
    audio.addEventListener("ended", () => {
      setPlayingId(null);
      setActiveAudio(null);
    });
    audio.addEventListener("error", () => {
      alert("Failed to play audio preview. Verify the audio file is not corrupted.");
      setPlayingId(null);
      setActiveAudio(null);
    });

    setPlayingId(id);
    setActiveAudio(audio);
    void audio.play();
  }

  function navigateToWorkspace(href: string) {
    if (onNavigate) {
      onNavigate(href);
    }
  }

  return (
    <section className="dashboard-enter flex flex-col gap-6 text-[#1a1a1a]">
      {/* Header Section */}
      <header className="border-b-4 border-primary pb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-4xl md:text-6xl font-black font-headline uppercase tracking-tighter text-primary">Voice Library</h2>
          <p className="font-body text-base md:text-lg text-on-surface-variant mt-2 font-bold">
            Upload, store, and manage your custom Khmer voice clone templates.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigateToWorkspace("/app/dashboard")}
          className="inline-flex items-center gap-2 border-4 border-primary bg-white px-4 py-2.5 text-xs font-headline uppercase font-black text-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm font-black">keyboard_backspace</span>
          Back to Generator
        </button>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[340px_1fr] items-start">
        {/* Save Voice Form */}
        <article className="border-4 border-primary bg-surface-bright p-5 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
          <h3 className="font-headline font-black text-lg uppercase text-primary border-b-2 border-[#eee9e0] pb-2 mb-4">
            Upload New Voice
          </h3>

          <form onSubmit={handleSaveVoice} className="space-y-4">
            {saveVoiceError && (
              <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 border-2 border-red-200 uppercase">
                {saveVoiceError}
              </p>
            )}
            {saveVoiceSuccess && (
              <p className="text-xs font-bold text-emerald-700 bg-emerald-50 p-2.5 border-2 border-emerald-200 uppercase">
                {saveVoiceSuccess}
              </p>
            )}

            <div className="grid gap-1">
              <label className="text-xs font-headline uppercase font-black text-[#4a4a4a]">Voice Name *</label>
              <input
                type="text"
                required
                value={newVoiceName}
                onChange={(e) => {
                  setNewVoiceName(e.target.value);
                  setSaveVoiceError("");
                }}
                placeholder="e.g. Grandma Storyteller"
                className="h-10 px-3 border-2 border-primary bg-white text-sm font-medium focus:bg-[#faf7f2] outline-none text-[#1a1a1a] placeholder:text-gray-400"
              />
            </div>

            <div className="grid gap-1">
              <label className="text-xs font-headline uppercase font-black text-[#4a4a4a]">Description</label>
              <input
                type="text"
                value={newVoiceDesc}
                onChange={(e) => {
                  setNewVoiceDesc(e.target.value);
                  setSaveVoiceError("");
                }}
                placeholder="e.g. Smooth, warm tone for news"
                className="h-10 px-3 border-2 border-primary bg-white text-sm font-medium focus:bg-[#faf7f2] outline-none text-[#1a1a1a] placeholder:text-gray-400"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-headline uppercase font-black text-[#4a4a4a]">
                Reference Audio * (MP3/WAV, max 8MB)
              </label>
              <label className="flex flex-col items-center justify-center border-4 border-dashed border-primary p-5 bg-white hover:bg-[#eee9e0] cursor-pointer transition shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                <input
                  type="file"
                  required
                  accept="audio/wav,audio/x-wav,audio/mpeg,audio/mp3"
                  onChange={(e) => {
                    setNewVoiceFile(e.target.files?.[0] ?? null);
                    setSaveVoiceError("");
                  }}
                  className="hidden"
                />
                <span className="flex h-9 w-9 items-center justify-center border-2 border-primary bg-[#ffcc00] text-primary shadow-[1px_1px_0px_0px_rgba(26,26,26,1)]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                  </svg>
                </span>
                <span className="text-center mt-2 max-w-[240px] truncate block font-headline font-black text-xs text-primary">
                  {newVoiceFile ? newVoiceFile.name : "Select Audio File"}
                </span>
              </label>
            </div>

            <label
              className={`flex items-start gap-3 border-4 border-primary px-3 py-2.5 text-xs font-headline uppercase font-black cursor-pointer shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] ${
                voiceConsent ? "bg-[#def3e5] text-primary" : "bg-white text-primary"
              }`}
            >
              <input
                type="checkbox"
                checked={voiceConsent}
                onChange={(e) => {
                  setVoiceConsent(e.target.checked);
                  setSaveVoiceError("");
                }}
                className="mt-0.5"
              />
              <span>I own this voice or have permission to clone it.</span>
            </label>

            <button
              type="submit"
              disabled={isSavingVoice || !newVoiceName.trim() || !newVoiceFile}
              className="w-full h-11 border-4 border-primary bg-[#10b981] hover:bg-[#059669] disabled:bg-[#8a8d93] text-white text-xs font-headline uppercase font-black transition shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
            >
              {isSavingVoice ? "Saving voice..." : "Save to Voice Library"}
            </button>
          </form>
        </article>

        {/* Voices List Display */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-headline font-black text-xl uppercase text-primary">
              Saved Voice Templates ({voices.length})
            </h3>
            {loading && <VoxLoader variant="inline" label="Refreshing..." />}
          </div>

          {voices.length === 0 ? (
            <div className="border-4 border-dashed border-primary bg-white p-10 text-center shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
              <p className="text-sm font-label font-bold uppercase text-primary">No saved voice templates found</p>
              <p className="mt-2 text-xs text-on-surface-variant font-body">
                Upload your first reference audio template on the left panel to save it.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {voices.map((v) => {
                const isPlaying = playingId === v.id;
                const dateObj = new Date(v.createdAt);
                const dateStr = dateObj.toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }).toUpperCase();

                return (
                  <div
                    key={v.id}
                    className="p-4 border-4 border-primary bg-white flex flex-col justify-between space-y-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] transition-all duration-150"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 border-b-2 border-primary pb-2 mb-2">
                        <h4 className="font-headline font-black text-base text-primary truncate" title={v.name}>
                          {v.name}
                        </h4>
                        <span className="shrink-0 px-2 py-0.5 border border-primary text-[9px] font-headline font-black bg-primary-fixed text-primary uppercase">
                          {v.mimeType?.split("/")[1] || "audio"}
                        </span>
                      </div>
                      
                      {v.description ? (
                        <p className="text-xs text-[#4a4a4a] font-body font-semibold min-h-[32px] line-clamp-2">
                          {v.description}
                        </p>
                      ) : (
                        <p className="text-xs text-[#4a4a4a]/40 font-body font-medium italic min-h-[32px]">
                          No description provided.
                        </p>
                      )}

                      <div className="mt-3 space-y-1 border-t border-dashed border-primary/20 pt-2 font-mono text-[9px] text-[#596074]">
                        <p className="truncate">FILE: {v.fileName}</p>
                        <p>SIZE: {(v.fileSize / (1024 * 1024)).toFixed(2)} MB</p>
                        <p>DATE: {dateStr}</p>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t-2 border-primary/20">
                      {/* Play Preview Button */}
                      <button
                        type="button"
                        onClick={() => handlePlayToggle(v.id)}
                        className={`flex-1 h-9 flex items-center justify-center gap-1.5 border-2 border-primary text-[10px] font-headline font-black uppercase shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-colors cursor-pointer ${
                          isPlaying
                            ? "bg-amber-100 text-amber-800"
                            : "bg-[#ffcc00] text-primary hover:bg-[#e6b800]"
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm font-black">
                          {isPlaying ? "pause" : "play_arrow"}
                        </span>
                        {isPlaying ? "Pause Preview" : "Play Preview"}
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteVoice(v.id)}
                        className="w-9 h-9 flex items-center justify-center border-2 border-primary bg-[#ffb3ab] text-primary hover:bg-[#e63b2e] hover:text-white shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-colors cursor-pointer"
                        title="Delete voice template"
                      >
                        <span className="material-symbols-outlined text-sm font-black">delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
