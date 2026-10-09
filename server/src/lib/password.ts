import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Hash password pakai scrypt bawaan Node — tidak ada dependensi native
 * (bcrypt/argon2 butuh kompilasi, dan itu risiko yang tidak perlu di Windows).
 *
 * Format yang disimpan: salt hex terpisah dari hash hex, keduanya 32/64 byte.
 */

const KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(32).toString('hex');
  const hash = scryptSync(password, salt, KEYLEN, SCRYPT_OPTS).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  if (!salt || !expectedHash) return false;
  try {
    const actual = scryptSync(password, salt, KEYLEN, SCRYPT_OPTS);
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
