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

const testText = "សួស្តី នឹងគេហារិការពីលោកអ្នកទាំងអស់គ្នា VoxCPM2! ខ្ញុំសូមណែនាំខ្លួនឯងថាជាអ្នកបកប្រែភាសាខ្មែរដែលមានជំនាញក្នុងការបង្កើតសំលេងភាសាខ្មែរដ៏ល្អឥតខ្ចោះ។ ថ្ងៃនេះខ្ញុំចង់លើកឡើងពី VoxCPM2!";

// F: NEW DEFAULT - temp=1.0, no voice, denoise=true (matching new code defaults)
const payload = {
  model: "voxcpm2",
  input: testText,
  response_format: "wav",
  max_generate_length: 2000,
  ref_audio_wav_base64: refBase64,
  ref_audio_wav_format: "wav",
  temperature: 1.0,
  cfg_value: 2.0,
  denoise: true,
  // NO voice description
};

console.log("Sending F-NEW-DEFAULT...");
const start = Date.now();
const res = await fetch(endpoint.url, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer " + endpoint.token },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(180000),
});
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log("Response: " + res.status + " in " + elapsed + "s");
if (!res.ok) {
  console.log("ERROR:", (await res.text()).slice(0, 300));
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
const outPath = outDir + "\\F-NEW-DEFAULT-temp1.0.wav";
writeFileSync(outPath, buf);
console.log("Saved: " + outPath + " (" + buf.length + " bytes)");
