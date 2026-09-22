import { readFileSync, writeFileSync } from "node:fs";

const p = "D:\\website api seller\\lib\\tts-provider.ts";
let c = readFileSync(p, "utf8");

// Revert my mess
writeFileSync(p, c); // current state kept for inspection

// Approach: find each occurrence and process one at a time
// First, find the dashboard function: it's the one in mergePublicMp3SegmentsForDelivery
const dashFnStart = c.indexOf("export async function mergePublicMp3SegmentsForDelivery");
const dashFnEnd = c.indexOf("export function splitTextIntoChunks", dashFnStart);
const dashFn = c.slice(dashFnStart, dashFnEnd);

console.log("Dashboard function current state:");
const idxInDash = dashFn.indexOf("normalizeOutputLoudness(denoised)");
console.log("'normalizeOutputLoudness(denoised)' found at offset", idxInDash, "within function");

// Show the surrounding 200 chars
console.log("\nContext:");
console.log("---");
console.log(dashFn.slice(Math.max(0, idxInDash - 200), idxInDash + 200));
console.log("---");
