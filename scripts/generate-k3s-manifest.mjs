import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const envPath = path.join(rootDir, 'deploy', 'production.env');
const templatePath = path.join(rootDir, 'deploy', 'k3s-deployment.yml');
const outputPath = path.join(rootDir, 'deploy', 'k3s', 'voxtts-populated.yaml');

if (!fs.existsSync(envPath)) {
  console.error(`Error: Environment file not found at ${envPath}`);
  process.exit(1);
}

if (!fs.existsSync(templatePath)) {
  console.error(`Error: K3s deployment template file not found at ${templatePath}`);
  process.exit(1);
}

// Parse production.env
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const match = trimmed.match(/^([^=]+)=(.*)$/);
  if (match) {
    let key = match[1].trim();
    let val = match[2].trim();
    // Strip surrounding quotes if present
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
    env[key] = val;
  }
});

console.log('Parsed production.env variables:');
Object.keys(env).forEach(k => {
  const masked = k.includes('SECRET') || k.includes('TOKEN') || k.includes('PASSWORD') || k.includes('URL') 
    ? '***' 
    : env[k];
  console.log(`  - ${k}: ${masked}`);
});

let manifest = fs.readFileSync(templatePath, 'utf8');

// 1. Replace the registry image name
manifest = manifest.replace(
  /your-docker-registry\/khmer-vox-tts:latest/g,
  'ghcr.io/rosielreaksa/khmer-vox-tts:latest'
);

// 2. Replace Secret values inside stringData
Object.keys(env).forEach(key => {
  const value = env[key];
  
  // Replace stringData fields
  // Matches: key: "anything-until-newline"
  const secretRegex = new RegExp(`(${key}:\\s*)["'].*?["']`, 'g');
  if (secretRegex.test(manifest)) {
    manifest = manifest.replace(secretRegex, `$1"${value}"`);
    console.log(`Populated Secret: ${key}`);
  }
});

// 3. Replace Environment values in spec containers
// Matches:
//             - name: KEY
//               value: "..."
Object.keys(env).forEach(key => {
  const value = env[key];
  const envRegex = new RegExp(`(-\\s*name:\\s*${key}\\s*\\n\\s*value:\\s*)["'].*?["']`, 'g');
  if (envRegex.test(manifest)) {
    manifest = manifest.replace(envRegex, `$1"${value}"`);
    console.log(`Populated Config/Env: ${key}`);
  }
});

// Write populated manifest
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, manifest, 'utf8');
console.log(`\nSuccess! Populated K3s manifest written to: ${outputPath}`);
