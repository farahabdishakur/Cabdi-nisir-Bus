// VS Code: hal mar — npm install backend + website (haddii node_modules aanu jirin)
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  console.error(`✗ Node.js ${process.versions.node} waa duug — rakib Node.js 22 LTS: https://nodejs.org/`);
  process.exit(1);
}
for (const dir of ['cabdinasir-bus-backend', 'cabdinasir-bus-web']) {
  const cwd = path.join(root, dir);
  if (existsSync(path.join(cwd, 'node_modules'))) continue;
  console.log(`📦 ${dir}: npm install (hal mar, 1–3 daqiiqo) ...`);
  const r = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log('✓ Diyaar');
