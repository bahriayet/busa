import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, types } from 'pg';

/**
 * Pembungkus tipis di atas PostgreSQL (Neon).
 *
 * Sengaja tipis: tidak ada ORM, tidak ada query builder. SQL domain tetap
 * memakai placeholder `?` (ditranslasikan ke `$n` di sini), transaksi bisa
 * bersarang lewat SAVEPOINT, dan semua helper mengembalikan baris yang sudah
 * dilempar ke tipe domain pemanggil.
 *
 * Karena driver PostgreSQL asinkron, seluruh method `Db` mengembalikan Promise.
 * Transaksi berjalan di atas SATU koneksi dari pool; AsyncLocalStorage memastikan
 * query di dalam `tx()` memakai koneksi itu tanpa perlu mengoper client manual.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(here, 'schema.sql');
export const SCHEMA_VERSION = '1';

/** BIGINT (int8/OID 20) dikembalikan driver sebagai string; domain ini memakai number. */
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export type SqlParam = string | number | bigint | boolean | null;

/** Boolean → 0/1 untuk kolom INTEGER (pasangan dari `unb()`). */
export function b(v: unknown): 0 | 1 {
  return v ? 1 : 0;
}

/** 0/1 (atau boolean native) → boolean. */
export function unb(v: unknown): boolean {
  return v === 1 || v === true || v === '1';
}

/** undefined → null; boolean → 0/1; nilai lain dilewatkan apa adanya. */
export function n(v: unknown): SqlParam {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint') return v;
  return String(v);
}

export function jstr(v: unknown): string {
  return JSON.stringify(v ?? null);
}

export function jparse<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') return fallback;
  try {
    const out = JSON.parse(String(raw)) as T;
    return out === null || out === undefined ? fallback : out;
  } catch {
    return fallback;
  }
}

/* ── Abstraksi driver ────────────────────────────────────── */

export interface QueryResultLike {
  rows: Record<string, unknown>[];
  rowCount: number | null;
}

export interface ClientLike {
  query(sql: string, params?: SqlParam[]): Promise<QueryResultLike>;
  release(): void;
}

export interface PoolLike {
  query(sql: string, params?: SqlParam[]): Promise<QueryResultLike>;
  connect(): Promise<ClientLike>;
  end(): Promise<void>;
}

export interface RunResult {
  changes: number;
}

export interface Db {
  readonly location: string;
  all<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): Promise<T | undefined>;
  run(sql: string, ...params: SqlParam[]): Promise<RunResult>;
  /** Jalankan `fn` dalam satu transaksi; nested call memakai SAVEPOINT. */
  tx<T>(fn: () => Promise<T>): Promise<T>;
  scalar<T = number>(sql: string, ...params: SqlParam[]): Promise<T | undefined>;
  /** Statement tanpa parameter (boleh multi-statement, mis. skema). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export function schemaSql(): string {
  return readFileSync(SCHEMA_PATH, 'utf8');
}

interface TxContext {
  client: ClientLike;
  depth: number;
}

/**
 * Terjemahkan placeholder `?` menjadi `$1, $2, ...` ala PostgreSQL.
 * String literal dan komentar dilewati supaya tanda tanya di dalamnya aman.
 */
export function translatePlaceholders(sql: string): string {
  let out = '';
  let i = 0;
  let n = 0;
  while (i < sql.length) {
    const ch = sql[i]!;

    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += ch;
      i++;
      while (i < sql.length) {
        const c = sql[i]!;
        if (c === quote) {
          if (sql[i + 1] === quote) {
            out += quote + quote;
            i += 2;
            continue;
          }
          out += quote;
          i++;
          break;
        }
        out += c;
        i++;
      }
      continue;
    }

    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      if (end === -1) {
        out += sql.slice(i);
        break;
      }
      out += sql.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) {
        out += sql.slice(i);
        break;
      }
      out += sql.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    if (ch === '?') {
      n++;
      out += `$${n}`;
      i++;
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

export function createDb(pool: PoolLike, location: string): Db {
  const als = new AsyncLocalStorage<TxContext>();

  const query = (sql: string, params: SqlParam[]): Promise<QueryResultLike> => {
    const text = translatePlaceholders(sql);
    const ctx = als.getStore();
    return ctx ? ctx.client.query(text, params) : pool.query(text, params);
  };

  const db: Db = {
    location,

    async all<T>(sql: string, ...params: SqlParam[]): Promise<T[]> {
      const res = await query(sql, params);
      return res.rows as unknown as T[];
    },

    async get<T>(sql: string, ...params: SqlParam[]): Promise<T | undefined> {
      const res = await query(sql, params);
      return res.rows[0] as unknown as T | undefined;
    },

    async run(sql: string, ...params: SqlParam[]): Promise<RunResult> {
      const res = await query(sql, params);
      return { changes: res.rowCount ?? 0 };
    },

    async scalar<T>(sql: string, ...params: SqlParam[]): Promise<T | undefined> {
      const res = await query(sql, params);
      const row = res.rows[0];
      if (!row) return undefined;
      return Object.values(row)[0] as T | undefined;
    },

    async tx<T>(fn: () => Promise<T>): Promise<T> {
      const ctx = als.getStore();
      if (ctx) {
        const sp = `sp_${ctx.depth++}`;
        await ctx.client.query(`SAVEPOINT ${sp}`);
        try {
          const out = await fn();
          await ctx.client.query(`RELEASE SAVEPOINT ${sp}`);
          return out;
        } catch (err) {
          await ctx.client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          await ctx.client.query(`RELEASE SAVEPOINT ${sp}`);
          throw err;
        } finally {
          ctx.depth--;
        }
      }

      const client = await pool.connect();
      const store: TxContext = { client, depth: 0 };
      try {
        return await als.run(store, async () => {
          await client.query('BEGIN');
          try {
            const out = await fn();
            await client.query('COMMIT');
            return out;
          } catch (err) {
            try {
              await client.query('ROLLBACK');
            } catch {
              /* koneksi mungkin sudah tidak sehat; error asli tetap dilempar */
            }
            throw err;
          }
        });
      } finally {
        client.release();
      }
    },

    async exec(sql: string): Promise<void> {
      const ctx = als.getStore();
      if (ctx) {
        await ctx.client.query(sql);
        return;
      }
      await pool.query(sql);
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };

  return db;
}

function sslFor(databaseUrl: string): { rejectUnauthorized: boolean } | undefined {
  try {
    const url = new URL(databaseUrl);
    if (url.searchParams.get('sslmode') === 'disable') return undefined;
    const host = url.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return undefined;
    return { rejectUnauthorized: false };
  } catch {
    return undefined;
  }
}

/** Lokasi untuk log — kredensial tidak pernah ikut tercetak. */
function describeLocation(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return 'postgres';
  }
}

export async function openDb(databaseUrl: string): Promise<Db> {
  const pool: PoolLike = new Pool({
    connectionString: databaseUrl,
    max: 10,
    ssl: sslFor(databaseUrl),
  });
  const db = createDb(pool, describeLocation(databaseUrl));
  await db.exec(schemaSql());
  await db.run(
    'INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',
    'version', SCHEMA_VERSION,
  );
  return db;
}

/* ── Counter bernomor urut (kode order, id event, id transaksi) ── */

export async function nextCounter(db: Db, name: string, step = 1): Promise<number> {
  await db.run('INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = counters.value + ?', name, step, step);
  const row = await db.get<{ value: number }>('SELECT value FROM counters WHERE name = ?', name);
  return row?.value ?? step;
}

export async function peekCounter(db: Db, name: string): Promise<number> {
  return (await db.get<{ value: number }>('SELECT value FROM counters WHERE name = ?', name))?.value ?? 0;
}

export async function setCounter(db: Db, name: string, value: number): Promise<void> {
  await db.run('INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = ?', name, value, value);
}

/* ── Settings kunci/nilai ── */

export async function getSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const row = await db.get<{ value_json: string }>('SELECT value_json FROM settings WHERE key = ?', key);
  return row ? jparse<T>(row.value_json, fallback) : fallback;
}

export async function setSetting(db: Db, key: string, value: unknown): Promise<void> {
  await db.run(
    'INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = ?',
    key, jstr(value), jstr(value),
  );
}
