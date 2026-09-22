import { readFileSync } from "node:fs";
const p = "D:\\website api seller\\app\\app\\dashboard\\speech-workspace.tsx";
const c = readFileSync(p, "utf8");
const lines = c.split("\n");
// Check the Reference voice line indentation
const idx = lines.findIndex(l => l.includes("Reference voice</span>"));
console.log("Reference voice line:", JSON.stringify(lines[idx]));
// Check if it has a leading space and what the indentation is
const match = lines[idx].match(/^(\s+)/);
console.log("Indentation prefix:", JSON.stringify(match[1]));
console.log("Char codes of first 10 chars:", Array.from(lines[idx].substring(0, 10)).map(c => c.charCodeAt(0).toString(16).padStart(4, "0")).join(" "));
