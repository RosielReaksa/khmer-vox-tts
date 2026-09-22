import { readFileSync } from "node:fs";

function inspect(path) {
  try {
    const buf = readFileSync(path);
    let dataOffset = -1, dataSize = 0;
    for (let i = 12; i + 8 < buf.length; i++) {
      if (buf.toString("ascii", i, i + 4) === "data") {
        dataOffset = i + 8;
        dataSize = buf.readUInt32LE(i + 4);
        if (dataSize > buf.length - dataOffset) dataSize = buf.length - dataOffset;
        break;
      }
    }
    const sampleRate = buf.readUInt32LE(24);
    const channels = buf.readUInt16LE(22);
    const bits = buf.readUInt16LE(34);
    const duration = dataSize / (sampleRate * channels * (bits / 8));
    return { path, duration: duration.toFixed(2), sampleRate, channels, bits, size: buf.length };
  } catch (e) {
    return { path, error: e.message };
  }
}

const files = [
  ["USER BAD SAMPLE", "D:\\ads testss\\voxtts-tts-33619e91-ab5f-4084-9f42-5bcaa74a53d8 (1).wav"],
  ["", "--- official-vs-ours (the A/B test that proved temp=1.0 is the fix) ---"],
  ["A-OFFICIAL (user said sounded good)", "D:\\website api seller\\test-output\\official-vs-ours\\A-OFFICIAL.wav"],
  ["B-OUR-CURRENT (temp=0.7, current prod)", "D:\\website api seller\\test-output\\official-vs-ours\\B-OUR-CURRENT.wav"],
  ["F-NEW-DEFAULT (temp=1.0, the fix)", "D:\\website api seller\\test-output\\official-vs-ours\\F-NEW-DEFAULT-temp1.0.wav"],
];

console.log("\n=== Listening files for the closed-nose fix ===\n");
for (const [label, path] of files) {
  if (label.startsWith("---")) {
    console.log("\n" + label);
    continue;
  }
  const r = inspect(path);
  const fname = path.split(/[\\/]/).pop();
  console.log(label);
  console.log("  File: " + fname);
  console.log("  Duration: " + r.duration + "s   SR: " + r.sampleRate + "   Ch: " + r.channels + "   Bits: " + r.bits);
  console.log("");
}
