const fs = require('fs');
const p = process.argv[2] || 'app/app/dashboard/speech-workspace.tsx';
const t = fs.readFileSync(p, 'utf8');

// Original Khmer strings (these are the correct UTF-8 forms for the sample text)
const CLONE_SAMPLE =
  '\u17d2\u179f\u17d2\u17bd\u179f\u1792\u17d2\u178f\u17b8 ' +
  '\u1793\u17d2\u1781\u17c7\u1782\u17ba\u1787\u17b6\u1780\u17b6\u179b\u179f\u17b6\u1780' +
  '\u179b\u17d2\u1794\u1784\u179f\u17a6\u17b1\u1784\u1780\u17d2\u179b\u17bc\u1793\u179f' +
  '\u1798\u17d2\u179a\u17b6\u1784\u17cf\u1794\u17d2\u179a\u1796\u17d0\u1793\u17d2\u1792 ' +
  'Khmer Vox TTS\u17d2';

const TTS_SAMPLE =
  '\u17d2\u179f\u17d2\u17bd\u179f\u1792\u17d2\u178f\u17b8 ' +
  '\u1793\u17d2\u1781\u17c7\u1782\u17ba\u1787\u17b6\u1780\u17b6\u179b\u179f\u17b6\u1780' +
  '\u179b\u17d2\u1794\u1784\u1794\u1784\u17d2\u1780\u17be\u178f\u179f\u17a6\u17b1\u1784' +
  '\u1781\u17d2\u1798\u1782\u179a\u1787\u17b6 WAV\u17d2';

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
