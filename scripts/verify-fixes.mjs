// Just confirm the source file has the right content
import { readFileSync } from "node:fs";
const p = "D:\\website api seller\\app\\app\\dashboard\\speech-workspace.tsx";
const c = readFileSync(p, "utf8");

// Check for the SVG code
console.log("SVG checkmark polyline present:", c.includes('<polyline points="5 12 10 17 19 7"'));
console.log("SVG X mark line present:", c.includes('x1="6" y1="6" x2="18" y2="18"'));
console.log("h1 leading-[1.15] present:", c.includes("leading-[1.15]"));
console.log("h1 pb-2 present:", c.includes("mt-4 pb-2 font-headline font-black text-3xl"));
console.log("section pb-20 present:", c.includes("dashboard-enter grid w-full min-w-0 gap-5 pb-20"));
console.log("");
console.log("No mojibake in file:", !c.includes("âœ\"") && !c.includes("ÃƒÆ") && !c.includes("âœ—"));
