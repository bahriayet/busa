import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from 'fastify';
import type { Config } from '../config.ts';
import type { Db } from '../db/client.ts';
import * as R from '../db/repo.ts';
import { verifyPassword, hashPassword } from '../lib/password.ts';
import { signToken, makeRequireRole } from '../plugins/auth.ts';
import { badRequest, unauthorized, conflict, tooMany } from '../lib/http.ts';
import { uid } from '../lib/ids.ts';
import type { User } from '../domain/types.ts';

/**
 * Autentikasi: login, register, logout, change-password, forgot-password,
 * reset-password.
 *
 * Login memakai username (staf/admin) atau nomor telepon (pelanggan), format
 * bebas — sama dengan `findUserByLogin`. Password dicek dengan scrypt +
 * timingSafeEqual; pengguna nonaktif tidak pernah bisa masuk.
 */

interface LoginBody {
  login: string;
  password: string;
}

interface RegisterBody {
  name: string;
  phone: string;
  password: string;
}

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

interface ForgotPasswordBody {
  login: string;
}

interface ResetPasswordBody {
  token: string;
  newPassword: string;
}

function publicUser(u: User): User {
  return { id: u.id, role: u.role, name: u.name, phone: u.phone, username: u.username, active: u.active };
}

export function registerAuthRoutes(app: FastifyInstance, db: Db, cfg: Config): void {
  const requireRole = makeRequireRole(db);
  const anyAuth = requireRole('admin', 'staff', 'customer');
  const authLimit = { config: { rateLimit: { max: cfg.rateLimitLoginMax, timeWindow: '15 minutes' } } };

  /* Hash dummy: akun yang tidak ada/nonaktif tetap menjalankan scrypt dengan
     biaya sama, sehingga waktu respons tidak membocorkan keberadaan akun. */
  const dummy = hashPassword('busa-timing-dummy-tidak-pernah-cocok');

  /*
   * Batas per akun: brute force yang menyebar lewat banyak IP tetap terhenti.
   * Kunci = identitas ternormalisasi ('0812-77..' ≡ '081277..'), jendela tetap
   * 15 menit, in-memory (satu proses). Batas per-IP dari rate-limit tetap ada.
   */
  const ACCOUNT_WINDOW_MS = 15 * 60 * 1000;
  const accountHits = new Map<string, { count: number; resetAt: number }>();
  const accountLimit = async (req: FastifyRequest): Promise<void> => {
    const body = req.body as { login?: unknown } | undefined;
    const raw = String(body?.login ?? '').trim().toLowerCase();
    if (!raw) return;
    const key = raw.replace(/[^a-z0-9]/g, '') || raw;
    const now = Date.now();
    if (accountHits.size > 5000) {
      for (const [k, v] of accountHits) if (v.resetAt <= now) accountHits.delete(k);
    }
    const rec = accountHits.get(key);
    if (!rec || rec.resetAt <= now) {
      accountHits.set(key, { count: 1, resetAt: now + ACCOUNT_WINDOW_MS });
      return;
    }
    rec.count += 1;
    if (rec.count > cfg.rateLimitLoginAccountMax) {
      throw tooMany('Terlalu banyak percobaan untuk akun ini. Coba lagi beberapa menit lagi.');
    }
  };

  /* Opsi rute bertipe agar overload Fastify tetap bisa menyimpulkan Body. */
  const guardedLimit: RouteShorthandOptions = { ...authLimit, preHandler: accountLimit };

  app.post('/api/auth/login', guardedLimit, async (req: FastifyRequest<{ Body: LoginBody }>, reply) => {
    const body = req.body ?? { login: '', password: '' };
    const login = String(body.login ?? '').trim();
    const password = String(body.password ?? '');
    if (!login || !password) {
      return reply.code(400).send({ ok: false, error: 'Isi identitas dan password.' });
    }

    const found = await R.findUserByLogin(db, login);
    const account = found && found.active ? found : undefined;
    if (!account) {
      /* Akun tidak ada/nonaktif: jalankan scrypt dummy supaya waktu respons seragam. */
      verifyPassword(password, dummy.salt, dummy.hash);
    }
    if (!account || !verifyPassword(password, account.salt, account.hash)) {
      throw unauthorized('Identitas atau password salah.');
    }

    const customer = account.phone ? await R.getCustomerByPhone(db, account.phone) : undefined;
    const jti = randomBytes(12).toString('hex');
    const token = signToken(app, { sub: account.id, role: account.role, name: account.name, jti });
    return {
      ok: true,
      token,
      user: publicUser(account),
      customerId: customer?.id ?? null,
    };
  });

  /** Register pelanggan baru. Otomatis membuat baris customer + user. */
  app.post('/api/auth/register', authLimit, async (req: FastifyRequest<{ Body: RegisterBody }>) => {
    const body = req.body ?? {} as RegisterBody;
    const name = String(body.name ?? '').trim();
    const phone = String(body.phone ?? '').trim();
    const password = String(body.password ?? '');

    if (!name) throw badRequest('Nama wajib diisi.');
    if (!phone) throw badRequest('Nomor telepon wajib diisi.');
    if (password.length < 6) throw badRequest('Password minimal 6 karakter.');

    const phoneDigits = phone.replace(/\D/g, '');
    if (await R.findUserByPhoneDigits(db, phoneDigits)) {
      throw conflict('Nomor telepon sudah terdaftar.');
    }
    if (await R.getCustomerByPhone(db, phone)) {
      throw conflict('Nomor telepon sudah terdaftar sebagai pelanggan.');
    }

    const { salt, hash } = hashPassword(password);
    const userId = uid('u');
    const customerId = uid('c');
    const now = Date.now();

    await db.tx(async () => {
      await R.insertUser(db, {
        id: userId, role: 'customer', name, phone, username: null,
        salt, hash, createdMs: now,
      });
      await R.insertCustomer(db, {
        id: customerId, userId, name, phone,
        tier: 'basic', tierMs: null, renewsMs: null, stamps: 0, balance: 0, isWalkin: false, createdMs: now,
      });
    });

    const user = await R.findUserById(db, userId);
    if (!user) throw badRequest('Gagal membuat akun.');

    const jti = randomBytes(12).toString('hex');
    const token = signToken(app, { sub: user.id, role: user.role, name: user.name, jti });
    return { ok: true, token, user: publicUser(user), customerId };
  });

  /** Logout — blacklist token JWT supaya tidak bisa dipakai lagi. */
  app.post('/api/auth/logout', { preHandler: anyAuth }, async (req) => {
    if (!req.auth) throw unauthorized();
    const payload = req.user as Record<string, unknown> | undefined;
    const jti = payload?.jti as string | undefined;
    const exp = payload?.exp as number | undefined;
    if (jti && exp) {
      try {
        await R.blacklistToken(db, jti, req.auth.userId, exp * 1000);
      } catch {
        // Ignore blacklist errors
      }
    }
    return { ok: true };
  });

  /** Ganti password untuk user yang sudah login. */
  app.post('/api/auth/change-password', { preHandler: anyAuth }, async (req) => {
    if (!req.auth) throw unauthorized();
    const body = req.body as ChangePasswordBody | undefined;
    const currentPassword = String(body?.currentPassword ?? '');
    const newPassword = String(body?.newPassword ?? '');

    if (!currentPassword) throw badRequest('Password lama wajib diisi.');
    if (newPassword.length < 6) throw badRequest('Password baru minimal 6 karakter.');

    const userRow = await db.get<{ pass_salt: string; pass_hash: string }>(
      'SELECT pass_salt, pass_hash FROM users WHERE id = ?', req.auth.userId,
    );
    if (!userRow) throw unauthorized('Akun tidak ditemukan.');
    if (!verifyPassword(currentPassword, userRow.pass_salt, userRow.pass_hash)) {
      throw badRequest('Password lama salah.');
    }

    const { salt, hash } = hashPassword(newPassword);
    await R.setUserPassword(db, req.auth.userId, salt, hash);
    return { ok: true };
  });

  /**
   * Lupa password — generate token reset. Di aplikasi nyata token dikirim
   * lewat email/SMS. Di sini token dikembalikan langsung (demo LAN).
   */
  app.post('/api/auth/forgot-password', guardedLimit, async (req: FastifyRequest<{ Body: ForgotPasswordBody }>) => {
    const body = req.body ?? {} as ForgotPasswordBody;
    const login = String(body.login ?? '').trim();
    if (!login) throw badRequest('Isi identitas (username atau nomor telepon).');

    const found = await R.findUserByLogin(db, login);
    if (!found) {
      // Jangan bocorkan apakah akun ada — tetap balas ok
      return { ok: true, message: 'Jika akun terdaftar, token reset telah dibuat.' };
    }

    const resetToken = randomBytes(24).toString('base64url');
    const expiresMs = Date.now() + 30 * 60 * 1000; // 30 menit
    await R.insertPasswordReset(db, resetToken, found.id, expiresMs);

    /* Di mode produksi, token reset TIDAK PERNAH dikembalikan via response HTTP
       untuk mencegah serangan Account Takeover (ATO). */
    if (cfg.production) {
      req.log.info({ userId: found.id }, 'Password reset requested; token created');
      return { ok: true, message: 'Jika akun terdaftar, token atau link reset telah dikirimkan.' };
    }

    return {
      ok: true,
      message: 'Jika akun terdaftar, token reset telah dibuat (mode development).',
      resetToken,
      expiresAt: expiresMs,
    };
  });

  /** Reset password dengan token dari forgot-password. */
  app.post('/api/auth/reset-password', async (req: FastifyRequest<{ Body: ResetPasswordBody }>) => {
    const body = req.body ?? {} as ResetPasswordBody;
    const token = String(body.token ?? '').trim();
    const newPassword = String(body.newPassword ?? '');

    if (!token) throw badRequest('Token reset wajib diisi.');
    if (newPassword.length < 6) throw badRequest('Password baru minimal 6 karakter.');

    const reset = await R.findPasswordReset(db, token);
    if (!reset) throw badRequest('Token tidak valid.');
    if (reset.used) throw badRequest('Token sudah dipakai.');
    if (reset.expiresMs < Date.now()) throw badRequest('Token sudah kedaluwarsa.');

    const { salt, hash } = hashPassword(newPassword);
    await R.setUserPassword(db, reset.userId, salt, hash);
    await R.markPasswordResetUsed(db, token);

    return { ok: true };
  });

  app.get('/api/auth/ping', async (req) => {
    if (!req.auth) throw unauthorized();
    return { ok: true, auth: req.auth };
  });
}
