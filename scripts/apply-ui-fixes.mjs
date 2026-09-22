import { readFileSync, writeFileSync } from "node:fs";

const p = "D:\\website api seller\\app\\app\\dashboard\\speech-workspace.tsx";
let c = readFileSync(p, "utf8");

const CRLF = c.includes("\r\n") ? "\r\n" : "\n";

// === FIX 1: StatusStep — replace unicode checkmarks with inline SVGs ===
// Find the original StatusStep function and replace just the inner span
const oldCheckmark = `{done ? "✓" : "✗"}`;
const newCheckmark = [
  `{done ? (`,
  `  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">`,
  `    <polyline points="5 12 10 17 19 7" />`,
  `  </svg>`,
  `) : (`,
  `  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">`,
  `    <line x1="6" y1="6" x2="18" y2="18" />`,
  `    <line x1="6" y1="18" x2="18" y2="6" />`,
  `  </svg>`,
  `)}`,
].join("\n");

if (!c.includes(oldCheckmark)) {
  console.error("ERROR: oldCheckmark not found");
  process.exit(1);
}
c = c.replace(oldCheckmark, newCheckmark);
console.log("FIX 1: StatusStep now uses inline SVGs");

// === FIX 2: h1 title clipping ===
const oldH1 = '<h1 className="mt-4 font-headline font-black text-3xl md:text-4xl uppercase tracking-tight text-primary">{title}</h1>';
const newH1 = '<h1 className="mt-4 pb-2 font-headline font-black text-3xl md:text-4xl uppercase leading-[1.15] tracking-tight text-primary">{title}</h1>';

if (!c.includes(oldH1)) {
  console.error("ERROR: oldH1 not found");
  process.exit(1);
}
c = c.replace(oldH1, newH1);
console.log("FIX 2: h1 title has line-height + bottom padding");

// === FIX 3: section bottom padding ===
const oldSection = '<section className="dashboard-enter grid w-full min-w-0 gap-5 pb-12 text-[#1a1a1a]">';
const newSection = '<section className="dashboard-enter grid w-full min-w-0 gap-5 pb-20 text-[#1a1a1a]">';

if (!c.includes(oldSection)) {
  console.error("ERROR: oldSection not found");
  process.exit(1);
}
c = c.replace(oldSection, newSection);
console.log("FIX 3: section has increased bottom padding (pb-20)");

writeFileSync(p, c);
console.log("Saved!");