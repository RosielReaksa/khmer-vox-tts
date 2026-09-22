import { execSync } from "node:child_process";

const original = execSync(
  "git show 035b88e:app/app/dashboard/key-manager.tsx",
  { encoding: "buffer" }
);

// Find specific lines around the corrupted sections
const text = original.toString("utf8");
const lines = text.split(/\r?\n/);

// Look at lines 295-296 (Copy this API key)
console.log("=== L295-297 (Copy this API key) ===");
for (let i = 294; i <= 297; i++) {
  console.log(`L${i+1}:`, JSON.stringify(lines[i]));
}

// Look at lines 346-348 (keyPrefix bullets)
console.log("\n=== L346-348 (keyPrefix + bullets) ===");
for (let i = 345; i <= 348; i++) {
  console.log(`L${i+1}:`, JSON.stringify(lines[i]));
}

// Look at lines 349-352 (Created date)
console.log("\n=== L349-352 (Created) ===");
for (let i = 348; i <= 352; i++) {
  console.log(`L${i+1}:`, JSON.stringify(lines[i]));
}
