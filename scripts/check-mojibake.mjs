import { readFileSync } from "node:fs";
const c = readFileSync("D:\\website api seller\\PROJECT_MEMORY.md", "utf8");
const lines = c.split("\r\n");
console.log("L26 raw bytes:");
const l26 = lines[25];
for (let i = 0; i < l26.length; i++) {
  console.log(i, l26.charCodeAt(i).toString(16), JSON.stringify(l26[i]));
}
