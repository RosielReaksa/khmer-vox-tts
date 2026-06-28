'use strict';
const fs = require('fs');
const path = require('path');
const p = path.join(process.cwd(), 'app/app/dashboard/speech-workspace.tsx');
let s = fs.readFileSync(p, 'utf8');
function replaceOnce(haystack, needle, replacement, label) {
  if (!haystack.includes(needle)) throw new Error('marker not found: ' + label);
  return haystack.replace(needle, replacement);
}
const idx = s.indexOf('@keyframes voxeq');
const STYLE_NEEDLE = s.slice(idx - 18, s.indexOf('</style>') + 8);
if (!s.includes(STYLE_NEEDLE)) throw new Error('marker not found: remove inline <style>');
s = s.replace(STYLE_NEEDLE, '');

const anchor = 'function GeneratingState({ progress }: { progress: string }) {';
if (!s.includes(anchor)) throw new Error('GeneratingState anchor not found');
const KEYFRAMES_TEXT = '@keyframes voxeq { 0%, 100% { height: 20%; } 50% { height: 100%; } }';
const INJECT_FN = [
  'function InjectVoxEqKeyframes() {',
  '  useEffect(() => {',
  '    if (typeof document === "undefined") return;',
  '    const id = "voxeq-keyframes";',
  '    if (document.getElementById(id)) return;',
  '    const el = document.createElement("style");',
  '    el.id = id;',
  '    el.textContent = ' + JSON.stringify(KEYFRAMES_TEXT) + ';',
  '    document.head.appendChild(el);',
  '  }, []);',
  '  return null;',
  '}',
  '',
  anchor
].join('\n');
s = s.replace(anchor, INJECT_FN);

s = replaceOnce(s,
  '        {busy ? (\n          <GeneratingState progress={progress} />\n        ) : error ? (',
  '        {busy ? (\n          <>\n            <InjectVoxEqKeyframes />\n            <GeneratingState progress={progress} />\n          </>\n        ) : error ? (',
  'wrap GeneratingState');

const fnOld = 'function commitWorkspaceSnapshot(mode: "tts" | "clone", patch: Partial<WorkspaceSnapshot>) {\n  workspaceSnapshots[mode] = { ...workspaceSnapshots[mode], ...patch };\n  for (const listener of workspaceListeners[mode]) {\n    listener();\n  }\n}';
const fnNew = 'function commitWorkspaceSnapshot(mode: "tts" | "clone", patch: Partial<WorkspaceSnapshot>) {\n  const current = workspaceSnapshots[mode];\n  let changed = false;\n  for (const key of Object.keys(patch) as Array<keyof WorkspaceSnapshot>) {\n    if (current[key] !== patch[key]) {\n      changed = true;\n      break;\n    }\n  }\n  if (!changed) return;\n  workspaceSnapshots[mode] = { ...current, ...patch };\n  for (const listener of workspaceListeners[mode]) {\n    listener();\n  }\n}';
if (!s.includes(fnOld)) throw new Error('commitWorkspaceSnapshot old not found');
s = s.replace(fnOld, fnNew);

s = replaceOnce(s,
  '  // Close the saved-voice library modal on Escape for keyboard accessibility.\n  useEffect(() => {\n    if (!isLibraryOpen) return;',
  '  // Make sure generation never blocks the page scroll. If something else\n  //  on the page (mobile menu, etc.) added body.no-scroll while busy, drop\n  //  it so the user can scroll past the Generating state.\n  useEffect(() => {\n    if (!busy) return;\n    if (typeof document === "undefined") return;\n    document.body.classList.remove("no-scroll");\n  }, [busy]);\n\n  // Close the saved-voice library modal on Escape for keyboard accessibility.\n  useEffect(() => {\n    if (!isLibraryOpen) return;',
  'no-scroll guard');

s = replaceOnce(s,
  '        {Array.from({ length: 9 }).map((_, i) => (\n          <span\n            key={i}\n            className="w-2 flex-1 rounded-full bg-[#ffcc00]"\n            style={{\n              animation: "voxeq 1s ease-in-out infinite",\n              animationDelay: `${i * 0.09}s`,\n            }}\n          />\n        ))}',
  '        {Array.from({ length: 9 }).map((_, i) => (\n          <span\n            key={i}\n            className="w-2 flex-1 rounded-full bg-[#ffcc00] will-change-[height]"\n            style={{\n              animation: "voxeq 1s ease-in-out infinite",\n              animationDelay: `${i * 0.09}s`,\n            }}\n          />\n        ))}',
  'equalizer will-change');

fs.writeFileSync(p, s, 'utf8');
console.log('patched', p, 'size', s.length);