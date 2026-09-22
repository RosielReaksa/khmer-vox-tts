import { readFileSync } from "node:fs";
const p = "D:\\website api seller\\app\\app\\dashboard\\speech-workspace.tsx";
const c = readFileSync(p, "utf8");
const lines = c.split("\n");
const line1596 = lines[1595]; // 0-indexed

console.log("L1596 raw:", JSON.stringify(line1596));
console.log("");
console.log("L1596 chars:");
for (let i = 0; i < line1596.length; i++) {
  const code = line1596.charCodeAt(i);
  if (code > 127 || line1596[i] === '"' || line1596[i] === "—") {
    console.log(`  [${i}] U+${code.toString(16).toUpperCase().padStart(4, "0")} (${line1596[i]})`);
  }
}
