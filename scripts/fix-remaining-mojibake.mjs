import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

// Read the file
let content = readFileSync(
  "D:\\website api seller\\app\\app\\dashboard\\key-manager.tsx",
  "utf8"
);

// Find every remaining mojibake pattern
const lines = content.split("\n");
const mojibakeRe = /ÃƒÆ|Ã†|Ã¢Ã/g;
let lineNum = 0;
for (const line of lines) {
  lineNum++;
  if (mojibakeRe.test(line)) {
    // Get original from git
    const original = execSync(
      "git show 035b88e:app/app/dashboard/key-manager.tsx",
      { encoding: "utf8" }
    );
    const origLines = original.split("\n");
    
    // Strip mojibake from current and find matching original
    const stripped = line.replace(/ÃƒÆ[\s\S]+?(?=[\s<])/g, "EMOJI");
    const emojiRe = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu;
    for (let j = 0; j < origLines.length; j++) {
      const origStripped = origLines[j].replace(emojiRe, "EMOJI");
      if (stripped === origStripped) {
        const emojis = origLines[j].match(emojiRe) || [];
        // Get positions of mojibake runs in the current line
        const re = /ÃƒÆ[\s\S]+?(?=[\s<])/g;
        const positions = [];
        let m;
        while ((m = re.exec(line)) !== null) {
          positions.push({ start: m.index, end: m.index + m[0].length });
        }
        // Build new line
        let newLine = "";
        let lastEnd = 0;
        for (let p = 0; p < positions.length; p++) {
          newLine += line.substring(lastEnd, positions[p].start);
          newLine += emojis[p] || "";
          lastEnd = positions[p].end;
        }
        newLine += line.substring(lastEnd);
        lines[lineNum - 1] = newLine;
        console.log(`L${lineNum}: fixed with [${emojis.join("")}]`);
        break;
      }
    }
  }
}

writeFileSync("D:\\website api seller\\app\\app\\dashboard\\key-manager.tsx", lines.join("\n"));

// Verify
const final = readFileSync("D:\\website api seller\\app\\app\\dashboard\\key-manager.tsx", "utf8");
const remainingMojibake = (final.match(/ÃƒÆ|Ã†|Ã¢Ã/g) || []).length;
const validEmojis = (final.match(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu) || []).length;
console.log(`\nFinal state: mojibake=${remainingMojibake}, emojis=${validEmojis}`);
