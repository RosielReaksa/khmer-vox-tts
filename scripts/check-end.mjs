import { readFileSync } from "node:fs";
const c = readFileSync("D:\\website api seller\\lib\\tts-provider.ts", "utf8");

// Find any non-ASCII characters in the file
const nonAscii = [];
for (let i = 0; i < c.length; i++) {
  const code = c.charCodeAt(i);
  if (code > 127) {
    const line = c.slice(0, i).split("\n").length;
    nonAscii.push({ line, char: c[i], code, ctx: c.slice(Math.max(0, i - 20), i + 20) });
  }
}
console.log("Non-ASCII char count:", nonAscii.length);
if (nonAscii.length < 50) {
  for (const n of nonAscii) console.log(`L${n.line}: code=${n.code} char=${JSON.stringify(n.char)} ctx=${JSON.stringify(n.ctx)}`);
}
