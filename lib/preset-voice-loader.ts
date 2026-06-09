import "server-only";

import { readFile } from "fs/promises";
import { join } from "path";

let cachedMaleVoice: Uint8Array | null = null;
let cachedFemaleVoice: Uint8Array | null = null;

export async function getPresetVoiceBytes(voice: "male" | "female"): Promise<Uint8Array> {
  if (voice === "male") {
    if (!cachedMaleVoice) {
      const filePath = join(/*turbopackIgnore: true*/ process.cwd(), "lib", "preset-voices", "reference_male.wav");
      cachedMaleVoice = new Uint8Array(await readFile(/*turbopackIgnore: true*/ filePath));
    }
    return cachedMaleVoice;
  }

  if (!cachedFemaleVoice) {
    const filePath = join(/*turbopackIgnore: true*/ process.cwd(), "lib", "preset-voices", "reference_female.wav");
    cachedFemaleVoice = new Uint8Array(await readFile(/*turbopackIgnore: true*/ filePath));
  }
  return cachedFemaleVoice;
}
