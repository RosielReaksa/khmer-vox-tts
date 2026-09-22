import { execSync } from "node:child_process";

const original = execSync(
  "git show 035b88e:app/app/dashboard/key-manager.tsx",
  { encoding: "buffer" }
);
const text = original.toString("utf8");
const lines = text.split(/\r?\n/);

// L347: show the actual characters
const line = lines[346];
console.log("L347 chars:");
for (let i = 0; i < line.length; i++) {
  const code = line.charCodeAt(i);
  console.log(`  [${i}] U+${code.toString(16).toUpperCase().padStart(4, "0")} (${line[i]})`);
}
console.log("\nFull line:", line);
