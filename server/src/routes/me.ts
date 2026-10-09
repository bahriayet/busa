import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/client.ts';
import * as R from '../db/repo.ts';
import { TOPUP_BONUS, TOPUP_BONUS_THRESHOLD } from '../domain/constants.ts';
import type { Address, ChatMessage, WalletTx } from '../domain/types.ts';
import { badRequest, notFound } from '../lib/http.ts';
import { uid } from '../lib/ids.ts';
import { makeRequireRole } from '../plugins/auth.ts';

/**
 * Portal pelanggan. Semua jalur butuh peran customer dan dipatok ke baris
 * customers yang tertaut ke akun login — pelanggan tidak bisa menyentuh
 * data pelanggan lain.
 */

interface TopupBody { amount: number }
interface AddressBody { tag: string; label: string; def?: boolean }
interface ChatBody { text: string }

export function registerMeRoutes(app: FastifyInstance, db: Db): void {
  const requireRole = makeRequireRole(db);
  const me = requireRole('customer');

  app.get('/api/me', { preHandler: me }, async (req) => {
    const customer = (await R.listCustomers(db)).find((c) => c.userId === req.auth!.userId);
    if (!customer) throw notFound('Akun belum tertaut ke profil pelanggan.');

    const orders = await R.listOrders(db, { customerId: customer.id });
    const balance = customer.balance;
    const txns: WalletTx[] = await R.listTx(db, customer.id);
    const addresses: Address[] = await R.listAddresses(db, customer.id);
    const notifs = await R.listNotifications(db, customer.id);
    const chat: ChatMessage[] = await R.listChat(db, customer.id);
    const tier = (await R.listTiers(db)).find((t) => t.id === customer.tier) ?? null;

    return {
      ok: true,
      customer: {
        id: customer.id, name: customer.name, phone: customer.phone, tier: customer.tier,
        stamps: customer.stamps, balance, memberSince: customer.createdMs,
        renewsMs: customer.renewsMs,
      },
      tier,
      wallet: { balance, txns },
      addresses,
      notifs,
      chat,
      orders,
    };
  });

  app.post('/api/me/topup', { preHandler: me }, async (req) => {
    const amount = Math.round(Number((req.body as TopupBody | undefined)?.amount));
    if (!Number.isFinite(amount) || amount < 10_000) {
      throw badRequest('Top up minimal Rp 10.000.');
    }
    const customer = (await R.listCustomers(db)).find((c) => c.userId === req.auth!.userId);
    if (!customer) throw notFound('Akun belum tertaut ke profil pelanggan.');

    let bonus = 0;
    const rows = await db.tx(async () => {
      const b = amount >= TOPUP_BONUS_THRESHOLD ? TOPUP_BONUS : 0;
      await R.adjustBalance(db, customer.id, amount + b);
      const tx = await R.insertTx(db, {
        customerId: customer.id, type: 'topup',
        label: `Top up Rp ${amount.toLocaleString('id-ID')} via QRIS`,
        amount, status: 'sukses', atMs: Date.now(),
      });
      if (b) {
        await R.insertTx(db, {
          customerId: customer.id, type: 'cashback',
          label: `Bonus top up Rp ${TOPUP_BONUS.toLocaleString('id-ID')}`,
          amount: b, status: 'sukses', atMs: Date.now(),
        });
      }
      return { tx, b };
    });

    return { ok: true, bonus: rows.b, tx: rows.tx, balance: (await R.getCustomer(db, customer.id))?.balance };
  });

  app.post('/api/me/addresses', { preHandler: me }, async (req) => {
    const customer = (await R.listCustomers(db)).find((c) => c.userId === req.auth!.userId);
    if (!customer) throw notFound('Akun belum tertaut ke profil pelanggan.');
    const body = (req.body ?? {}) as AddressBody;
    const tag = String(body.tag ?? '').trim();
    const label = String(body.label ?? '').trim();
    if (!tag || !label) throw badRequest('Tag dan alamat wajib diisi.');
    const addresses = await R.insertAddress(db, {
      id: uid('a'), customerId: customer.id, tag, label, def: Boolean(body.def),
    });
    return { ok: true, addresses: await R.listAddresses(db, customer.id), added: addresses };
  });

  app.delete('/api/me/addresses/:id', { preHandler: me }, async (req) => {
    const customer = (await R.listCustomers(db)).find((c) => c.userId === req.auth!.userId);
    if (!customer) throw notFound('Akun belum tertaut ke profil pelanggan.');
    const id = (req.params as { id: string }).id;
    const exists = (await R.listAddresses(db, customer.id)).some((a) => a.id === id);
    if (!exists) throw notFound('Alamat tidak ditemukan.');
    return { ok: true, addresses: await R.deleteAddress(db, id, customer.id) };
  });

  app.post('/api/me/addresses/:id/default', { preHandler: me }, async (req) => {
    const customer = (await R.listCustomers(db)).find((c) => c.userId === req.auth!.userId);
    if (!customer) throw notFound('Akun belum tertaut ke profil pelanggan.');
    return { ok: true, addresses: await R.setDefaultAddress(db, (req.params as { id: string }).id, customer.id) };
  });

  app.post('/api/me/chat', { preHandler: me }, async (req) => {
    const customer = (await R.listCustomers(db)).find((c) => c.userId === req.auth!.userId);
    if (!customer) throw notFound('Akun belum tertaut ke profil pelanggan.');
    const text = String((req.body as ChatBody | undefined)?.text ?? '').trim();
    if (!text) throw badRequest('Pesan kosong.');
    await R.insertChat(db, { customerId: customer.id, from: 'me', text });
    const replyText = botReply(text, customer.name);
    const bot = await R.insertChat(db, { customerId: customer.id, from: 'bot', text: replyText });
    return { ok: true, chat: await R.listChat(db, customer.id), bot };
  });

  app.post('/api/me/notifs/read', { preHandler: me }, async (req) => {
    const customer = (await R.listCustomers(db)).find((c) => c.userId === req.auth!.userId);
    if (!customer) throw notFound('Akun belum tertaut ke profil pelanggan.');
    return { ok: true, marked: await R.markNotificationsRead(db, customer.id) };
  });
}

/** Balasan bot sederhana — cukup hidup untuk demo, jujur bahwa ia bot. */
function botReply(text: string, name: string): string {
  const t = text.toLowerCase();
  if (/(harga|tarif|biaya|bayar)/.test(t)) {
    return 'Cuci + Setrika Rp 8.000/kg (min. 3 kg). Express 6 jam Rp 25.000. Mau saya hitungkan total keranjang Anda?';
  }
  if (/(status|sampai|posisi|lacak)/.test(t)) {
    return 'Buka tab Lacak dan ketik nomor order (misal BUSA-4471). Saya juga bisa cekkan untuk Anda — kirim 4 digit terakhirnya.';
  }
  if (/(noda|kunyit|kopi)/.test(t)) {
    return 'Treatment noda Rp 4.000/kg dengan rendam enzimatik 20 menit. Success rate 94% untuk linen katun.';
  }
  return `Tercatat, ${name.split(' ')[0]}. Tim kami balas dalam beberapa menit.`;
}
