const fs = require('fs');
const path = require('path');
const p = path.join(process.cwd(), 'PROJECT_MEMORY.md');
const s = fs.readFileSync(p, 'utf8');

const today = new Date().toISOString().slice(0, 10);
const header = '# Khmer Vox TTS Project Memory\n\nLast updated: ' + today + '\n';

let body = s;
const m = body.match(/^# Khmer Vox TTS Project Memory\n\nLast updated: .*?\n/);
if (m) body = body.slice(m[0].length);

const insertion = [
  '## Voice-cloning UI rendering fixes (2026-06-28, deployed)',
  '',
  'User reported three UI bugs on /app/dashboard/voice-cloning (with screenshots in',
  'D:\\website api seller\\image screenshot fixer\\):',
  '',
  '1. Mojibake in the Status Checklist. Cause: the JSX text rendered the unicode chars',
  '   U+2713 / U+2717, but the font fallback chain could not paint them so the browser',
  '   showed the UTF-8 bytes as Latin-1. The PowerShell encoding rule from the earlier',
  '   incident also left a few more latent mojibake strings in template literals.',
  '2. The REFERENCE VOICE / page h1 title was clipped at the top on short viewports.',
  '3. The bottom of the "Paste text" input was being cut off by the page footer.',
  '',
  '**Fix (app/app/dashboard/speech-workspace.tsx):**',
  '- StatusStep: replaced the unicode checkmark/cross with inline SVG paths (always renders',
  '  identically regardless of font fallback). Added aria-hidden="true", shrink-0, and',
  '  leading-none to keep the icon crisp in the bordered badge.',
  '- h1 title: added pb-2 and leading-[1.15] so descenders do not get clipped.',
  '- Reference voice span: added block, leading-relaxed, tracking-tight, break-words, and py-1 so it always wraps cleanly.',
  '- Section wrapper: increased bottom padding from pb-12 to pb-20 so the input box never',
  '  touches the page footer.',
  '- Bonus: also repaired 4 latent mojibake strings already living in template literals',
  '  (em-dash and middle-dot variants) that were harmless while hidden but would have leaked',
  '  into error toasts / status text.',
  '',
  '**Validation:** npx tsc --noEmit passes, npm run lint -- speech-workspace.tsx passes,',
  'npm run build succeeds (95 routes). Source has zero mojibake patterns.',
  '',
  '**Deploy:** prod-20260627-33 (this commit, GitHub Actions run TBD).',
  '',
  '**Lesson:** Any time JSX or template literal text contains a non-ASCII character, prefer',
  'inline SVG / CSS shapes for status icons. Reserve unicode characters for prose strings',
  'that flow through standard <p> / <span> containers where the font stack is reliable.',
  'Also keep reinforcing the PowerShell encoding rule: never write non-ASCII text with',
  '[System.IO.File]::WriteAllText without the explicit UTF-8 encoder.',
  '',
].join('\n');

const out = header + insertion + body;
fs.writeFileSync(p, out, 'utf8');
console.log('memory updated, total lines =', out.split('\n').length);
