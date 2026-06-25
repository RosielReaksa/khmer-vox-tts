export const DEFAULT_TTS_VOICE_PROMPT = "female";

export const DEFAULT_CLONE_VOICE_INSTRUCTION =
  "same speaker as the reference audio, natural clear speech, consistent tone, smooth pace";

/**
 * Modal VoxCPM2 clone_example voice string. Only used when the operator explicitly
 * sets TTS_CLONE_USE_VOICE_DESCRIPTION=true. With ref_audio, the default is to
 * omit voice entirely (official ref-clone path without spoken style tags).
 */
export const OFFICIAL_VOXCPM2_CLONE_VOICE =
  "same speaker as the reference audio, clear Khmer speech";

const BUILTIN_STYLE_MARKERS = [
  "no emotional exaggeration",
  "same speaker as the reference audio",
  "neutral calm tone",
  "steady even pace",
  "consistent delivery throughout",
  "same timbre and pitch throughout",
];

/** True for empty/default/long style strings that must not be prepended to speakable text. */
export function isBuiltinStyleVoiceDescription(voice: string): boolean {
  const normalized = voice.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === DEFAULT_CLONE_VOICE_INSTRUCTION.toLowerCase()) return true;
  if (normalized === OFFICIAL_VOXCPM2_CLONE_VOICE.toLowerCase()) return true;
  return BUILTIN_STYLE_MARKERS.some((marker) => normalized.includes(marker));
}

export const DASHBOARD_TTS_VOICE_PRESETS = [
  "female",
  "male",
];

export function mapVoiceSafely(voice: string | null | undefined): "male" | "female" {
  if (!voice) return "female";
  const normalized = voice.trim().toLowerCase();
  if (normalized === "male") return "male";
  if (normalized === "female") return "female";

  if (normalized.includes("male") || normalized.includes("piseth") || normalized.includes("dara")) {
    return "male";
  }
  return "female";
}
