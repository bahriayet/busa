import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from '../db/client.ts';
import type { Role } from '../domain/types.ts';
import { forbidden, unauthorized } from '../lib/http.ts';
import * as R from '../db/repo.ts';

/**
 * Auth JWT per peran. Setelah `requireRole(...)` lolos, handler membaca
 * `request.auth` (userId, role, name) — sumber identitas operator untuk
 * jejak lantai, bukan field `by` dari klien.
 *
 * requireRole juga memeriksa token blacklist (logout) lewat DB.
 */

export interface AuthInfo {
  userId: string;
  role: Role;
  name: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthInfo;
  }
}

export interface JwtPayload {
  sub: string;
  role: Role;
  name: string;
  jti?: string;
}

export function signToken(app: FastifyInstance, payload: JwtPayload): string {
  return app.jwt.sign(payload);
}

/**
 * Buat hook requireRole yang punya akses ke DB untuk cek blacklist.
 * Dipanggil sekali saat register routes, lalu hasilnya dipakai sebagai preHandler.
 */
export function makeRequireRole(db: Db) {
  return function requireRole(...roles: Role[]) {
    return async (request: FastifyRequest): Promise<void> => {
      try {
        await request.jwtVerify();
      } catch {
        throw unauthorized();
      }
      const payload = request.user as JwtPayload;
      if (!payload.sub || !payload.role) {
        throw unauthorized('Token tidak utuh.');
      }
      // Cek blacklist (logout) — ignore errors if table doesn't exist
      if (payload.jti) {
        try {
          if (await R.isTokenBlacklisted(db, payload.jti)) {
            throw unauthorized('Sesi telah diakhiri.');
          }
        } catch (err) {
          // If it's our unauthorized error, rethrow it
          if (err instanceof Error && err.message === 'Sesi telah diakhiri.') {
            throw err;
          }
          // Otherwise ignore (table might not exist)
        }
      }
      if (!roles.includes(payload.role)) {
        throw forbidden(`Aksi ini butuh peran ${roles.join(' atau ')}.`);
      }
      request.auth = { userId: payload.sub, role: payload.role, name: payload.name };
    };
  };
}

/**
 * Buat hook optionalAuth yang punya akses ke DB untuk cek blacklist.
 */
export function makeOptionalAuth(db: Db) {
  return async (request: FastifyRequest): Promise<void> => {
    const header = request.headers.authorization;
    if (!header) return;
    try {
      await request.jwtVerify();
      const payload = request.user as JwtPayload;
      if (payload.sub && payload.role) {
        // Cek blacklist
        if (payload.jti && await R.isTokenBlacklisted(db, payload.jti)) {
          return; // token di-blacklist, perlakukan sebagai anonim
        }
        request.auth = { userId: payload.sub, role: payload.role, name: payload.name };
      }
    } catch {
      /* tanpa identitas, tetap diproses sebagai klien anonim di LAN */
    }
  };
}

// Backward compatibility: requireRole tanpa db (untuk routes yang tidak perlu blacklist check)
export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest): Promise<void> => {
    try {
      await request.jwtVerify();
    } catch {
      throw unauthorized();
    }
    const payload = request.user as JwtPayload;
    if (!payload.sub || !payload.role) {
      throw unauthorized('Token tidak utuh.');
    }
    if (!roles.includes(payload.role)) {
      throw forbidden(`Aksi ini butuh peran ${roles.join(' atau ')}.`);
    }
    request.auth = { userId: payload.sub, role: payload.role, name: payload.name };
  };
}
