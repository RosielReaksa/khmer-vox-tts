import { readFileSync } from "node:fs";
const p = "D:\\website api seller\\app\\app\\dashboard\\speech-workspace.tsx";
const content = readFileSync(p, "utf8");
const lines = content.split("\n");

// Find the outer wrapper class (the main return JSX)
for (let i = 720; i < 740; i++) {
  console.log(`L${i+1}: ${lines[i]}`);
}
console.log("---");
for (let i = 700; i < 728; i++) {
  if (lines[i].includes("className")) {
    console.log(`L${i+1}: ${lines[i].trim().substring(0, 200)}`);
  }
}
