import { readFileSync, writeFileSync } from "node:fs";
const apiKey = readFileSync("D:\\website api seller\\test-output\\seed-key.txt", "utf8").trim();

// Same text as the user's original problem sample (short Khmer sentence)
const text = "សួស្តី នឹងគេហារិការពីលោកអ្នកទាំងអស់គ្នា VoxCPM2! ខ្ញុំសូមណែនាំខ្លួនឯងថាជាអ្នកបកប្រែភាសាខ្មែរដែលមានជំនាញក្នុងការបង្កើតសំលេងភាសាខ្មែរដ៏ល្អឥតខ្ចោះ។ ថ្ងៃនេះខ្ញុំចង់លើកឡើងពី VoxCPM2!";

console.log("Calling production voxtts.online after TTS_OUTPUT_DENOISE=false...");
const start = Date.now();
const res = await fetch("https://voxtts.online/api/v1/audio/speech", {
  method: "POST",
  headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "voxcpm2", input: text, voice: "female", response_format: "wav" }),
  signal: AbortSignal.timeout(300000),
});
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log("Response: " + res.status + " in " + elapsed + "s");
if (!res.ok) {
  console.log("ERROR:", (await res.text()).slice(0, 500));
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
const outPath = "D:\\website api seller\\test-output\\official-vs-ours\\WEBSITE-FINAL-no-denoise.wav";
writeFileSync(outPath, buf);
console.log("Saved: " + outPath);
console.log("Size: " + buf.length + " bytes");

