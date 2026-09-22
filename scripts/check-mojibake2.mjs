import { readFileSync } from "node:fs";

const p = "D:\\website api seller\\app\\app\\dashboard\\speech-workspace.tsx";
const c = readFileSync(p, "utf8");

// Count mojibake patterns
const patterns = ["ÃƒÆ", "Ã†", "Ã¢Ã", "Â·", "âœ\"", "âœ—"];
for (const p of patterns) {
  const count = (c.match(new RegExp(p, "g")) || []).length;
  console.log(`Pattern "${p}": ${count} occurrences`);
}

// Also check for the actual chars
const checkChar = "âœ\"";
const idx = c.indexOf(checkChar);
if (idx >= 0) {
  console.log(`\nFound "${checkChar}" at byte ${idx}`);
  console.log("Context:", JSON.stringify(c.substring(Math.max(0, idx - 50), idx + 100)));
}

const checkChar2 = "✓";
const idx2 = c.indexOf(checkChar2);
if (idx2 >= 0) {
  console.log(`\nFound "${checkChar2}" at byte ${idx2}`);
  console.log("Context:", JSON.stringify(c.substring(Math.max(0, idx2 - 50), idx2 + 50)));
}
