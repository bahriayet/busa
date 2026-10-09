import { loadConfig } from './config.ts';
import { openDb } from './db/client.ts';
import { seedIfEmpty, SEED_VERSION } from './db/seed.ts';
import * as R from './db/repo.ts';
import { buildApp } from './app.ts';
import { startSim, type SimHandle } from './sim.ts';

/**
 * Titik masuk server. Urutan boot:
 * config → buka DB Neon (skema idempoten) → seed bila kosong → bangun app →
 * hidupkan simulasi lantai (bila diaktifkan) → listen.
 */

const cfg = loadConfig();
const db = await openDb(cfg.databaseUrl);
const seed = await seedIfEmpty(db, cfg);

if (seed.seeded) {
  console.log(
    `[busa] seed v${seed.version}: ${seed.orders} order, ${seed.events} event, ${seed.users} akun → ${db.location}`,
  );
} else {
  console.log(
    `[busa] database terpakai v${seed.version} (${seed.orders} order, ${seed.events} event) → ${db.location}`,
  );
}
if (seed.version !== SEED_VERSION) {
  console.warn(`[busa] SEED_VERSION berubah (${seed.version} → ${SEED_VERSION}); jalankan db:reset untuk seed ulang.`);
}

const app = buildApp({ db, cfg });

/* Bersihkan token logout/reset yang kedaluwarsa tiap 6 jam. */
const cleanup = setInterval(() => {
  void R.cleanExpiredTokens(db).catch(() => { /* pembersihan bersifat best-effort */ });
  void R.cleanExpiredResets(db).catch(() => { /* pembersihan bersifat best-effort */ });
}, 6 * 60 * 60 * 1000);
cleanup.unref();

let sim: SimHandle | null = null;
if (cfg.simulate) {
  sim = startSim(db, (msg) => app.broadcast(msg), cfg.tickMs);
  console.log(`[busa] simulasi lantai aktif, tick ${cfg.tickMs} ms`);
} else {
  console.log('[busa] simulasi lantai NONAKTIF — tahap hanya bergerak lewat /scan');
}

const shutdown = (): void => {
  clearInterval(cleanup);
  sim?.stop();
  void db.close().catch(() => { /* pool mungkin sudah tertutup */ }).finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen({ host: cfg.host, port: cfg.port }).then(() => {
  console.log(`[busa] http://${cfg.host}:${cfg.port} · docs /docs · ws /ws`);
  if (cfg.serveStatic) console.log(`[busa] frontend statis: ${cfg.staticRoot}`);
}).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
