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

/**
 * Per-request prosody / speaking-style presets. Each preset maps to a
 * (temperature, cfg_value) pair that the upstream VoxCPM2 model uses to
 * shape prosody — without ever sending a spoken-English `voice` string to
 * the model (which would be prepended to the speakable Khmer text).
 *
 * - `normal`  → balanced default (matches TTS_PRESET_TEMPERATURE=0.7).
 * - `calm`    → lower temperature = steadier, slower, more even delivery.
 * - `urgent`  → higher temperature = brisker, more drive.
 * - `excited` → high temperature + lower CFG = more energy with looser
 *               adherence to the reference audio's exact timbre.
 *
 * Operators can override any preset by env (TTS_STYLE_CALM_TEMPERATURE etc.)
 * or override the *default* for new generations with TTS_DEFAULT_STYLE.
 */
export type VoiceStylePreset = "normal" | "calm" | "urgent" | "excited";

export const VOICE_STYLE_PRESETS: Record<
  VoiceStylePreset,
  { temperature: number; cfgValue: number; label: string; description: string }
> = {
  normal: {
    temperature: 0.7,
    cfgValue: 2.0,
    label: "Normal",
    description: "Balanced pace and energy (default).",
  },
  calm: {
    temperature: 0.55,
    cfgValue: 2.0,
    label: "Calm",
    description: "Steadier, even, slightly slower — good for narration.",
  },
  urgent: {
    temperature: 0.85,
    cfgValue: 2.0,
    label: "Urgent",
    description: "Brisker, more drive — good for announcements.",
  },
  excited: {
    temperature: 0.9,
    cfgValue: 1.7,
    label: "Excited",
    description: "Higher energy with looser guidance — good for promos.",
  },
};

export const VOICE_STYLE_IDS: VoiceStylePreset[] = [
  "normal",
  "calm",
  "urgent",
  "excited",
];

export function normalizeVoiceStyle(input: unknown): VoiceStylePreset {
  if (typeof input !== "string") return "normal";
  const normalized = input.trim().toLowerCase();
  if (VOICE_STYLE_IDS.includes(normalized as VoiceStylePreset)) {
    return normalized as VoiceStylePreset;
  }
  return "normal";
}

/**
 * Resolves the effective temperature for a request, given the per-request
 * voice style preset and the operator-configured base temperatures. Style
 * always wins over env (so a user picking "urgent" gets the urgent feel
 * even if TTS_PRESET_TEMPERATURE is set).
 */
export function resolveStyleTemperature(
  style: VoiceStylePreset,
  baseTemperature: number,
): number {
  return VOICE_STYLE_PRESETS[style].temperature ?? baseTemperature;
}

export function resolveStyleCfg(
  style: VoiceStylePreset,
  baseCfg: number,
): number {
  return VOICE_STYLE_PRESETS[style].cfgValue ?? baseCfg;
}

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
