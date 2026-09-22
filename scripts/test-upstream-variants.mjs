import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

const outDir = "D:\\website api seller\\test-output\\official-vs-ours";
mkdirSync(outDir, { recursive: true });

// Read .env to get TTS_UPSTREAM_POOL
const envContent = readFileSync("D:\\website api seller\\.env", "utf8");
const poolMatch = envContent.match(/TTS_UPSTREAM_POOL=(.+)/);
if (!poolMatch) { console.error("No TTS_UPSTREAM_POOL"); process.exit(1); }
let poolStr = poolMatch[1].trim().replace(/^['"`]|['"`]$/g, "");
const pool = JSON.parse(poolStr);
const endpoint = pool[0];
console.log("Using endpoint:", endpoint.label);

// Convert reference to 16kHz mono WAV
const refPath = "D:\\website api seller\\public\\voices\\reference_female.wav";
const tmpWav = outDir + "\\_ref-16k.wav";
execSync(`"D:\\website api seller\\node_modules\\ffmpeg-static\\ffmpeg.exe" -hide_banner -loglevel error -y -i "${refPath}" -ac 1 -ar 16000 -sample_fmt s16 -f wav "${tmpWav}"`);
const refBytes = readFileSync(tmpWav);
const refBase64 = refBytes.toString("base64");
console.log("Reference: " + refBytes.length + " bytes");

// Test text (Khmer, ~177 chars from test-clone-official.mjs)
const testText = "សួស្តី នឹងគេហារិការពីលោកអ្នកទាំងអស់គ្នា VoxCPM2! ខ្ញុំសូមណែនាំខ្លួនឯងថាជាអ្នកបកប្រែភាសាខ្មែរដែលមានជំនាញក្នុងការបង្កើតសំលេងភាសាខ្មែរដ៏ល្អឥតខ្ចោះ។ ថ្ងៃនេះខ្ញុំចង់លើកឡើងពី VoxCPM2!";

// The 5 test variants
const variants = [
  {
    label: "A-OFFICIAL",
    desc: "temp=1.0, cfg=2.0, voice=natural clear Khmer, denoise=false",
    payload: { temperature: 1.0, cfg_value: 2.0, voice: "same speaker as the reference audio, natural clear Khmer speech", denoise: false }
  },
  {
    label: "B-OUR-CURRENT",
    desc: "temp=0.7, cfg=2.0, no voice, denoise=true (current production)",
    payload: { temperature: 0.7, cfg_value: 2.0, voice: null, denoise: true }
  },
  {
    label: "C-OUR-1.0-NO-VOICE",
    desc: "temp=1.0, cfg=2.0, no voice, denoise=true",
    payload: { temperature: 1.0, cfg_value: 2.0, voice: null, denoise: true }
  },
  {
    label: "D-OUR-1.0-NO-DENOISE",
    desc: "temp=1.0, cfg=2.0, no voice, denoise=false",
    payload: { temperature: 1.0, cfg_value: 2.0, voice: null, denoise: false }
  },
  {
    label: "E-OFFICIAL-WITH-DENOISE",
    desc: "temp=1.0, cfg=2.0, voice=natural clear Khmer, denoise=true",
    payload: { temperature: 1.0, cfg_value: 2.0, voice: "same speaker as the reference audio, natural clear Khmer speech", denoise: true }
  }
];

async function runOne(variant) {
  const payload = {
    model: "voxcpm2",
    input: testText,
    response_format: "wav",
    max_generate_length: 2000,
    ref_audio_wav_base64: refBase64,
    ref_audio_wav_format: "wav",
  };
  // Merge in variant settings
  Object.assign(payload, variant.payload);
  if (payload.voice === null) delete payload.voice;

  console.log("\n--- " + variant.label + " ---");
  console.log("    " + variant.desc);
  console.log("    Sending...");

  const start = Date.now();
  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + endpoint.token,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000),
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log("    Response: " + res.status + " in " + elapsed + "s");
    if (!res.ok) {
      const err = await res.text();
      console.log("    ERROR: " + err.slice(0, 200));
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const outPath = outDir + "\\" + variant.label + ".wav";
    writeFileSync(outPath, buf);
    console.log("    Saved: " + outPath + " (" + buf.length + " bytes)");
    return outPath;
  } catch (e) {
    console.log("    EXCEPTION: " + e.message);
    return null;
  }
}

// Run all variants sequentially (single Modal endpoint, 5 requests)
(async () => {
  for (const v of variants) {
    await runOne(v);
  }
  console.log("\n=== All variants complete ===");
  console.log("Run measure-spectral.mjs to compare them.");
})();
