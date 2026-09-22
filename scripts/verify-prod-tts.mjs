import { readFileSync, writeFileSync } from "node:fs";
const envContent = readFileSync("D:\\website api seller\\.env", "utf8");
const poolMatch = envContent.match(/TTS_UPSTREAM_POOL=(.+)/);
let poolStr = poolMatch[1].trim().replace(/^['"`]|['"`]$/g, "");
const pool = JSON.parse(poolStr);
const endpoint = pool[0];

const refBytes = readFileSync("D:\\website api seller\\test-output\\official-vs-ours\\_ref-16k.wav");
const refBase64 = refBytes.toString("base64");

const payload = {
  model: "voxcpm2",
  input: "សួស្តី! ខ្ញុំជាអ្នកបង្កើតសំលេងភាសាខ្មែរ។ ថ្ងៃនេះខ្ញុំនឹងសាកល្បងសំលេងថ្មីរបស់ខ្ញុំ។",
  response_format: "wav",
  max_generate_length: 2000,
  ref_audio_wav_base64: refBase64,
  ref_audio_wav_format: "wav",
  temperature: 1.0,
  cfg_value: 2.0,
  denoise: true,
};

const start = Date.now();
const res = await fetch(endpoint.url, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer " + endpoint.token },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(180000),
});
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log("Modal responded: " + res.status + " in " + elapsed + "s");
if (!res.ok) {
  console.log("ERROR:", (await res.text()).slice(0, 300));
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
const outPath = "D:\\website api seller\\test-output\\official-vs-ours\\PROD-AFTER-DEPLOY.wav";
writeFileSync(outPath, buf);
console.log("Saved: " + outPath);
console.log("Size: " + buf.length + " bytes  Duration: " + (buf.length/(24000*2)).toFixed(2) + "s");
