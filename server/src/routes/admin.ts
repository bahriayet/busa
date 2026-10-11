import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/client.ts';
import * as R from '../db/repo.ts';
import { badRequest, notFound, conflict } from '../lib/http.ts';
import { IMAGE_DATA_URL, IMAGE_MAX_BYTES, IMAGE_MAX_UPLOAD_BYTES, imageBytes } from '../lib/images.ts';
import { makeRequireRole } from '../plugins/auth.ts';
import { hashPassword } from '../lib/password.ts';
import { uid } from '../lib/ids.ts';

/**
 * Admin: harga katalog, promo, mesin, konten, user management, dan reset database.
 * Perubahan harga langsung terasa di mesin pricing — tidak ada jalur lain.
 */

interface PricePatch { price?: number; hours?: number; active?: boolean; name?: string }
interface AddonPatch { price?: number; active?: boolean; name?: string }
interface MachinePatch {
  cap?: number; kind?: string; state?: string;
  stage?: number; rpm?: number; temp?: number; load?: number; left?: number;
}
interface ContentPatch { value: unknown }
interface CreateUserBody { name: string; username?: string; phone?: string; password: string; role: 'admin' | 'staff' | 'customer' }
interface PatchUserBody { name?: string; role?: 'admin' | 'staff' | 'customer'; active?: boolean; newPassword?: string }

export function registerAdminRoutes(app: FastifyInstance, db: Db): void {
  const requireRole = makeRequireRole(db);
  const admin = requireRole('admin');

  app.patch('/api/services/:id', { preHandler: admin }, async (req) => {
    const id = (req.params as { id: string }).id;
    const body = (req.body ?? {}) as PricePatch;
    if (!await R.getService(db, id)) throw notFound('Layanan tidak ditemukan.');
    const patch: Partial<{ price: number; hours: number; active: boolean; name: string }> = {};
    if (body.price !== undefined) {
      const price = Math.round(Number(body.price));
      if (!Number.isFinite(price) || price < 0) throw badRequest('Harga tidak sah.');
      patch.price = price;
    }
    if (body.hours !== undefined) {
      const hours = Math.round(Number(body.hours));
      if (!Number.isFinite(hours) || hours < 1) throw badRequest('Jam siklus minimal 1.');
      patch.hours = hours;
    }
    if (body.active !== undefined) patch.active = Boolean(body.active);
    if (body.name !== undefined) patch.name = String(body.name).trim() || undefined;
    return { ok: true, service: await R.patchService(db, id, patch) };
  });

  app.patch('/api/promos/:code', { preHandler: admin }, async (req) => {
    const code = (req.params as { code: string }).code.toUpperCase();
    const body = (req.body ?? {}) as { active?: boolean };
    const promo = (await R.listPromos(db)).find((p) => p.code === code);
    if (!promo) throw notFound(`Promo ${code} tidak ditemukan.`);
    const active = body.active !== undefined ? Boolean(body.active) : promo.active;
    await R.upsertPromo(db, { ...promo, active });
    return { ok: true, promo: (await R.listPromos(db)).find((p) => p.code === code) };
  });

  app.patch('/api/addons/:id', { preHandler: admin }, async (req) => {
    const id = (req.params as { id: string }).id;
    const body = (req.body ?? {}) as AddonPatch;
    if (!await R.getAddon(db, id)) throw notFound('Tambahan tidak ditemukan.');
    const patch: Partial<{ price: number; active: boolean; name: string }> = {};
    if (body.price !== undefined) {
      const price = Math.round(Number(body.price));
      if (!Number.isFinite(price) || price < 0) throw badRequest('Harga tidak sah.');
      patch.price = price;
    }
    if (body.active !== undefined) patch.active = Boolean(body.active);
    if (body.name !== undefined) patch.name = String(body.name).trim() || undefined;
    return { ok: true, addon: await R.patchAddon(db, id, patch) };
  });

  app.patch('/api/machines/:id', { preHandler: admin }, async (req) => {
    const id = (req.params as { id: string }).id.toUpperCase();
    const body = (req.body ?? {}) as MachinePatch;
    const m = await R.getMachine(db, id);
    if (!m) throw notFound(`Mesin ${id} tidak ditemukan.`);
    const patch: Record<string, unknown> = {};
    if (body.cap !== undefined) {
      const cap = Math.round(Number(body.cap));
      if (!Number.isFinite(cap) || cap <= 0) throw badRequest('Kapasitas harus positif.');
      patch.cap = cap;
    }
    if (body.kind !== undefined) {
      if (!['wash', 'dry', 'steam', 'dryclean'].includes(String(body.kind))) throw badRequest('Jenis mesin tidak dikenal.');
      patch.kind = String(body.kind);
    }
    if (body.state !== undefined) {
      if (!['run', 'hot', 'vent', 'idle'].includes(String(body.state))) throw badRequest('Status mesin tidak dikenal.');
      patch.state = String(body.state);
    }
    if (body.stage !== undefined) {
      const stage = Math.round(Number(body.stage));
      if (!Number.isFinite(stage) || stage < 0 || stage > 8) throw badRequest('Tahap mesin harus 0–8.');
      patch.stage = stage;
    }
    if (body.rpm !== undefined) {
      const rpm = Math.round(Number(body.rpm));
      if (!Number.isFinite(rpm) || rpm < 0 || rpm > 14) throw badRequest('RPM harus 0–14.');
      patch.rpm = rpm;
    }
    if (body.temp !== undefined) {
      const temp = Number(body.temp);
      if (!Number.isFinite(temp) || temp < 15 || temp > 140) throw badRequest('Suhu harus 15–140 °C.');
      patch.temp = Math.round(temp * 10) / 10;
    }
    if (body.load !== undefined) {
      const load = Math.round(Number(body.load));
      if (!Number.isFinite(load) || load < 0 || load > 100) throw badRequest('Beban harus 0–100%.');
      patch.load = load;
    }
    if (body.left !== undefined) {
      const left = Math.round(Number(body.left));
      if (!Number.isFinite(left) || left < 0 || left > 24 * 60) throw badRequest('Sisa menit harus 0–1440.');
      patch.left = left;
    }
    return { ok: true, machine: await R.patchMachine(db, id, patch) };
  });

  app.patch('/api/content/:key', { preHandler: admin }, async (req) => {
    const key = (req.params as { key: string }).key;
    const body = (req.body ?? {}) as ContentPatch;
    if (!['gallery', 'faq', 'testimonials', 'metrics'].includes(key)) throw notFound('Kunci konten tidak dikenal.');
    if (body.value === undefined) throw badRequest('Isi `value`.');
    await R.setContent(db, key, body.value);
    return { ok: true, value: await R.getContent(db, key, null) };
  });

  app.post('/api/reset', { preHandler: admin }, async () => {
    throw badRequest('Reset database tidak tersedia lewat HTTP saat server berjalan. Jalankan `npm run db:reset`.');
  });

  /* ── QRIS pembayaran ─────────────────────────────────────── */

  /** Unggah/ganti gambar QRIS yang tampil di langkah pembayaran pelanggan. */
  app.put('/api/qris', { preHandler: admin, bodyLimit: IMAGE_MAX_UPLOAD_BYTES }, async (req) => {
    const body = (req.body ?? {}) as { dataUrl?: unknown };
    const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
    if (!IMAGE_DATA_URL.test(dataUrl)) {
      throw badRequest('Gambar QRIS harus PNG, JPG, WEBP, atau GIF (data URL base64).');
    }
    if (imageBytes(dataUrl) > IMAGE_MAX_BYTES) {
      throw badRequest('Ukuran gambar QRIS maksimal 2 MB.');
    }
    const qris = await R.setQrisImage(db, { dataUrl, updatedAt: Date.now() });
    return { ok: true, qris };
  });

  /** Hapus QRIS unggahan — pelanggan kembali melihat gambar bawaan. */
  app.delete('/api/qris', { preHandler: admin }, async () => {
    await R.setQrisImage(db, null);
    return { ok: true, qris: null };
  });

  /* ── User management ─────────────────────────────────────── */

  /** Daftar semua pengguna. */
  app.get('/api/users', { preHandler: admin }, async () => {
    return { ok: true, users: await R.listUsers(db) };
  });

  /** Buat pengguna baru (admin/staff/customer). */
  app.post('/api/users', { preHandler: admin }, async (req) => {
    const body = (req.body ?? {}) as CreateUserBody;
    const name = String(body.name ?? '').trim();
    const username = body.username ? String(body.username).trim().toLowerCase() : undefined;
    const phone = body.phone ? String(body.phone).trim() : undefined;
    const password = String(body.password ?? '');
    const role = body.role ?? 'staff';

    if (!name) throw badRequest('Nama wajib diisi.');
    if (!password || password.length < 6) throw badRequest('Password minimal 6 karakter.');
    if (!['admin', 'staff', 'customer'].includes(role)) throw badRequest('Peran tidak valid.');

    if (username && await R.findUserByUsername(db, username)) {
      throw conflict('Username sudah dipakai.');
    }
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (await R.findUserByPhoneDigits(db, digits)) {
        throw conflict('Nomor telepon sudah terdaftar.');
      }
    }

    const { salt, hash } = hashPassword(password);
    const id = uid('u');
    await R.insertUser(db, {
      id, role, name, phone: phone ?? null, username: username ?? null,
      salt, hash, createdMs: Date.now(),
    });

    // Jika customer, buat juga baris customer
    let customerId: string | null = null;
    if (role === 'customer' && phone) {
      customerId = uid('c');
      await R.insertCustomer(db, {
        id: customerId, userId: id, name, phone,
        tier: 'basic', tierMs: null, renewsMs: null, stamps: 0, balance: 0, isWalkin: false, createdMs: Date.now(),
      });
    }

    return { ok: true, user: await R.findUserById(db, id), customerId };
  });

  /** Update pengguna (nama, peran, status aktif, atau reset password). */
  app.patch('/api/users/:id', { preHandler: admin }, async (req) => {
    const id = (req.params as { id: string }).id;
    const body = (req.body ?? {}) as PatchUserBody;
    const existing = await R.findUserById(db, id);
    if (!existing) throw notFound('Pengguna tidak ditemukan.');

    if (body.name !== undefined || body.role !== undefined || body.active !== undefined) {
      const patch: Partial<Pick<typeof existing, 'name' | 'role' | 'active'>> = {};
      if (body.name !== undefined) patch.name = String(body.name).trim() || existing.name;
      if (body.role !== undefined) {
        if (!['admin', 'staff', 'customer'].includes(body.role)) throw badRequest('Peran tidak valid.');
        patch.role = body.role;
      }
      if (body.active !== undefined) patch.active = Boolean(body.active);
      await R.patchUser(db, id, patch);
    }

    if (body.newPassword) {
      if (body.newPassword.length < 6) throw badRequest('Password minimal 6 karakter.');
      const { salt, hash } = hashPassword(body.newPassword);
      await R.setUserPassword(db, id, salt, hash);
    }

    return { ok: true, user: await R.findUserById(db, id) };
  });

  /** Hapus pengguna. */
  app.delete('/api/users/:id', { preHandler: admin }, async (req) => {
    const id = (req.params as { id: string }).id;
    const existing = await R.findUserById(db, id);
    if (!existing) throw notFound('Pengguna tidak ditemukan.');
    if (!await R.deleteUser(db, id)) throw badRequest('Gagal menghapus pengguna.');
    return { ok: true };
  });
}
