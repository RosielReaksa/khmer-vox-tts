import { readFileSync } from "node:fs";
const c = readFileSync("D:\\website api seller\\lib\\tts-provider.ts", "utf8");
const target = "  const normalized = await normalizeOutputLoudness(denoised);";
let idx = 0;
let i = 0;
while ((i = c.indexOf(target, idx)) >= 0) {
  const line = c.slice(0, i).split("\n").length;
  console.log("Found at L" + line);
  // Show context
  console.log("  " + c.slice(Math.max(0, i - 80), i).split("\n").pop());
  console.log("  > " + c.slice(i, i + target.length));
  console.log("  " + c.slice(i + target.length, i + target.length + 80).split("\n")[0]);
  idx = i + target.length;
}
