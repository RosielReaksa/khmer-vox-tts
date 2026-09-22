// Verify the fixes are present
const fs = require("fs");
const path = require("path");

const root = "D:\\website api seller\\app\\app\\dashboard";

console.log("=== Verify FIX 1: Voice clone sample persistence ===");
const persistence = fs.readFileSync(path.join(root, "workspace-persistence.ts"), "utf8");
const hasCloneSampleKey = persistence.includes("cloneSampleStorageKey");
const hasPersistFn = persistence.includes("persistCloneSample");
const hasReadFn = persistence.includes("readCloneSample");
const hasClearFn = persistence.includes("clearCloneSample");
console.log("  cloneSampleStorageKey:", hasCloneSampleKey ? "PASS" : "FAIL");
console.log("  persistCloneSample:", hasPersistFn ? "PASS" : "FAIL");
console.log("  readCloneSample:", hasReadFn ? "PASS" : "FAIL");
console.log("  clearCloneSample:", hasClearFn ? "PASS" : "FAIL");

console.log("\n=== Verify speech-workspace uses clone sample persistence ===");
const sw = fs.readFileSync(path.join(root, "speech-workspace.tsx"), "utf8");
const swHasImport = sw.includes("persistCloneSample") && sw.includes("readCloneSample");
const swHasRestore = sw.includes("readCloneSample(\"clone\")") && sw.includes("File([bytes]");
const swHasWrite = sw.includes("persistCloneSample(\"clone\"");
console.log("  Imports:", swHasImport ? "PASS" : "FAIL");
console.log("  Restore logic:", swHasRestore ? "PASS" : "FAIL");
console.log("  Write logic:", swHasWrite ? "PASS" : "FAIL");

console.log("\n=== Verify FIX 2: API key rawKey persistence ===");
const km = fs.readFileSync(path.join(root, "key-manager.tsx"), "utf8");
const kmHasStorage = km.includes("RAW_KEY_STORAGE_KEY") && km.includes("sessionStorage");
const kmHasWrite = km.includes("writeRevealedKey");
const kmHasClear = km.includes("clearRevealedKey");
const kmHasRestore = km.includes("useState(() => {") && km.includes("readRevealedKey()");
console.log("  SessionStorage helpers:", kmHasStorage ? "PASS" : "FAIL");
console.log("  writeRevealedKey:", kmHasWrite ? "PASS" : "FAIL");
console.log("  clearRevealedKey:", kmHasClear ? "PASS" : "FAIL");
console.log("  Restore via useState initializer:", kmHasRestore ? "PASS" : "FAIL");

console.log("\n=== Summary ===");
const allPass = hasCloneSampleKey && hasPersistFn && hasReadFn && hasClearFn &&
  swHasImport && swHasRestore && swHasWrite &&
  kmHasStorage && kmHasWrite && kmHasClear && kmHasRestore;
console.log(allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED");
process.exit(allPass ? 0 : 1);
