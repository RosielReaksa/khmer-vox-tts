import { readFileSync, writeFileSync } from "node:fs";

const p = "D:\\website api seller\\app\\app\\dashboard\\key-manager.tsx";
const content = readFileSync(p, "utf8");

// These are common mojibake patterns:
// ÃƒÆ -> UTF-8 byte 0xC3 0x83 0xC6 0x92 which is U+FFFD U+0192 (replacement char + Latin)
// The most common cause is: an emoji was encoded as UTF-8, then re-decoded as Latin-1, then re-encoded as UTF-8.

// Find all the corrupted patterns and try to identify the original characters
const lines = content.split("\n");
const corruptedLines = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("ÃƒÆ") || lines[i].includes("Ã†") || lines[i].includes("Ã¢Ã")) {
    corruptedLines.push({ num: i + 1, text: lines[i].trim() });
  }
}

// Print just the corrupted text to analyze
for (const c of corruptedLines) {
  // Extract just the mojibake part (before < tags)
  const match = c.text.match(/^(.*?)(?=<|$)/);
  const prefix = match ? match[1] : c.text;
  if (prefix.length > 0) {
    console.log(`L${c.num}: [${prefix.substring(0, 100)}...]`);
  }
}

// Try to decode the mojibake: treat the corrupted bytes as UTF-8 then Latin-1 then UTF-8
// Pattern: "ÃƒÆ'Ãƒâ€šÃ‚Â¦" - this looks like the UTF-8 of an emoji mis-decoded
console.log("\n=== Trying to decode the mojibake ===");

function tryDecode(s) {
  // The pattern is UTF-8 bytes interpreted as Latin-1 then re-encoded as UTF-8
  // To recover: take the bytes, decode as Latin-1, get a string, encode that as UTF-8, then decode as UTF-8
  try {
    const buf = Buffer.from(s, "utf8");
    const latin1 = buf.toString("latin1");
    const back = Buffer.from(latin1, "utf8");
    const result = back.toString("utf8");
    return result;
  } catch (e) {
    return s;
  }
}

for (const c of corruptedLines) {
  const prefix = c.text.match(/^(.*?)(?=<)/)?.[1] || c.text;
  if (prefix.includes("ÃƒÆ") || prefix.includes("Ã†")) {
    const decoded = tryDecode(prefix.substring(0, 50));
    console.log(`L${c.num}: "${prefix.substring(0, 50)}" -> "${decoded}"`);
  }
}
