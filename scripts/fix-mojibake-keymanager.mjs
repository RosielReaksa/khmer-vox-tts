import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

// Read the PREVIOUS commit (035b88e) version - this had clean emojis
const original = execSync(
  "git show 035b88e:app/app/dashboard/key-manager.tsx",
  { encoding: "utf8" }
);

// Read CURRENT (corrupted) version
const current = readFileSync(
  "D:\\website api seller\\app\\app\\dashboard\\key-manager.tsx",
  "utf8"
);

const origLines = original.split(/\r?\n/);
const curLines = current.split(/\r?\n/);

// Find lines with mojibake in current
const mojibakeRe = /ÃƒÆ|Ã†Ã¦|Ã¢Ã/;
const corruptedLineNums = [];
for (let i = 0; i < curLines.length; i++) {
  if (mojibakeRe.test(curLines[i])) {
    corruptedLineNums.push(i);
  }
}
console.log(`Corrupted lines in current: ${corruptedLineNums.join(", ")}`);

// For each corrupted line, find the corresponding line in original and extract the emojis
// Match by structural similarity (same tags before and after the emoji)
const emojiRe = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu;

let fixedCount = 0;
for (const lineNum of corruptedLineNums) {
  const curLine = curLines[lineNum];
  // Find a corresponding line in original that matches structurally
  // Strategy: strip emojis/mojibake from both and compare
  const curStripped = curLine
    .replace(/ÃƒÆ[\u0080-\uFFFFâ€™Ã†â€™Ãƒâ€šÃ‚Â¦¡Â¢Â¬Â¥Â¿â€™Å“Å½â€žâ€\u009dâ€¢Å¡Å“Ã†â€\u009dÃ†â€™â€\u009eÂ»Ã†â€\u009eâ€ºÃ†â€šÃ‚ÂÃ†â€™Å“Ã†Å½Ã†â€šÃ†â€\u009dÃ†â€\u009eÂ¼Ã†â€\u009eÂ¥]+/g, "EMOJI")
    .replace(emojiRe, "EMOJI");
  for (let j = 0; j < origLines.length; j++) {
    const origLine = origLines[j];
    const origStripped = origLine.replace(emojiRe, "EMOJI");
    if (curStripped === origStripped) {
      // Found matching original line. Extract the emojis from it.
      const emojis = origLine.match(emojiRe) || [];
      // Replace the mojibake with the emojis
      let newLine = curLine;
      // Replace each mojibake run with the corresponding emoji
      // Strategy: find the first mojibake and replace with first emoji, etc.
      const mojibakeRun = /Ã[\u0080-\uFFFFâ€™]+|ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢?/g;
      let emojiIdx = 0;
      newLine = curLine.replace(/ÃƒÆ[\s\S]*?(?=[\s<])/g, (match) => {
        const emoji = emojis[emojiIdx++] || "";
        return emoji;
      });
      // For lines with multiple mojibake runs
      if (emojiIdx < emojis.length) {
        // Find each mojibake boundary and replace
        const positions = [];
        const re = /ÃƒÆ[\s\S]+?(?=[\s<])/g;
        let m;
        while ((m = re.exec(curLine)) !== null) {
          positions.push({ start: m.index, end: m.index + m[0].length });
        }
        // Build new line with emojis inserted
        newLine = "";
        let lastEnd = 0;
        for (let p = 0; p < positions.length; p++) {
          newLine += curLine.substring(lastEnd, positions[p].start);
          newLine += emojis[p] || "";
          lastEnd = positions[p].end;
        }
        newLine += curLine.substring(lastEnd);
      }
      curLines[lineNum] = newLine;
      fixedCount++;
      console.log(`L${lineNum + 1}: fixed (matched original L${j + 1}, emojis=${emojis.join("")})`);
      break;
    }
  }
  if (curLines[lineNum] === curLine) {
    console.log(`L${lineNum + 1}: NO MATCH FOUND - manual fix needed`);
  }
}

// Write back
const fixed = curLines.join("\r\n");  // CRLF like PowerShell wrote it
writeFileSync("D:\\website api seller\\app\\app\\dashboard\\key-manager.tsx", fixed);
console.log(`\nFixed ${fixedCount} lines`);
