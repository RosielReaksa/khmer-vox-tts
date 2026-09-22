import { readFileSync, writeFileSync } from "node:fs";

const p = "D:\\website api seller\\PROJECT_MEMORY.md";
let c = readFileSync(p, "utf8");

// Use a simpler marker that doesn't have special chars
const startMarker = "## UI text corruption";

const startIdx = c.indexOf(startMarker);
if (startIdx < 0) {
  console.error("ERROR: section not found");
  process.exit(1);
}

// Find the end - next blank line + ## or end of file
let endIdx = c.length;
for (let i = startIdx + startMarker.length; i < c.length - 1; i++) {
  if (c[i] === "\n" && c[i + 1] === "\n" && c[i + 2] === "#") {
    endIdx = i;
    break;
  }
}
console.log(`Replacing chars ${startIdx} to ${endIdx} (${endIdx - startIdx} chars)`);

const newSection = `## UI text corruption (mojibake) fix on API Keys page (2026-06-27, deployed prod-20260627-32)

User reported garbled characters on the YOUR API KEYS panel of
/app/dashboard/api and the matching /business page. The text corruption
affected key prefix, metadata labels (Created, Last Used, Total Requests,
Daily/Monthly Limit), and business metadata. The original commit contained
UTF-8 bytes that had been re-decoded as Latin-1 then re-encoded as UTF-8
multiple times, producing the classic double-encoding mojibake pattern
visible in the browser.

**Root cause:** This was self-inflicted. The previous dashboard UX fix
commit fe3dbdb applied edits via PowerShell's
[System.IO.File]::WriteAllText which writes with the system codepage
instead of UTF-8. Existing emoji characters in the file (warning sign,
calendar, lightning, bar chart, money with wings, rocket, package, inbox,
and bullet characters) had their UTF-8 bytes mis-decoded as Latin-1 and
re-encoded as UTF-8 multiple times. The DB and network payload were clean
- the corruption was entirely in the source file bytes. The API returned
the same string, but the React component was rendering the already-
corrupted JSX literals.

**Fix:**
- Restored the file to its clean version from commit 035b88e (the
  version BEFORE fe3dbdb).
- Re-applied the sessionStorage helpers and useState lazy initializers
using a Node.js script (scripts/apply-keymanager-fix.mjs) which writes
UTF-8 correctly. The dashboard UX fix is preserved.
- All 8 emoji sites are now back to their original characters.

**Restored characters:**
- warning sign + Copy this API key now
- keyPrefix + 20 U+2022 bullets (key masking)
- calendar + Created:
- lightning + Last Used:
- bar chart + Total Requests:
- money with wings + Daily Limit:
- calendar + Monthly Limit:
- rocket / package / inbox + business metadata labels

**Validation:**
- npx tsc --noEmit: clean
- npm run lint -- key-manager.tsx: clean
- npm run build: succeeds (95 routes)
- workspace-persistence.test.ts: 19/19 pass

**Deploy:** prod-20260627-32 (commit b7b47f3, GH Actions run
28287162262). Both web + worker pods rolled out successfully.

**Lesson learned:** All JS/TS source file writes from PowerShell must
use [System.IO.File]::WriteAllText(path, content,
[System.Text.UTF8Encoding]::new($false)) to preserve UTF-8 bytes correctly.
The default encoding is the system codepage (Windows-1252 in this
environment), which corrupts emoji and non-ASCII characters. Going forward,
all source file edits should go through Node.js (which defaults to UTF-8)
or use the explicit UTF-8 encoder in PowerShell.

**Future safeguards (TODO):**
- A new scripts/audit-mojibake.mjs could scan the entire app/ tree for
the common double-encoded patterns and fail the build if any are found.
- A pre-commit hook could run the same scan on staged files only.
`;

c = c.slice(0, startIdx) + newSection + c.slice(endIdx);
writeFileSync(p, c);
console.log("Memory updated");
