import { readFileSync, writeFileSync } from "node:fs";

const p = "D:\\website api seller\\lib\\tts-provider.ts";
let c = readFileSync(p, "utf8");

// EDIT 1: Insert deNarrowVoice call in dashboard path.
// Find the dashboard function. The exact lines in the dashboard path are:
//   const merged = concatPcm16WavBuffers(volumeNormalizedSegments);
//   const depaused = await capLongPauses(merged);
//   const denoised = await reduceOutputNoise(depaused);
//   const normalized = await normalizeOutputLoudness(denoised);
//   const paced = await applyOutputTempo(normalized, mode);
// This is unique because volumeNormalizedSegments only appears in the dashboard path.
// (The batch path uses publicSegments / mergedBytes.)

const oldDash = `  const merged = concatPcm16WavBuffers(volumeNormalizedSegments);
  const depaused = await capLongPauses(merged);
  const denoised = await reduceOutputNoise(depaused);
  const normalized = await normalizeOutputLoudness(denoised);
  const paced = await applyOutputTempo(normalized, mode);`;

const newDash = `  const merged = concatPcm16WavBuffers(volumeNormalizedSegments);
  const depaused = await capLongPauses(merged);
  const denoised = await reduceOutputNoise(depaused);
  // 2026-06-27: open up VoxCPM2 nasal / "closed-nose" coloration before loudnorm
  // so the compressor + EQ see a natural spectrum. Mirrors the batch path;
  // deNarrowVoice was added in 9fe8e93 but only wired into the worker batch path,
  // leaving dashboard / single-segment generations nasal.
  const denarrowed = await deNarrowVoice(denoised);
  const normalized = await normalizeOutputLoudness(denarrowed);
  const paced = await applyOutputTempo(normalized, mode);`;

if (!c.includes(oldDash)) {
  console.log("ERROR: dashboard chain not found");
  process.exit(1);
}
if (c.includes(newDash)) {
  console.log("ERROR: dashboard already wired");
  process.exit(1);
}
c = c.replace(oldDash, newDash);
console.log("EDIT 1: dashboard wired");

// EDIT 2: Replace the deNarrowVoice function with Option B
const oldFnStart = "// 2026-06-26: voice clarity / de-narrow filter. VoxCPM2 ref-clone output has a";
const oldFnStartIdx = c.indexOf(oldFnStart);
if (oldFnStartIdx < 0) {
  console.log("ERROR: old deNarrowVoice header not found");
  process.exit(1);
}
const nextFnIdx = c.indexOf("async function normalizeOutputLoudness", oldFnStartIdx);
const between = c.slice(oldFnStartIdx, nextFnIdx);
const lastBraceRel = between.lastIndexOf("\n}");
if (lastBraceRel < 0) {
  console.log("ERROR: function end not found");
  process.exit(1);
}
const oldFnEndIdx = oldFnStartIdx + lastBraceRel + 2;

const newFn = `// 2026-06-27: voice clarity / de-narrow filter (Option B). VoxCPM2 ref-clone output
// has a resonant build-up around 800-2500 Hz (nasal / "honk" zone) and very little
// energy above 4 kHz, which makes the voice sound like the speaker is talking with a
// pinched / closed nose. This filter CUTS the nasal zone and BOOSTS the missing top
// end (clarity / air) to bring the spectrum back toward natural speech.
//
// Pipeline (each EQ band can be scaled or disabled via env):
//   - highpass f=120:     cuts sub-vocal rumble from clone refs
//   - lowshelf  f=300:    pulls down fundamental warmth (reduces boom)
//   - EQ -3dB @ 1000:     dips the upper-nasal / honk band
//   - EQ -4dB @ 1800:     dips the lower-nasal / honk band
//   - highshelf +8dB @ 3000:  adds presence (where VoxCPM2 is weak)
//   - highshelf +6dB @ 6000:  adds air / sibilance
//   - acompressor thr=-22 dB ratio=3: smooths per-syllable peaks
//   - volume +1.5 dB:     compensates for EQ headroom (loudnorm still hits -16 LUFS)
//
// All EQ gains are tunable via env (dB). Set TTS_OUTPUT_CLARITY_STRENGTH=0 to bypass
// EQ entirely (still applies highpass + compressor + volume), or =1.0 for the defaults
// above, or up to 2.0 for a more aggressive open sound. Operators with already-bright
// clone references can dial strength <1.0 to soften the effect.
//
// Disabled with TTS_OUTPUT_DE_NARROW=false (skips the whole filter).
async function deNarrowVoice(bytes: Uint8Array): Promise<Uint8Array> {
  if (!readBooleanEnv("TTS_OUTPUT_DE_NARROW", true)) {
    return bytes;
  }
  try {
    const sampleRate = readCanonicalGeneratedSampleRate();
    const strength = readNumericEnv("TTS_OUTPUT_CLARITY_STRENGTH", 1.0, 0, 2);
    const nasalCut  = readNumericEnv("TTS_OUTPUT_CLARITY_NASAL_CUT_DB", -3, -12, 0);
    const honkCut   = readNumericEnv("TTS_OUTPUT_CLARITY_HONK_CUT_DB",  -4, -12, 0);
    const lowCut    = readNumericEnv("TTS_OUTPUT_CLARITY_LOW_CUT_DB",   -4, -12, 0);
    const presence  = readNumericEnv("TTS_OUTPUT_CLARITY_PRESENCE_DB",   8,   0, 18);
    const air       = readNumericEnv("TTS_OUTPUT_CLARITY_AIR_DB",        6,   0, 18);
    const scale = (g: number) => +(g * strength).toFixed(2);
    const filter = [
      "highpass=f=120",
      \`lowshelf=f=300:g=\${scale(lowCut)}\`,
      \`equalizer=f=1000:width_type=q:w=1.5:g=\${scale(nasalCut)}\`,
      \`equalizer=f=1800:width_type=q:w=1.5:g=\${scale(honkCut)}\`,
      \`highshelf=f=3000:g=\${scale(presence)}\`,
      \`highshelf=f=6000:g=\${scale(air)}\`,
      "acompressor=threshold=-22dB:ratio=3:attack=10:release=200",
      "volume=1.5",
    ].join(",");
    const output = await runFfmpeg(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-af",
        filter,
        "-ac",
        "1",
        "-ar",
        String(sampleRate),
        "-codec:a",
        "pcm_s16le",
        "-sample_fmt",
        "s16",
        "-f",
        "wav",
        "pipe:1",
      ],
      bytes,
    );
    return output.byteLength > 0 ? output : bytes;
  } catch {
    // De-narrowing is a finishing touch; never fail delivery over it.
    return bytes;
  }
}
`;

c = c.slice(0, oldFnStartIdx) + newFn + c.slice(oldFnEndIdx);
console.log("EDIT 2: deNarrowVoice replaced with Option B");

writeFileSync(p, c);
console.log("Saved");
