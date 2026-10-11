/**
 * Validasi gambar yang dikirim klien sebagai data URL base64 (gambar QRIS,
 * bukti bayar). Batas ukuran cukup untuk screenshot bank/e-wallet, tapi tidak
 * membuka pintu penyimpanan file sembarangan di database.
 */

export const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
/** Batas body Fastify: base64 membengkak ~4/3, sisakan ruang untuk JSON. */
export const IMAGE_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Perkiraan ukuran byte gambar dari panjang base64 (tanpa decode penuh). */
export function imageBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((b64.length * 3) / 4);
}
