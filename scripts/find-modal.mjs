import { readFileSync } from "node:fs";
const p = "D:\\website api seller\\app\\app\\dashboard\\speech-workspace.tsx";
const content = readFileSync(p, "utf8");
const lines = content.split("\n");

// Show L1190-1240 (instructions modal area)
for (let i = 1190; i < 1240; i++) {
  console.log(`L${i+1}: ${lines[i].trim().substring(0, 200)}`);
}
