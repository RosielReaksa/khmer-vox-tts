import { readFileSync } from "node:fs";

// Use a wide regex for emoji ranges
const emojiRe = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu;

function count(path) {
  const content = readFileSync(path, "utf8");
  const matches = content.match(emojiRe);
  const corrupted = content.includes("ÃƒÆ");
  return {
    path,
    emojis: matches ? matches.length : 0,
    corrupted,
    sample: matches ? matches.slice(0, 10).join(" ") : "none",
  };
}

const files = [
  "D:\\website api seller\\app\\app\\dashboard\\key-manager.tsx",
  "D:\\website api seller\\app\\app\\dashboard\\speech-workspace.tsx",
  "D:\\website api seller\\app\\app\\dashboard\\workspace-persistence.ts",
  "D:\\website api seller\\app\\app\\dashboard\\workspace-persistence.test.ts",
];

for (const f of files) {
  const r = count(f);
  console.log(`${f.split(/[\\\\/]/).pop()}: emojis=${r.emojis}, corrupted=${r.corrupted}`);
  if (r.emojis > 0) console.log(`  sample: ${r.sample}`);
}
