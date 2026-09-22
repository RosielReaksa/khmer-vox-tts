import { readFileSync } from "node:fs";
const p = "D:\\website api seller\\lib\\tts-provider.ts";
const c = readFileSync(p, "utf8");

const start = c.indexOf("async function deNarrowVoice");
const end = c.indexOf("async function normalizeOutputLoudness", start);
const block = c.slice(start, end);

let open = 0, close = 0;
for (const ch of block) {
  if (ch === "{") open++;
  if (ch === "}") close++;
}
console.log("New deNarrowVoice block:");
console.log("  open {:", open);
console.log("  close }:", close);
console.log("  net:", open - close);
console.log("");

// Also count the L1959 dashboard sync path (after the splice) — my earlier 1-line fix added 4 lines
const dashStart = c.indexOf("export async function mergePublicMp3SegmentsForDelivery");
const dashEnd = c.indexOf("export function splitTextIntoChunks", dashStart);
const dashBlock = c.slice(dashStart, dashEnd);
let dOpen = 0, dClose = 0;
for (const ch of dashBlock) {
  if (ch === "{") dOpen++;
  if (ch === "}") dClose++;
}
console.log("mergePublicMp3SegmentsForDelivery block:");
console.log("  open {:", dOpen);
console.log("  close }:", dClose);
console.log("  net:", dOpen - dClose);
