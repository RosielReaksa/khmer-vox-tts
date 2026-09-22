import { readFileSync } from "node:fs";
const c = readFileSync("D:\\website api seller\\PROJECT_MEMORY.md", "utf8");
const lines = c.split("\n");
const mojibakeRe = /ÃƒÆ|Ã†|Ã¢Ã/g;
const mojibakeLines = [];
for (let i = 0; i < lines.length; i++) {
  if (mojibakeRe.test(lines[i])) {
    mojibakeLines.push({ num: i + 1, text: lines[i].substring(0, 80) });
  }
}
console.log("Total mojibake lines:", mojibakeLines.length);
console.log("First 5:", JSON.stringify(mojibakeLines.slice(0, 5), null, 2));
console.log("Last 5:", JSON.stringify(mojibakeLines.slice(-5), null, 2));

// Check if the new section is clean
const newSectionStart = lines.findIndex(l => l.startsWith("## UI text corruption"));
console.log("\nNew section starts at L" + (newSectionStart + 1));
let inSection = false;
let sectionMojibake = 0;
for (let i = 0; i < lines.length; i++) {
  if (i === newSectionStart) inSection = true;
  if (inSection && lines[i].startsWith("## ") && i > newSectionStart) break;
  if (inSection && mojibakeRe.test(lines[i])) sectionMojibake++;
}
console.log("Mojibake lines in new section:", sectionMojibake);
