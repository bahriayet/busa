import { randomBytes } from 'node:crypto';

/** Id pendek untuk baris non-kunci bisnis: pelanggan, alamat, notifikasi, chat. */
export function uid(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('base64url')}`;
}
