import { readFileSync, writeFileSync } from "node:fs";

const p = "D:\\website api seller\\app\\app\\dashboard\\speech-workspace.tsx";
let c = readFileSync(p, "utf8");

// Fix the SVG indentation - it was inserted with 2 spaces instead of 8
const oldSvgBlock = [
  "        {done ? (",
  "  <svg viewBox=\"0 0 24 24\" className=\"h-4 w-4\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"3\" strokeLinecap=\"round\" strokeLinejoin=\"round\" aria-hidden=\"true\">",
  "    <polyline points=\"5 12 10 17 19 7\" />",
  "  </svg>",
  ") : (",
  "  <svg viewBox=\"0 0 24 24\" className=\"h-4 w-4\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"3\" strokeLinecap=\"round\" strokeLinejoin=\"round\" aria-hidden=\"true\">",
  "    <line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\" />",
  "    <line x1=\"6\" y1=\"18\" x2=\"18\" y2=\"6\" />",
  "  </svg>",
  ")}",
].join("\n");

const newSvgBlock = [
  "        {done ? (",
  "          <svg viewBox=\"0 0 24 24\" className=\"h-4 w-4\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"3\" strokeLinecap=\"round\" strokeLinejoin=\"round\" aria-hidden=\"true\">",
  "            <polyline points=\"5 12 10 17 19 7\" />",
  "          </svg>",
  "        ) : (",
  "          <svg viewBox=\"0 0 24 24\" className=\"h-4 w-4\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"3\" strokeLinecap=\"round\" strokeLinejoin=\"round\" aria-hidden=\"true\">",
  "            <line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\" />",
  "            <line x1=\"6\" y1=\"18\" x2=\"18\" y2=\"6\" />",
  "          </svg>",
  "        )}",
].join("\n");

if (!c.includes(oldSvgBlock)) {
  console.error("ERROR: oldSvgBlock not found");
  process.exit(1);
}
c = c.replace(oldSvgBlock, newSvgBlock);
console.log("Fixed SVG indentation");

writeFileSync(p, c);
console.log("Saved!");
