export const VOICE_CLONE_CONSENT_TEXT =
  "I confirm I own this voice sample or have explicit permission to use it for voice cloning.";

export function isVoiceCloneConsentAccepted(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return ["true", "1", "yes", "on", "accepted"].includes(value.trim().toLowerCase());
}
