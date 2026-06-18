export const DEFAULT_TTS_VOICE_PROMPT = "female";

export const DEFAULT_CLONE_VOICE_INSTRUCTION =
  "same speaker as the reference audio, natural clear speech, consistent tone, smooth pace";

export const DASHBOARD_TTS_VOICE_PRESETS = [
  "female",
  "male",
];

export function mapVoiceSafely(voice: string | null | undefined): "male" | "female" {
  if (!voice) return "female";
  const normalized = voice.trim().toLowerCase();
  if (normalized === "male") return "male";
  if (normalized === "female") return "female";

  // Map legacy preset names or keywords
  if (normalized.includes("male") || normalized.includes("piseth") || normalized.includes("dara")) {
    return "male";
  }
  // Default to female for other presets (maly, sokha, natural khmer speech, etc.)
  return "female";
}
