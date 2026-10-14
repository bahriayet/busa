/**
 * Cache TTL kecil di memori proses untuk data publik yang jarang berubah.
 *
 * - `ttlMs <= 0` mematikan cache sepenuhnya (dipakai test).
 * - Permintaan bersamaan untuk kunci yang sama berbagi satu pemuatan
 *   (anti-stampede) sehingga lonjakan pembaca awal tidak menghajar database.
 * - `invalidate()` membatalkan pemuatan yang sedang berjalan supaya nilai
 *   basi tidak ikut tersimpan setelah admin mengubah data.
 */

export class TtlCache {
  private readonly store = new Map<string, { at: number; value: unknown }>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly gen = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  async wrap<T>(key: string, fn: () => Promise<T>, ttlMs: number = this.ttlMs): Promise<T> {
    const ttl = Math.min(ttlMs, this.ttlMs);
    if (ttl <= 0) return fn();

    const hit = this.store.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value as T;

    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const gen = this.gen.get(key) ?? 0;
    const load = fn()
      .then((value) => {
        if ((this.gen.get(key) ?? 0) === gen) this.store.set(key, { at: Date.now(), value });
        return value;
      })
      .finally(() => {
        if (this.inflight.get(key) === load) this.inflight.delete(key);
      });
    this.inflight.set(key, load);
    return load;
  }

  invalidate(...keys: string[]): void {
    for (const key of keys) {
      this.gen.set(key, (this.gen.get(key) ?? 0) + 1);
      this.store.delete(key);
      this.inflight.delete(key);
    }
  }
}

/** Kunci cache terpusat — route penulis memakai nama yang sama saat invalidasi. */
export const CACHE = {
  meta: 'meta',
  catalogStaff: 'catalog:staff',
  catalogPublic: 'catalog:public',
  content: 'content',
  qris: 'qris',
  live: 'live',
} as const;
