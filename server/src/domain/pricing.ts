import { FREE_SHIP_ABOVE, MIN_KG_ORDER, PROTECT_RATE, SHIP_FEE } from './constants.ts';
import type { Addon, OrderItem, OrderMode, Promo, Quote, QuoteLine, Service } from './types.ts';

/**
 * Mesin harga — satu-satunya tempat tagihan dihitung.
 *
 * Frontend punya salinan rumus ini di `calc()` supaya keranjang tetap responsif
 * tanpa jaringan; bila keduanya berbeda, angka server yang dipakai. Semua jalur
 * (checkout pelanggan, order walk-in kasir, seed database) lewat `quote()`.
 */

export interface PriceBook {
  services: Service[];
  addons: Addon[];
  promos: Promo[];
}

export interface QuoteInput {
  items: OrderItem[];
  addons: string[];
  mode: OrderMode;
  promoCode?: string | null;
  protect?: boolean;
}

export function needsCourier(mode: OrderMode): boolean {
  return mode === 'pickup' || mode === 'delivery';
}

export function findService(book: PriceBook, id: string): Service | undefined {
  return book.services.find((s) => s.id === id);
}

export function kgTotalOf(items: OrderItem[], services: Service[]): number {
  return items.reduce((a, it) => {
    const s = services.find((x) => x.id === it.id);
    return s && s.unit === 'kg' ? a + it.qty : a;
  }, 0);
}

export function unitTotalOf(items: OrderItem[], services: Service[]): number {
  return items.reduce((a, it) => {
    const s = services.find((x) => x.id === it.id);
    return s && s.unit !== 'kg' ? a + it.qty : a;
  }, 0);
}

/** Berat yang dipakai lantai: jumlah kg layanan per kg + jumlah unit layanan per unit. */
export function weightOf(items: OrderItem[], services: Service[]): number {
  return Math.round((kgTotalOf(items, services) + unitTotalOf(items, services)) * 10) / 10;
}

/**
 * Syarat promo, dalam kalimat yang bisa langsung dibaca pelanggan.
 * Mengembalikan null bila promo sah dipakai.
 */
export function promoRejectReason(
  promo: Promo, input: QuoteInput, kgTotal: number, sub: number,
): string | null {
  if (!promo.active) return `Kode ${promo.code} sudah tidak berlaku.`;
  if (promo.minKg > 0 && kgTotal < promo.minKg) {
    return `${promo.code} butuh minimal ${promo.minKg} kg cucian; keranjang Anda ${kgTotal} kg.`;
  }
  if (promo.minSub > 0 && sub < promo.minSub) {
    return `${promo.code} butuh belanja minimal Rp ${promo.minSub.toLocaleString('id-ID')}; tagihan Anda Rp ${sub.toLocaleString('id-ID')}.`;
  }
  if (promo.courierOnly && !needsCourier(input.mode)) {
    return `${promo.code} hanya untuk pesanan yang dijemput atau diantar kurir.`;
  }
  if (promo.requiresService.length) {
    const owned = new Set(input.items.filter((i) => i.qty > 0).map((i) => i.id));
    const missing = promo.requiresService.filter((id) => !owned.has(id));
    if (missing.length === promo.requiresService.length) {
      return `${promo.code} hanya berlaku untuk ${promo.requiresService.join(' / ')}.`;
    }
  }
  if (promo.excludesAddon.length) {
    const hit = promo.excludesAddon.filter((id) => input.addons.includes(id));
    if (hit.length) return `${promo.code} tidak bisa digabung dengan ${hit.join(', ')}.`;
  }
  return null;
}

/** Jam cycle terlama di keranjang; express memotong jadi 6 jam. */
export function hoursOf(items: OrderItem[], addons: string[], services: Service[]): number {
  if (addons.includes('express')) return 6;
  const hs = items
    .map((it) => services.find((s) => s.id === it.id))
    .filter((s): s is Service => Boolean(s && s.active !== false))
    .map((s) => s.hours);
  return hs.length ? Math.max(...hs) : 48;
}

export function quote(input: QuoteInput, book: PriceBook): Quote {
  const items = input.items.filter((i) => Number(i.qty) > 0);
  const lines: QuoteLine[] = [];
  let sub = 0;

  for (const it of items) {
    const s = findService(book, it.id);
    if (!s) continue;
    if (s.active === false) continue;
    const amt = Math.round(s.price * it.qty);
    sub += amt;
    lines.push({ n: s.name, q: it.qty, unit: s.unit, amt });
  }

  for (const id of input.addons) {
    const a = book.addons.find((x) => x.id === id);
    if (!a || a.active === false) continue;
    const kgT = kgTotalOf(items, book.services);
    const amt = a.kind === 'kg' ? Math.round(a.price * Math.max(1, kgT)) : a.price;
    sub += amt;
    lines.push({ n: a.name, q: 1, unit: a.kind === 'kg' ? 'kg' : 'paket', amt });
  }

  const kgTotal = kgTotalOf(items, book.services);
  const unitTotal = unitTotalOf(items, book.services);

  const ship = needsCourier(input.mode) && sub < FREE_SHIP_ABOVE ? SHIP_FEE : 0;

  let promo: Promo | null = null;
  let promoReject: string | null = null;
  let disc = 0;
  const rawCode = (input.promoCode ?? '').trim().toUpperCase();
  if (rawCode) {
    const found = book.promos.find((p) => p.code === rawCode) ?? null;
    if (!found) {
      promoReject = `Kode ${rawCode} tidak kami kenali.`;
    } else {
      const why = promoRejectReason(found, { ...input, addons: input.addons }, kgTotal, sub);
      if (why) {
        promoReject = why;
      } else {
        promo = found;
        disc = found.kind === 'pct'
          ? Math.min(Math.round((sub * found.value) / 100), found.cap)
          : Math.min(found.value, found.cap);
      }
    }
  }

  const prot = input.protect ? Math.round(sub * PROTECT_RATE) : 0;
  const total = Math.max(0, sub - disc + ship + prot);

  return {
    lines,
    sub,
    ship,
    disc,
    prot,
    total,
    promo,
    promoReject,
    kgTotal,
    unitTotal,
    weight: Math.round((kgTotal + unitTotal) * 10) / 10,
    minKgShort: kgTotal > 0 && kgTotal < MIN_KG_ORDER ? Math.round((MIN_KG_ORDER - kgTotal) * 10) / 10 : 0,
    hours: hoursOf(items, input.addons, book.services),
  };
}

/** Validasi keras untuk checkout: mengembalikan daftar alasan dalam bahasa Indonesia. */
export function quoteErrors(q: Quote, input: QuoteInput): string[] {
  const errs: string[] = [];
  if (!q.lines.length) errs.push('Belum ada layanan yang dipilih.');
  if (q.minKgShort > 0) errs.push(`Cucian per kg minimal ${MIN_KG_ORDER} kg; kurang ${q.minKgShort} kg lagi.`);
  if (input.mode === 'drop' && input.addons.includes('express')) {
    errs.push('Express 6 jam hanya tersedia untuk pesanan yang dijemput kurir.');
  }
  return errs;
}
