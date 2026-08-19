#!/usr/bin/env node
/**
 * detect-mojibake.mjs
 * 
 * Scans files for mojibake patterns — UTF-8 text that was misinterpreted as
 * Latin-1 and re-encoded. This is the exact class of bug that has bitten this
 * project repeatedly when Khmer text passes through PowerShell without
 * -Encoding utf8.
 * 
 * Usage:
 *   node scripts/detect-mojibake.mjs <file> [file...]     # scan specific files
 *   node scripts/detect-mojibake.mjs --staged             # scan git staged files
 *   node scripts/detect-mojibake.mjs --all                # scan all tracked .ts/.tsx
 * 
 * Exit code:
 *   0 = clean
 *   1 = mojibake detected (prints offending lines)
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Mojibake signatures
// ---------------------------------------------------------------------------

/**
 * Double-encoded UTF-8: a UTF-8 char was decoded as Latin-1, then each
 * resulting byte was re-encoded as UTF-8. Produces sequences like â€œ â€™ â€".
 * These sequences NEVER appear in correctly-encoded text.
 */
const DOUBLE_ENCODING_PATTERNS = [
  /â€œ/,  // " (U+201C)
  /â€/,  // " (U+201D)
  /â€˜/,  // ' (U+2018)
  /â€™/,  // ' (U+2019)
  /â€" /, // — (U+2014) em-dash
  /â€"/,  // — (U+2014) variant
  /â€¢/,  // • (U+2022) bullet
  /â€¦/,  // … (U+2026) ellipsis
  /Â /,   // non-breaking space misencoded
  /Â«/,   // « left guillemet
  /Â»/,   // » right guillemet
];

/**
 * Triple-encoded UTF-8: the double-encoding happened twice. Produces the
 * ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ family. This is what happens when a file gets saved through
 * multiple rounds of Latin-1 misinterpretation.
 */
const TRIPLE_ENCODING_PATTERNS = [
  /ÃƒÆ’Ã†â€™/,
  /Ãƒâ€šÃ‚Â/,
  /Ã¢â‚¬Å“/,  // " triple-encoded
  /Ã¢â‚¬Â/,  // " triple-encoded
  /Ã¢â‚¬Ëœ/,  // ' triple-encoded
  /Ã¢â‚¬â„¢/,  // ' triple-encoded
];

/**
 * Khmer-specific mojibake: Khmer UTF-8 bytes (E1 9E xx, E1 9F xx range)
 * re-interpreted as Latin-1 then re-encoded. The first Khmer byte (0xE1)
 * becomes `Ã` (U+00C3) in Latin-1, the second byte (0x9E-0x9F) becomes
 * `ž` or `Ÿ` (U+015E-U+017F). The triple-encoded form produces the
 * characteristic `ÃƒÆ’` / `Ã†â€™` sequences already caught by the triple
 * patterns above. This pattern catches the double-encoded form:
 * `Ãž` or `Ÿ` followed by a high byte — never appears in clean Khmer.
 */
const KHMER_MOJIBAKE = /Ã[\u017E-\u017F][\u0080-\u00BF]/;

/**
 * Generic Latin-1 re-encode: Ã (U+00C3, from UTF-8 lead byte 0xC3) followed
 * by two continuation-range bytes. Catches less common double-encodings that
 * the specific patterns above miss. Uses \u escapes to avoid any encoding
 * ambiguity in this source file itself.
 */
const SUSPICIOUS_BYTE_SEQUENCES = [
  /Ã[\u0080-\u00BF][\u0080-\u00BF]/,
];

// ---------------------------------------------------------------------------
// Detection logic
// ---------------------------------------------------------------------------

const ALL_PATTERNS = [
  { name: "double-encoded UTF-8", patterns: DOUBLE_ENCODING_PATTERNS },
  { name: "triple-encoded UTF-8", patterns: TRIPLE_ENCODING_PATTERNS },
  { name: "Khmer byte corruption", patterns: [KHMER_MOJIBAKE] },
  { name: "suspicious Latin-1 re-encode", patterns: SUSPICIOUS_BYTE_SEQUENCES },
];

/**
 * Scan a single file for mojibake.
 * Returns array of findings: { line, column, type, matched }
 */
function scanFile(filePath) {
  const findings = [];
  
  let content;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err) {
    // Binary file or unreadable — skip silently
    if (err.code === "ENOENT") return findings;
    // Try to detect if it's binary
    try {
      const buf = readFileSync(filePath);
      if (isBinary(buf)) return findings;
      content = buf.toString("utf-8");
    } catch {
      return findings;
    }
  }

  const lines = content.split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    for (const { name, patterns } of ALL_PATTERNS) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          findings.push({
            line: i + 1,
            column: (match.index ?? 0) + 1,
            type: name,
            matched: match[0],
            snippet: extractSnippet(line, match.index ?? 0),
          });
        }
      }
    }
  }

  return findings;
}

/** Check if a buffer is likely binary (not text) */
function isBinary(buffer) {
  const len = Math.min(buffer.length, 8000);
  for (let i = 0; i < len; i++) {
    const byte = buffer[i];
    // Null bytes = binary
    if (byte === 0) return true;
    // Control chars (except common whitespace) = likely binary
    if (byte < 8 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)) {
      // But allow UTF-8 lead bytes (0xC0-0xF4) and continuation (0x80-0xBF)
      if (byte < 0x80) return true;
    }
  }
  return false;
}

/** Extract a readable snippet around the match */
function extractSnippet(line, index) {
  const start = Math.max(0, index - 20);
  const end = Math.min(line.length, index + 30);
  let snippet = line.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < line.length) snippet = snippet + "...";
  return snippet;
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/** Get list of staged files (about to be committed) */
function getStagedFiles() {
  try {
    const output = execSync("git diff --cached --name-only --diff-filter=ACM", {
      cwd: projectRoot,
      encoding: "utf-8",
    });
    return output
      .split("\n")
      .filter((f) => f.trim())
      .map((f) => resolve(projectRoot, f));
  } catch {
    return [];
  }
}

/** Get all tracked .ts/.tsx files */
function getAllTrackedFiles() {
  try {
    // Use git ls-files without globs (Windows shell won't expand them),
    // then filter by extension in JS.
    const output = execSync("git ls-files", {
      cwd: projectRoot,
      encoding: "utf-8",
    });
    return output
      .split("\n")
      .filter((f) => f.trim())
      .filter((f) => /\.(ts|tsx|mts|js|mjs|json|md)$/.test(f))
      .map((f) => resolve(projectRoot, f));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const sep = "/";
  const args = process.argv.slice(2);
  let files = [];

  if (args.includes("--staged")) {
    files = getStagedFiles();
  } else if (args.includes("--all")) {
    files = getAllTrackedFiles();
  } else {
    files = args.map((f) => resolve(process.cwd(), f));
  }

  // Filter to source files only (skip node_modules, .next, etc.)
  files = files.filter((f) => {
    const rel = f.replace(projectRoot, "").replace(/^[/\\]/, "");
    if (rel.includes("node_modules")) return false;
    if (rel.includes(`${sep}.next${sep}`)) return false;
    if (rel.includes(`${sep}data${sep}`)) return false;
    return /\.(ts|tsx|mts|js|mjs|json|md)$/.test(f);
  });

  if (files.length === 0) {
    console.log("No files to scan.");
    process.exit(0);
  }

  let totalFindings = 0;
  const offenders = [];

  for (const file of files) {
    const findings = scanFile(file);
    if (findings.length > 0) {
      totalFindings += findings.length;
      offenders.push({ file, findings });
    }
  }

  if (totalFindings === 0) {
    console.log(`✓ Clean — scanned ${files.length} file(s), no mojibake detected.`);
    process.exit(0);
  }

  console.log(
    `✗ Found ${totalFindings} mojibake indicator(s) across ${offenders.length} file(s):`
  );
  console.log("");

  for (const { file, findings } of offenders) {
    const rel = `.${sep}${file.replace(projectRoot, "").replace(/^\\/, "")}`;
    console.log(`  ${rel}`);
    for (const f of findings) {
      console.log(
        `    line ${f.line}:${f.column}  [${f.type}] "${f.matched}"  — ${f.snippet}`
      );
    }
  }

  console.log("");
  console.log(
    "If this is a false positive (e.g. intentional Latin-1 content), add `// mojibake-ignore` on the line before."
  );

  process.exit(1);
}

main();
