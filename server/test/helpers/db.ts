import { PGlite } from '@electric-sql/pglite';
import {
  createDb, schemaSql, type Db, type PoolLike, type QueryResultLike, type SqlParam,
} from '../../src/db/client.ts';

/**
 * Database PostgreSQL in-memory (PGlite) untuk test. SQL, transaksi, dan
 * semantik `ON CONFLICT` sama dengan Neon — tanpa perlu koneksi jaringan.
 */
export async function openTestDb(): Promise<Db> {
  const pg = new PGlite({ parsers: { 20: (v: string) => Number(v) } });

  const query = async (sql: string, params?: SqlParam[]): Promise<QueryResultLike> => {
    const res = await pg.query(sql, params as unknown[] | undefined);
    return {
      rows: res.rows as Record<string, unknown>[],
      rowCount: res.rowCount ?? res.affectedRows ?? null,
    };
  };

  const pool: PoolLike = {
    query,
    connect: async () => ({ query, release: () => { /* PGlite satu koneksi */ } }),
    end: async () => { await pg.close(); },
  };

  await pg.exec(schemaSql());
  return createDb(pool, 'pglite:memory');
}
