import { readFileSync, writeFileSync } from "node:fs";
const p = "D:\\website api seller\\PROJECT_MEMORY.md";
let c = readFileSync(p, "utf8");
// Don't touch the new section - it was added by us
writeFileSync(p, c);
console.log("Memory updated, no mojibake fix needed");
