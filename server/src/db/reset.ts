import { loadConfig } from '../config.ts';
import { openDb } from '../db/client.ts';
import { seedIfEmpty } from '../db/seed.ts';

/**
 * Kosongkan database Neon lalu seed ulang dari data contoh. Untuk development —
 * jalankan: npm run db:reset
 */

const TABLES = [
  'schema_meta', 'users', 'customers', 'addresses', 'services', 'addons', 'machines',
  'orders', 'order_events', 'wallet_tx', 'promos', 'staff', 'areas', 'tiers',
  'notifications', 'chat_messages', 'daily_revenue', 'content', 'settings',
  'counters', 'token_blacklist', 'password_resets',
];

const cfg = loadConfig();
const db = await openDb(cfg.databaseUrl);
await db.exec(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
console.log(`[busa] ${db.location} dikosongkan`);

const res = await seedIfEmpty(db, cfg);
console.log(`[busa] seed v${res.version}: ${res.orders} order, ${res.events} event, ${res.users} akun`);
console.log(`[busa] akun demo (password: ${cfg.seedPassword}): admin / dodo / sinta / 0812-7781-4402`);
await db.close();
