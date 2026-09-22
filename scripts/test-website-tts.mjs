import { readFileSync, writeFileSync } from "node:fs";
const apiKey = readFileSync("D:\\website api seller\\test-output\\seed-key.txt", "utf8").trim();

const text = "សួស្តី នឹងគេហារិការពីលោកអ្នកទាំងអស់គ្នា VoxCPM2! ខ្ញុំសូមណែនាំខ្លួនឯងថាជាអ្នកបកប្រែភាសាខ្មែរដែលមានជំនាញក្នុងការបង្កើតសំលេងភាសាខ្មែរដ៏ល្អឥតខ្ចោះ។ ថ្ងៃនេះខ្ញុំចង់លើកឡើងពី VoxCPM2!";
console.log("Calling production voxtts.online with API key...");
console.log("Text:", text.length, "chars");
console.log("URL: https://voxtts.online/api/v1/audio/speech");

const start = Date.now();
try {
  const res = await fetch("https://voxtts.online/api/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "voxcpm2",
      input: text,
      voice: "female",
      response_format: "wav",
    }),
    signal: AbortSignal.timeout(120000),
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log("Response: " + res.status + " in " + elapsed + "s");
  console.log("Content-Type:", res.headers.get("content-type"));
  
  if (!res.ok) {
    const errText = await res.text();
    console.log("ERROR:", errText.slice(0, 500));
    process.exit(1);
  }
  
  const buf = Buffer.from(await res.arrayBuffer());
  console.log("Audio size:", buf.length, "bytes");
  
  // Save it
  const outPath = "D:\\website api seller\\test-output\\official-vs-ours\\WEBSITE-AFTER-DEPLOY.wav";
  writeFileSync(outPath, buf);
  console.log("Saved:", outPath);
  
  // Detect audio format
  const header = buf.toString("ascii", 0, 4);
  if (header === "RIFF") {
    const sampleRate = buf.readUInt32LE(24);
    const channels = buf.readUInt16LE(22);
    const bits = buf.readUInt16LE(34);
    const dataOffset = 44;
    const dataSize = buf.length - dataOffset;
    const duration = dataSize / (sampleRate * channels * (bits / 8));
    console.log("Format: WAV, SR:", sampleRate, "Ch:", channels, "Bits:", bits);
    console.log("Duration:", duration.toFixed(2), "s");
  } else if (header === "ID3" || (buf[0] == 0xFF && (buf[1] & 0xE0) == 0xE0)) {
    console.log("Format: MP3");
    console.log("Size:", buf.length, "bytes");
  }
} catch (e) {
  console.error("EXCEPTION:", e.message);
  process.exit(1);
}
