import { readFileSync } from "node:fs";
const p = "D:\\website api seller\\app\\app\\dashboard\\key-manager.tsx";
const buf = readFileSync(p);

// Find first newline and check what's before it
const idx = buf.indexOf(Buffer.from("import { clearDashboardCache }"));
const end = buf.indexOf(0x0a, idx);
const prevByte = buf[end - 1];
console.log("Byte before first LF after import:", "0x" + prevByte.toString(16));
console.log("LF itself:", "0x" + buf[end].toString(16));
// Check the actual content of L4 in CRLF form
const text = buf.toString("utf8");
const lines = text.split("\n");
console.log("Number of lines:", lines.length);
console.log("L5:", JSON.stringify(lines[4]));
console.log("L6:", JSON.stringify(lines[5]));
console.log("L7:", JSON.stringify(lines[6]));
console.log("L8:", JSON.stringify(lines[7]));
