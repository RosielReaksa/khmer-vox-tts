import { readFileSync } from "node:fs";

const content = readFileSync(
  "D:\\website api seller\\app\\app\\dashboard\\key-manager.tsx",
  "utf8"
);
const lines = content.split("\n");

// Print the bytes of the corrupted prefix in L360
const line360 = lines[359];
const match = line360.match(/^(\s+)(ÃƒÆ[\s\S]+?)\s+Copy this API key now/);
if (match) {
  console.log("L360 corrupted prefix bytes:");
  const prefix = match[2];
  for (let i = 0; i < prefix.length; i++) {
    const code = prefix.charCodeAt(i);
    console.log(`  [${i}] U+${code.toString(16).toUpperCase().padStart(4, "0")} (${prefix[i]})`);
  }
  console.log("\nDecoded as Latin-1 then UTF-8...");
  const buf = Buffer.from(prefix, "utf8");
  const latin1 = buf.toString("latin1");
  console.log("Latin-1:", latin1);
  const back = Buffer.from(latin1, "utf8").toString("utf8");
  console.log("UTF-8:", back);
}
