import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/client.ts';
import * as R from '../db/repo.ts';
import { SLOTS } from '../domain/constants.ts';
import { quote, quoteErrors } from '../domain/pricing.ts';
import type { Order, OrderItem, OrderMode, PayMethod, Priority } from '../domain/types.ts';
import { badRequest, conflict, forbidden, notFound } from '../lib/http.ts';
import { uid } from '../lib/ids.ts';
import { makeRequireRole } from '../plugins/auth.ts';

/**
 * Order: daftar, checkout pelanggan, walk-in kasir, bayar, ambil, batalkan,
 * pindah jadwal. Semua angka tagihan keluar dari mesin pricing server —
 * angka dari klien tidak pernah dipercaya.
 */

interface CheckoutBody {
  items?: { id: string; qty: number }[];
  addons?: string[];
  mode?: string;
  promoCode?: string;
  protect?: boolean;
  slotDate?: string;
  slotTime?: string;
  notes?: string;
  pay?: string;
  weight?: number;
}

interface WalkinBody extends CheckoutBody {
  customer?: string;
  phone?: string;
  priority?: string;
}

interface PayBody { method?: string }
interface ReslotBody { slotTime?: string }

function parseCheckout(body: CheckoutBody) {
  const items: OrderItem[] = (body.items ?? [])
    .map((i) => ({ id: String(i.id ?? '').trim(), qty: Number(i.qty) || 0 }))
    .filter((i) => i.id && i.qty > 0);
  const addons = [...new Set((body.addons ?? []).map((a) => String(a).trim()).filter(Boolean))];
  const mode = (String(body.mode ?? 'pickup')) as OrderMode;
  return {
    items,
    addons,
    mode: ['pickup', 'delivery', 'drop'].includes(mode) ? mode : 'pickup' as const,
    promoCode: body.promoCode ? String(body.promoCode) : null,
    protect: Boolean(body.protect),
    slotDate: String(body.slotDate ?? ''),
    slotTime: String(body.slotTime ?? ''),
    notes: String(body.notes ?? ''),
    pay: (String(body.pay ?? 'qris')) as PayMethod,
    weight: Number(body.weight) || 0,
  };
}

async function checkoutPayload(db: Db, input: CheckoutBody, customerId: string | null) {
  const parsed = parseCheckout(input);
  const book = await R.priceBook(db);
  const q = quote({
    items: parsed.items, addons: parsed.addons, mode: parsed.mode,
    promoCode: parsed.promoCode, protect: parsed.protect,
  }, book);
  const errs = quoteErrors(q, {
    items: parsed.items, addons: parsed.addons, mode: parsed.mode,
    promoCode: parsed.promoCode, protect: parsed.protect,
  });
  return { parsed, q, errs, customerId };
}

export function registerOrderRoutes(app: FastifyInstance, db: Db): void {
  const requireRole = makeRequireRole(db);
  const staff = requireRole('staff', 'admin');
  const anyUser = requireRole('admin', 'staff', 'customer');

  /* ── Daftar ─────────────────────────────────────────── */

  app.get(
    '/api/orders',
    { preHandler: anyUser },
    async (req) => {
      const query = (req.query ?? {}) as { q?: string; stage?: string; limit?: string };
      const role = req.auth!.role;
      let orders = await R.listOrders(db, { includeCancelled: true });
      if (role === 'customer') {
        const customer = (await R.listCustomers(db)).find((c) => c.userId === req.auth!.userId);
        orders = orders.filter((o) => o.customerId === customer?.id);
      }
      const q = (query.q ?? '').trim().toLowerCase();
      if (q) {
        orders = orders.filter(
          (o) => o.code.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q),
        );
      }
      const stage = Number.parseInt(query.stage ?? '', 10);
      if (Number.isFinite(stage)) orders = orders.filter((o) => o.stage === stage);
      const limit = Math.min(200, Number.parseInt(query.limit ?? '100', 10) || 100);
      return { ok: true, count: orders.length, orders: orders.slice(0, limit) };
    },
  );

  app.get(
    '/api/orders/:code',
    { preHandler: anyUser },
    async (req) => {
      const code = (req.params as { code: string }).code;
      const order = await R.findOrderByCode(db, code);
      if (!order) throw notFound(`Order ${code} tidak ditemukan.`);
      if (req.auth!.role === 'customer') {
        const customer = (await R.listCustomers(db)).find((c) => c.userId === req.auth!.userId);
        if (order.customerId !== customer?.id) throw forbidden('Order ini milik pelanggan lain.');
      }
      return { ok: true, order, events: await R.listEvents(db, { code: order.code, limit: 100 }) };
    },
  );

  /* ── Checkout pelanggan ─────────────────────────────── */

  app.post(
    '/api/orders',
    { preHandler: requireRole('customer') },
    async (req) => {
      const customer = (await R.listCustomers(db)).find((c) => c.userId === req.auth!.userId);
      if (!customer) throw notFound('Akun belum tertaut ke profil pelanggan.');

      const { parsed, q, errs } = await checkoutPayload(db, (req.body ?? {}) as CheckoutBody, customer.id);
      if (errs.length) throw badRequest('Keranjang belum bisa dibayar.', { reasons: errs });
      if (parsed.mode !== 'drop' && (!parsed.slotDate || !parsed.slotTime)) {
        throw badRequest('Pilih tanggal dan slot jemput/antar.');
      }

      return await createOrder(db, {
        customerId: customer.id, customer: customer.name, phone: customer.phone,
        items: parsed.items, addons: parsed.addons, mode: parsed.mode,
        promoCode: parsed.promoCode, protect: parsed.protect, pay: parsed.pay,
        slotDate: parsed.slotDate, slotTime: parsed.slotTime, notes: parsed.notes,
        priority: parsed.addons.includes('express') ? 'express' : 'reguler',
        quote: q, source: 'api',
      });
    },
  );

  /* ── Walk-in kasir ──────────────────────────────────── */

  app.post(
    '/api/orders/walkin',
    { preHandler: staff },
    async (req) => {
      const body = (req.body ?? {}) as WalkinBody;
      const name = String(body.customer ?? '').trim();
      const phone = String(body.phone ?? '').trim();
      if (!name) throw badRequest('Nama pelanggan wajib diisi.');

      const { parsed, q, errs } = await checkoutPayload(db, body, null);
      if (errs.length) throw badRequest('Keranjang belum bisa dibayar.', { reasons: errs });

      const existing = await R.getCustomerByName(db, name) ?? (phone ? await R.getCustomerByPhone(db, phone) : undefined);
      const customer = existing ?? {
        id: uid('c'), userId: null, name, phone, tier: 'basic',
        tierMs: null, renewsMs: null, stamps: 0, balance: 0, isWalkin: true,
        createdMs: Date.now(),
      };
      if (!existing) await R.insertCustomer(db, customer);

      const priority: Priority = (String(body.priority ?? 'reguler') === 'express' ? 'express' : 'reguler');

      return await createOrder(db, {
        customerId: customer.id, customer: customer.name, phone: customer.phone,
        items: parsed.items, addons: parsed.addons, mode: parsed.mode,
        promoCode: parsed.promoCode, protect: parsed.protect, pay: parsed.pay,
        slotDate: parsed.slotDate, slotTime: parsed.slotTime, notes: parsed.notes,
        priority, quote: q, source: 'api',
      });
    },
  );

  /* ── Bayar ──────────────────────────────────────────── */

  /* Hanya kasir/staf yang boleh menandai lunas — pelanggan tidak boleh
     mengubah status pembayarannya sendiri. */
  app.post(
    '/api/orders/:code/pay',
    { preHandler: staff },
    async (req) => {
      const code = (req.params as { code: string }).code;
      const order = await R.findOrderByCode(db, code);
      if (!order) throw notFound(`Order ${code} tidak ditemukan.`);
      if (order.payStatus === 'lunas') throw conflict(`${order.code} sudah lunas.`);
      if (order.cancelled) throw conflict(`${order.code} sudah dibatalkan.`);

      const method = (String((req.body as PayBody | undefined)?.method ?? order.pay)) as PayMethod;
      return await payOrder(db, order, method);
    },
  );

  /* ── Pindah jadwal jemput ───────────────────────────── */

  /* Pelanggan boleh memindah jam pesanannya sendiri selama belum masuk
     lantai (tahap 0–1); setelah itu harus lewat kasir. */
  app.post(
    '/api/orders/:code/reslot',
    { preHandler: anyUser },
    async (req) => {
      const code = (req.params as { code: string }).code;
      const order = await R.findOrderByCode(db, code);
      if (!order) throw notFound(`Order ${code} tidak ditemukan.`);
      if (req.auth!.role === 'customer') {
        const customer = (await R.listCustomers(db)).find((c) => c.userId === req.auth!.userId);
        if (order.customerId !== customer?.id) throw forbidden('Order ini milik pelanggan lain.');
      }
      if (order.cancelled) throw conflict(`${order.code} sudah dibatalkan.`);
      if (order.stage > 1) throw conflict(`${order.code} sudah masuk lantai — ubah jadwal lewat kasir.`);

      const slotTime = String((req.body as ReslotBody | undefined)?.slotTime ?? '').trim();
      if (!SLOTS.includes(slotTime)) {
        throw badRequest(`Jam tidak dikenal. Pilihan: ${SLOTS.join(', ')}.`);
      }
      const updated = await R.patchOrder(db, order.code, { slotTime });
      await R.insertNotification(db, {
        customerId: order.customerId, tone: 'blue', icon: 'calendar',
        title: `${order.code} dipindah ke jam ${slotTime}`,
        msg: 'Jadwal jemput baru tersimpan — kurir menyesuaikan.',
      });
      return { ok: true, order: updated };
    },
  );

  /* ── Ambil ──────────────────────────────────────────── */

  app.post(
    '/api/orders/:code/collect',
    { preHandler: staff },
    async (req) => {
      const code = (req.params as { code: string }).code;
      const order = await R.findOrderByCode(db, code);
      if (!order) throw notFound(`Order ${code} tidak ditemukan.`);
      if (order.collected) throw conflict(`${order.code} sudah diambil.`);
      if (order.cancelled) throw conflict(`${order.code} sudah dibatalkan.`);
      if (order.payStatus !== 'lunas') throw conflict(`${order.code} belum lunas — tagih dulu.`);
      const updated = await R.patchOrder(db, order.code, { collected: true });
      await R.insertNotification(db, {
        customerId: order.customerId, tone: 'blue', icon: 'check',
        title: `${order.code} diambil`, msg: 'Terima kasih, sampai jumpa cucian berikutnya.',
      });
      return { ok: true, order: updated };
    },
  );

  /* ── Batalkan ───────────────────────────────────────── */

  app.post(
    '/api/orders/:code/cancel',
    { preHandler: anyUser },
    async (req) => {
      const code = (req.params as { code: string }).code;
      const order = await R.findOrderByCode(db, code);
      if (!order) throw notFound(`Order ${code} tidak ditemukan.`);
      if (req.auth!.role === 'customer') {
        const customer = (await R.listCustomers(db)).find((c) => c.userId === req.auth!.userId);
        if (order.customerId !== customer?.id) throw forbidden('Order ini milik pelanggan lain.');
      }
      if (order.cancelled) throw conflict(`${order.code} sudah dibatalkan.`);
      if (order.stage > 0) throw conflict(
        `${order.code} sudah masuk lantai (tahap ${order.stage}) — batalkan lewat kasir.`,
      );

      return await db.tx(async () => {
        let refund: number | null = null;
        if (order.payStatus === 'lunas') {
          if (order.pay === 'wallet' && order.customerId) {
            refund = order.total;
            await R.adjustBalance(db, order.customerId, order.total);
            await R.insertTx(db, {
              customerId: order.customerId, type: 'refund',
              label: `Refund ${order.code} (dibatalkan)`, amount: order.total, status: 'sukses',
              orderCode: order.code, atMs: Date.now(),
            });
          }
          await R.patchOrder(db, order.code, { payStatus: 'dikembalikan' });
        }
        await R.patchOrder(db, order.code, { cancelled: true });
        return { ok: true, order: await R.getOrder(db, order.code), refund };
      });
    },
  );
}

/** Satu titik penciptaan order — kode, tagihan, dan pembayaran awal konsisten. */
async function createOrder(db: Db, input: {
  customerId: string | null;
  customer: string;
  phone: string;
  items: OrderItem[];
  addons: string[];
  mode: OrderMode;
  promoCode: string | null;
  protect: boolean;
  pay: PayMethod;
  slotDate: string;
  slotTime: string;
  notes: string;
  priority: Priority;
  quote: ReturnType<typeof quote>;
  source: Order['source'];
}) {
  const q = input.quote;
  return await db.tx(async () => {
    const code = await R.nextOrderCode(db);
    const paid = input.pay === 'wallet' || input.pay === 'qris';
    await R.insertOrder(db, {
      code,
      customerId: input.customerId, customer: input.customer, phone: input.phone,
      weight: q.weight, mode: input.mode, items: input.items, addons: input.addons,
      subtotal: q.sub, ship: q.ship, disc: q.disc, protect: q.prot, total: q.total,
      promoCode: q.promo?.code ?? null, pay: input.pay, payStatus: paid ? 'lunas' : 'belum',
      priority: input.priority, slotDate: input.slotDate, slotTime: input.slotTime,
      courier: '—', notes: input.notes, createdMs: Date.now(), source: input.source,
    });

    let tx = null;
      if (paid) {
        if (input.pay === 'wallet' && input.customerId) {
          const balance = (await R.getCustomer(db, input.customerId))?.balance ?? 0;
          if (balance < q.total) {
            throw conflict('Saldo dompet tidak cukup.', {
              balance, needed: q.total,
              hint: 'Pilih QRIS atau tunai saat penjemputan.',
            });
          }
          await R.adjustBalance(db, input.customerId, -q.total);
          tx = await R.insertTx(db, {
            customerId: input.customerId, type: 'pay', label: `Bayar ${code}`,
            amount: -q.total, status: 'sukses', orderCode: code, atMs: Date.now(),
          });
        }
        await R.bumpRevenue(db, Date.now(), q.total);
      }
    return { ok: true, order: await R.getOrder(db, code)!, quote: q, tx };
  });
}

/** Proses pembayaran pesanan yang belum lunas. */
async function payOrder(db: Db, order: Order, method: PayMethod) {
  return await db.tx(async () => {
    if (method === 'wallet') {
      if (!order.customerId) throw conflict('Order walk-in tidak punya dompet — pakai QRIS atau tunai.');
      const balance = (await R.getCustomer(db, order.customerId))?.balance ?? 0;
      if (balance < order.total) {
        throw conflict('Saldo dompet tidak cukup.', { balance, needed: order.total });
      }
      await R.adjustBalance(db, order.customerId, -order.total);
      await R.insertTx(db, {
        customerId: order.customerId, type: 'pay', label: `Bayar ${order.code}`,
        amount: -order.total, status: 'sukses', orderCode: order.code, atMs: Date.now(),
      });
    }
    await R.patchOrder(db, order.code, { pay: method, payStatus: 'lunas' });
    await R.bumpRevenue(db, Date.now(), order.total);
    return { ok: true, order: await R.getOrder(db, order.code) };
  });
}
