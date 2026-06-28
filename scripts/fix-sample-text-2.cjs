const fs = require('fs');
const p = 'app/app/dashboard/speech-workspace.tsx';
let t = fs.readFileSync(p, 'utf8');

// Proper Khmer sample sentences - the original (un-mojibake'd) text from the
// addSampleText button. Decoded from the original Khcript code points.
const CLONE_SAMPLE =
  '\u179f\u17bc\u17c9 \u179f\u17d2\u178f\u17b6\u1794\u17cb \u1793\u17c1\u17c7\u1782\u17ba\u1787\u17b6\u1780\u17b6\u179a\u179f\u17b6\u1780\u179b\u17d2\u1794\u1784\u179f\u17c6\u179b\u17c1\u1784\u1780\u17d2\u179b\u17bc\u1793\u179f\u1798\u17d2\u179a\u17b6\u1794\u17cb\u1794\u17d2\u179a\u1796\u17d0\u1793\u17d2\u1792 Khmer Vox TTS\u17d4';

const TTS_SAMPLE =
  '\u179f\u17bc\u17c9 \u179f\u17d2\u178f\u17b6\u1794\u17cb \u1793\u17c1\u17c7\u1782\u17ba\u1787\u17b6\u1780\u17b6\u179a\u179f\u17b6\u1780\u179b\u17d2\u1794\u1784\u1794\u1784\u17d2\u1780\u17be\u178f\u179f\u17c6\u179b\u17c1\u1784\u1781\u17d2\u1798\u17c2\u179a\u1787\u17b6 WAV\u17d4';

const start = t.indexOf('function addSampleText');
if (start < 0) { console.error('addSampleText not found'); process.exit(1); }
const end = t.indexOf('\n  }', start);
if (end < 0) { console.error('addSampleText end not found'); process.exit(1); }
const block = t.slice(start, end + 3);

const newBlock =
  'function addSampleText() {\n' +
  '    setText(\n' +
  '      isCloneMode\n' +
  '        ? ' + JSON.stringify(CLONE_SAMPLE) + '\n' +
  '        : ' + JSON.stringify(TTS_SAMPLE) + ',\n' +
  '    );\n' +
  '    setError("");\n' +
  '  }';

if (block === newBlock) {
  console.log('no change needed');
  process.exit(0);
}

const updated = t.slice(0, start) + newBlock + t.slice(end + 3);
fs.writeFileSync(p, updated, 'utf8');
console.log('replaced addSampleText body, new size', updated.length);
console.log('clone sample =', JSON.stringify(CLONE_SAMPLE));
console.log('tts   sample =', JSON.stringify(TTS_SAMPLE));
