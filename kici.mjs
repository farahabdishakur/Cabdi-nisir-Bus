// Cabdinasir Bus — HAL AMAR (folder-ka ugu sarreeya):  npm run dev   (ama laba jeer riix KICI.bat)
// 1) npm install backend + website (haddii aan dhammaystirnayn)  2) kici backend (3000) + website (3001)  3) fur browser-ka
// Jooji: Ctrl + C
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const win = process.platform === 'win32';
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  console.error(`✗ Node.js ${process.versions.node} waa duug — rakib Node.js 22 LTS: https://nodejs.org/`);
  process.exit(1);
}

const apps = [
  { dir: 'cabdinasir-bus-backend', bin: 'nest', script: 'dev:local', tag: '\x1b[36m[backend]\x1b[0m' },
  { dir: 'cabdinasir-bus-web', bin: 'next', script: 'dev', tag: '\x1b[35m[website]\x1b[0m' },
];

// 1. install — hubi binary-ga (install go'ay = node_modules jira laakiin ma dhammaystirna)
for (const a of apps) {
  const cwd = path.join(root, a.dir);
  if (existsSync(path.join(cwd, 'node_modules', '.bin', win ? `${a.bin}.cmd` : a.bin))) continue;
  console.log(`\n📦 ${a.dir}: npm install (hal mar, 3–10 daqiiqo — sug, waxba ha taaban) ...\n`);
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd, stdio: 'inherit', shell: win });
  if (r.status !== 0) {
    console.error(`\n✗ npm install ${a.dir} wuu fashilmay — internet-ka hubi oo mar kale isku day`);
    process.exit(r.status ?? 1);
  }
}

// 2. kici labadaba
const kids = apps.map((a) => {
  const p = spawn('npm', ['run', a.script], { cwd: path.join(root, a.dir), shell: win, env: { ...process.env, FORCE_COLOR: '1' } });
  const pipe = (s) => {
    let buf = '';
    s.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const l of lines) if (l.trim()) console.log(`${a.tag} ${l}`);
    });
  };
  pipe(p.stdout);
  pipe(p.stderr);
  p.on('exit', (code) => {
    console.error(`\n✗ ${a.dir} wuu istaagay (code ${code}) — qoraalka cas ee kore sawir ka qaad`);
    stop(1);
  });
  return p;
});

function stop(code = 0) {
  for (const k of kids) {
    if (k.exitCode !== null) continue;
    if (win) spawnSync('taskkill', ['/pid', String(k.pid), '/T', '/F'], { stdio: 'ignore' });
    else k.kill('SIGINT');
  }
  process.exit(code);
}
process.on('SIGINT', () => stop(0));

// 3. sug → fur browser-ka
const wait = async (url) => {
  for (const until = Date.now() + 15 * 60_000; Date.now() < until; ) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* weli */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
};
if ((await wait('http://localhost:3000/api/v1/health')) && (await wait('http://localhost:3001/login'))) {
  const url = 'http://localhost:3001/login?phone=0630000000';
  console.log(`\n\x1b[32m✓ DIYAAR\x1b[0m  →  ${url}`);
  console.log('   Super Admin: 0630000000 / ChangeMe123!   ·   Karraani Boorama 1: 0631000002 / Demo1234');
  console.log('   Daaqaddan ha xirin. Jooji: Ctrl + C\n');
  if (win) spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true });
  else if (process.platform === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true });
}
