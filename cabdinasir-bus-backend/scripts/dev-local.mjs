#!/usr/bin/env node
/**
 * Backend-ka kombiyuutarkaaga — Docker iyo PostgreSQL la'aan (Windows / Mac / Linux):
 *   1. database PostgreSQL 16 oo ku dhex jira (embedded-postgres) → galka `.localdb/` (xogtu way kaydsantahay)
 *   2. `.env` haddii aanu jirin waa la sameeyaa (sirta JWT random)
 *   3. migrations → xog tijaabo (laamo, shaqaale, gaadiid) → API-ga (http://localhost:3000, watch)
 * Isticmaal: `npm run dev:local` (ama VS Code → Run → "▶ Kici dhammaan").  Jooji: Ctrl+C.
 */
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
let EmbeddedPostgres;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
  await import(`@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`);
} catch {
  console.error('\n✗ npm install ma dhammaystirna (database-ka PostgreSQL ~100 MB weli lama soo dejin).');
  console.error('  Xal: isla folder-kan ku qor  npm install  → SUG ilaa "added … packages" (ha riixin Ctrl + C) → kadib mar kale.\n');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PORT = Number(process.env.LOCAL_DB_PORT ?? 5434);
const DATABASE_URL = `postgresql://cb:cb@localhost:${DB_PORT}/cabdinasir_bus?schema=public`;
const dataDir = path.join(root, '.localdb');
const envFile = path.join(root, '.env');
const isWin = process.platform === 'win32';
const say = (m) => console.log(`\x1b[36m[cabdinasir]\x1b[0m ${m}`);

// 1. .env (hal mar)
if (!existsSync(envFile)) {
  const secret = () => randomBytes(32).toString('hex');
  writeFileSync(
    envFile,
    [
      '# Waxaa sameeyay scripts/dev-local.mjs (kombiyuutarka tijaabada) — production ha u isticmaalin',
      `DATABASE_URL="${DATABASE_URL}"`,
      `JWT_ACCESS_SECRET="${secret()}"`,
      `JWT_REFRESH_SECRET="${secret()}"`,
      'PORT=3000',
      'CORS_ORIGIN="http://localhost:3001"',
      'SMS_PROVIDER="log"',
      'UPLOAD_DIR="./uploads"',
      'SEED_SUPER_ADMIN_PHONE="0630000000"',
      'SEED_SUPER_ADMIN_PASSWORD="ChangeMe123!"',
      '',
    ].join('\n'),
  );
  say('.env waa la sameeyay');
}
const fileEnv = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
);
const env = {
  ...process.env,
  ...fileEnv,
  DATABASE_URL, // had iyo jeer database-ka gudaha (embedded)
  SEED_DEMO: 'true',
  SEED_SUPER_ADMIN_PASSWORD: fileEnv.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!',
  NODE_ENV: 'development',
  // kombiyuutarka tijaabada kaliya: bandhigga (demo:day) + daaqado badan → xadka login-ka (5/daqiiqo) ha xannibin
  THROTTLE_DISABLED: fileEnv.THROTTLE_DISABLED ?? 'true',
};

// 2. database — UTF8 had iyo jeer (Windows default-kiisu waa WIN1252 → migrations "→" way diidaan)
const newPg = () =>
  new EmbeddedPostgres({ databaseDir: dataDir, user: 'cb', password: 'cb', port: DB_PORT, persistent: true, onLog: () => {}, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
let pg = newPg();
const startPg = async () => {
  try {
    await pg.start();
  } catch (e) {
    // kombiyuutarku si lama filaan ah ayuu u dansaday → postmaster.pid ayaa hadhay → tirtir oo mar kale isku day
    const lock = path.join(dataDir, 'postmaster.pid');
    if (!existsSync(lock)) throw e;
    say('Qufulkii hore (postmaster.pid) waa la tirtiray — mar kale ...');
    rmSync(lock, { force: true });
    await pg.start();
  }
};
let fresh = !existsSync(path.join(dataDir, 'PG_VERSION'));
// galka database-ka wuu jiraa laakiin ma dhammaystirna (koobi go'ay / bilow hore oo go'ay) → dhinac dhig (lama tirtiro) → mid cusub
if (fresh && existsSync(dataDir) && readdirSync(dataDir).length) {
  const aside = `${dataDir}-khaldan-${Date.now()}`;
  renameSync(dataDir, aside);
  say(`Galka database-ka ma dhammaystirnayn → waa la dhinac dhigay (${path.basename(aside)}) · mid cusub ayaa la samaynayaa ...`);
}
if (fresh) {
  say('Database-ka ayaa la diyaarinayaa (markii ugu horreysay) ...');
  await pg.initialise();
}
await startPg();
if (!fresh) {
  // database hore oo aan UTF8 ahayn (nooca hore ee Windows) → migrations weligood ma dhammaan → xog ma leh → dib u samee
  const c = pg.getPgClient();
  await c.connect();
  const r = await c.query("SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname IN ('cabdinasir_bus','template1') ORDER BY datname");
  await c.end();
  if (r.rows.some((x) => x.enc !== 'UTF8')) {
    say(`Database-kii hore wuxuu ahaa ${r.rows.map((x) => x.enc).join('/')} (ma aha UTF8) — dib ayaa loo samaynayaa ...`);
    await pg.stop().catch(() => {});
    rmSync(dataDir, { recursive: true, force: true });
    pg = newPg();
    await pg.initialise();
    await startPg();
    fresh = true;
  }
}
if (fresh) await pg.createDatabase('cabdinasir_bus');
say(`Database: localhost:${DB_PORT} ✓`);

let api;
const stop = async () => {
  say('Waa la joojinayaa ...');
  if (api && !api.killed) api.kill();
  await pg.stop().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, env, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) {
    console.error(`\n✗ ${cmd} ${args.join(' ')} — khalad (${r.status})`);
    return false;
  }
  return true;
};

// 3. migrations + xog tijaabo + API
if (!run('npx', ['prisma', 'migrate', 'deploy']) || !run('npx', ['prisma', 'generate']) || !run('npx', ['ts-node', 'prisma/seed.ts'])) {
  await pg.stop();
  process.exit(1);
}
say('Backend-ka ayaa kacaya → http://localhost:3000  (API docs: http://localhost:3000/api/docs)');
say('Super Admin: 0630000000 / ChangeMe123!   ·   Maamule: 0631000001 / Demo1234   ·   Karraani: 0631000002 / Demo1234');
api = spawn('npx', ['nest', 'start', '--watch'], { cwd: root, env, stdio: 'inherit', shell: isWin });
api.on('exit', async (code) => {
  await pg.stop().catch(() => {});
  process.exit(code ?? 0);
});
