import { randomBytes } from 'node:crypto';

/** Id pendek untuk baris non-kunci bisnis: pelanggan, alamat, notifikasi, chat. */
export function uid(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('base64url')}`;
}

export function digitsOf(value: string): string {
  return String(value ?? '').replace(/\D/g, '');
}

/** Nomor telepon pelanggan yang bisa dipakai login: 0812-7781-4402 → 081277814402. */
export function normalizePhone(value: string): string {
  return digitsOf(value);
}
