// Kombiyuutarka tijaabada: password-ka akoon ku soo celi (xogta waxba lagama tirtiro).
//   npm run reset-password                 → Super Admin 0630000000 → ChangeMe123!
//   npm run reset-password -- 0631000002   → akoonkaas → Demo1234
// Sidoo kale: qufulka (5 isku day khaldan) iyo xannibaadda waa laga qaadaa. Login-ka xiga password cusub ayaa la weydiinayaa.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '.localdb');
const port = Number(process.env.LOCAL_DB_PORT ?? 5434);
const phone = process.argv[2] ?? '0630000000';
const password = process.argv[3] ?? (phone === '0630000000' ? 'ChangeMe123!' : 'Demo1234');

if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
  console.error('✗ Database-ka tijaabada weli lama samayn — marka hore  npm run dev  ku kici.');
  process.exit(1);
}
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'cb', password: 'cb', port, persistent: true, onLog: () => {} });

// nidaamku haddii uu socdo → database-ka furan ayaan isticmaalaynaa; haddii kale si ku-meel-gaar ah ayaan u kicinaynaa
let started = false;
let client = pg.getPgClient('cabdinasir_bus');
try {
  await client.connect();
} catch {
  await pg.start();
  started = true;
  client = pg.getPgClient('cabdinasir_bus');
  await client.connect();
}
try {
  const hash = await argon2.hash(password);
  // database nooc hore ah (migration-ka xannibaadda weli lama gelin) → tiirarkaas iska dhaaf
  const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('blockReason', 'blockedAt')`);
  const unblock = cols.rowCount === 2 ? ', "blockReason" = NULL, "blockedAt" = NULL' : '';
  const r = await client.query(
    `UPDATE users SET "passwordHash" = $1, "mustChangePassword" = true, "failedLogins" = 0, "lockedUntil" = NULL,
       "isActive" = true${unblock}, "tokenVersion" = "tokenVersion" + 1, "updatedAt" = now()
     WHERE phone = $2 RETURNING name, role`,
    [hash, phone],
  );
  if (!r.rowCount) {
    console.error(`✗ Akoon taleefankiisu yahay ${phone} lama helin.`);
    process.exitCode = 1;
  } else {
    console.log(`\n✓ ${r.rows[0].name} (${r.rows[0].role})`);
    console.log(`   Taleefan: ${phone}`);
    console.log(`   Password: ${password}`);
    console.log('   Login-ka kadib password cusub ayaa la weydiinayaa — qor meel aad xasuusato.');
    if (!started) console.log('   ⚠ Nidaamku wuu socdaa: "isku day badan" haddii uu yiraahdo → Ctrl + C, kadib  npm run dev  (xusuusta ayaa nadiifsami).');
    console.log('');
  }
} finally {
  await client.end();
  if (started) await pg.stop();
}
