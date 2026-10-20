import { loadConfig } from '../config.ts';
import { openDb } from '../db/client.ts';
import { seedIfEmpty } from '../db/seed.ts';

/**
 * Kosongkan database lalu seed ulang sesuai BUSA_SEED_MODE:
 * - demo       → data contoh lengkap
 * - production → katalog + area + satu akun admin, tanpa order/pelanggan contoh
 * Jalankan: npm run db:reset
 */

const TABLES = [
  'schema_meta', 'users', 'customers', 'addresses', 'services', 'addons', 'machines',
  'orders', 'order_events', 'wallet_tx', 'promos', 'staff', 'areas', 'tiers',
  'notifications', 'chat_messages', 'daily_revenue', 'content', 'settings',
  'counters', 'token_blacklist', 'password_resets',
];

const cfg = loadConfig();
if (cfg.seedMode === 'production' && (!cfg.seedPassword || cfg.seedPassword === 'busa1234' || cfg.seedPassword.length < 8)) {
  console.error('[busa] Batal: seed produksi membutuhkan BUSA_SEED_PASSWORD yang kuat (minimal 8 karakter, bukan busa1234).');
  process.exit(1);
}
const db = await openDb(cfg.databaseUrl);
await db.exec(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
console.log(`[busa] ${db.location} dikosongkan`);

const res = await seedIfEmpty(db, cfg);
console.log(`[busa] seed ${cfg.seedMode} v${res.version}: ${res.orders} order, ${res.events} event, ${res.users} akun`);
if (cfg.seedMode === 'production') {
  console.log('[busa] admin produksi: admin · password dari BUSA_SEED_PASSWORD');
} else {
  console.log(`[busa] akun demo (password: ${cfg.seedPassword}): admin / dodo / sinta / 0812-7781-4402`);
}
await db.close();
