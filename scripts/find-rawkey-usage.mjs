import { execSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

// Login first by hitting the dashboard pages with the existing API key approach won't work.
// Let's try a different angle: use curl to inspect the actual response and see if there's
// something the browser sees differently.

// Actually, let me just check the key-manager.tsx code for a SUBTLE bug.
// Let me look at the full createKey flow including the auth wrapper.

const path = "D:\\website api seller\\app\\app\\dashboard\\key-manager.tsx";
const content = readFileSync(path, "utf8");

// Search for any place that might clear rawKey accidentally
const lines = content.split("\n");
let count = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("setRawKey(") || lines[i].includes("rawKey =")) {
    console.log(`L${i+1}: ${lines[i].trim()}`);
    count++;
  }
}
console.log(`\nTotal setRawKey references: ${count}`);
