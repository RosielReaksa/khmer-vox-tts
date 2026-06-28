const fs = require('fs');
const p = 'app/app/dashboard/speech-workspace.tsx';
let t = fs.readFileSync(p, 'utf8');
t = t.replace('setError("");\n  }}', 'setError("");\n  }');
fs.writeFileSync(p, t, 'utf8');
console.log('size', t.length);
