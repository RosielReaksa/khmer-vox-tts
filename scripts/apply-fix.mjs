import { readFileSync, writeFileSync } from "node:fs";

const p = "D:\\website api seller\\lib\\tts-provider.ts";
let c = readFileSync(p, "utf8");

// Step 1: Apply the small dashboard wiring fix
const target = "  const normalized = await normalizeOutputLoudness(denoised);\n  const paced = await applyOutputTempo(normalized, mode);\n  return {\n    bytes: finalizeDeliveredWav(paced),";
const replacement = `  const normalized = await normalizeOutputLoudness(denoised);

  // 2026-06-27: open up VoxCPM2 nasal / "closed-nose" coloration before
  // loudnorm so the compressor + EQ see a natural spectrum. Mirrors the
  // batch path; deNarrowVoice was added in 9fe8e93 but only wired into the
  // worker batch path, leaving dashboard / single-segment generations nasal.
  const denarrowed = await deNarrowVoice(denoised);
  const normalized = await normalizeOutputLoudness(denarrowed);
  const paced = await applyOutputTempo(normalized, mode);
  return {
    bytes: finalizeDeliveredWav(paced),`;

if (!c.includes(target)) {
  console.log("ERROR: target not found");
  process.exit(1);
}
c = c.replace(target, replacement);
console.log("Applied dashboard wiring fix");
writeFileSync(p, c);
