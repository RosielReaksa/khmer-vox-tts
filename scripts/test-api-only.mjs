import { readFileSync, writeFileSync } from "node:fs";
const apiKey = readFileSync("D:\\website api seller\\test-output\\seed-key.txt", "utf8").trim();
const text = "សួស្តី នឹងគេហារិការពីលោកអ្នកទាំងអស់គ្នា VoxCPM2! ខ្ញុំសូមណែនាំខ្លួនឯងថាជាអ្នកបកប្រែភាសាខ្មែរដែលមានជំនាញក្នុងការបង្កើតសំលេងភាសាខ្មែរដ៏ល្អឥតខ្ចោះ។ ថ្ងៃនេះខ្ញុំចង់លើកឡើងពី VoxCPM2!";

console.log("=== Test 1: /api/v1/audio/speech (API path - has deNarrow) ===");
const start1 = Date.now();
const r1 = await fetch("https://voxtts.online/api/v1/audio/speech", {
  method: "POST",
  headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "voxcpm2", input: text, voice: "female", response_format: "wav" }),
  signal: AbortSignal.timeout(120000),
});
const buf1 = Buffer.from(await r1.arrayBuffer());
writeFileSync("D:\\website api seller\\test-output\\official-vs-ours\\FINAL-API-SPEECH.wav", buf1);
console.log("Response " + r1.status + " in " + ((Date.now()-start1)/1000).toFixed(1) + "s");
console.log("Size: " + buf1.length + " bytes");
