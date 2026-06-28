const fs = require('fs');
const p = 'app/app/dashboard/speech-workspace.tsx';
let t = fs.readFileSync(p, 'utf8');

// Replace the odd leading word "សូ៉" with the proper Khmer greeting "សួស្តា" (hello).
// "សូ៉" is not a real Khmer word (it's just U+179F U+17BC U+17C9 with no real meaning),
// so we replace it with the proper greeting in both sample sentences.
const NEW_CLONE =
  '\u179f\u17bd\u179f\u17d2\u178f\u17b6 \u179f\u17d2\u178f\u17b6\u1794\u17cb \u1793\u17c1\u17c7\u1782\u17ba\u1787\u17b6\u1780\u17b6\u179a\u179f\u17b6\u1780\u179b\u17d2\u1794\u1784\u179f\u17c6\u179b\u17c1\u1784\u1780\u17d2\u179b\u17bc\u1793\u179f\u1798\u17d2\u179a\u17b6\u1794\u17cb\u1794\u17d2\u179a\u1796\u17d0\u1793\u17d2\u1792 Khmer Vox TTS\u17d4';

const NEW_TTS =
  '\u179f\u17bd\u179f\u17d2\u178f\u17b6 \u179f\u17d2\u178f\u17b6\u1794\u17cb \u1793\u17c1\u17c7\u1782\u17ba\u1787\u17b6\u1780\u17b6\u179a\u179f\u17b6\u1780\u179b\u17d2\u1794\u1784\u1794\u1784\u17d2\u1780\u17be\u178f\u179f\u17c6\u179b\u17c1\u1784\u1781\u17d2\u1798\u17c2\u179a\u1787\u17b6 WAV\u17d4';

const OLD_CLONE = '\"' + '\u179f\u17bc\u17c9 \u179f\u17d2\u178f\u17b6\u1794\u17cb \u1793\u17c1\u17c7\u1782\u17ba\u1787\u17b6\u1780\u17b6\u179a\u179f\u17b6\u1780\u179b\u17d2\u1794\u1784\u179f\u17c6\u179b\u17c1\u1784\u1780\u17d2\u179b\u17bc\u1793\u179f\u1798\u17d2\u179a\u17b6\u1794\u17cb\u1794\u17d2\u179a\u1796\u17d0\u1793\u17d2\u1792 Khmer Vox TTS\u17d4' + '\"';
const OLD_TTS   = '\"' + '\u179f\u17bc\u17c9 \u179f\u17d2\u178f\u17b6\u1794\u17cb \u1793\u17c1\u17c7\u1782\u17ba\u1787\u17b6\u1780\u17b6\u179a\u179f\u17b6\u1780\u179b\u17d2\u1794\u1784\u1794\u1784\u17d2\u1780\u17be\u178f\u179f\u17c6\u179b\u17c1\u1784\u1781\u17d2\u1798\u17c2\u179a\u1787\u17b6 WAV\u17d4' + '\"';

let updated = t;
let changed = false;
if (updated.indexOf(OLD_CLONE) !== -1) {
  updated = updated.replace(OLD_CLONE, JSON.stringify(NEW_CLONE));
  changed = true;
}
if (updated.indexOf(OLD_TTS) !== -1) {
  updated = updated.replace(OLD_TTS, JSON.stringify(NEW_TTS));
  changed = true;
}

if (!changed) {
  console.log('no change');
  process.exit(0);
}

fs.writeFileSync(p, updated, 'utf8');
console.log('updated addSampleText, size', updated.length);
console.log('clone sample =', JSON.stringify(NEW_CLONE));
console.log('tts   sample =', JSON.stringify(NEW_TTS));
