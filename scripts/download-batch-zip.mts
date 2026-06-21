/**
 * Download-only helper for the batch-clone e2e test. Fetches the result zip for
 * an existing job id (no regeneration) and reports the entry count. The job id
 * is taken from JOB_ID. Run: JOB_ID=... npx tsx scripts/download-batch-zip.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = join(here, "..", "test-output");
const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const apiKey = readFileSync(join(outputDir, "seed-key.txt"), "utf8").trim();
const jobId = (process.env.JOB_ID || "").trim();

if (!jobId) {
  console.error("Set JOB_ID to the batch job id.");
  process.exit(1);
}

const started = Date.now();
const res = await fetch(`${baseUrl}/api/v1/audio/batch/jobs/${encodeURIComponent(jobId)}/download`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});
const elapsed = ((Date.now() - started) / 1000).toFixed(1);
const ctype = res.headers.get("content-type") ?? "(none)";
console.log(`status: ${res.status}  ctype: ${ctype}  in ${elapsed}s`);

if (res.status !== 200 || !ctype.includes("zip")) {
  console.log(`body: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}

const bytes = Buffer.from(await res.arrayBuffer());
const zipPath = join(outputDir, "batch-clone-api.zip");
writeFileSync(zipPath, bytes);

// Count central-directory file headers (PK\x01\x02) for an accurate entry count.
let entries = 0;
for (let i = 0; i + 4 <= bytes.length; i++) {
  if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x01 && bytes[i + 3] === 0x02) entries++;
}
console.log(`saved: ${zipPath}`);
console.log(`zip bytes: ${bytes.length}  files: ${entries}`);
