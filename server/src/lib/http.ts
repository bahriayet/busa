/**
 * Kesalahan HTTP dengan badan JSON yang sudah diformat untuk frontend:
 * `{ ok:false, error, ...detail }`. Domain menolak dengan kalimat Indonesia
 * yang bisa langsung ditampilkan ke operator/pelanggan.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly detail: Record<string, unknown>;

  constructor(statusCode: number, error: string, detail: Record<string, unknown> = {}) {
    super(error);
    this.statusCode = statusCode;
    this.detail = detail;
  }

  toJSON(): Record<string, unknown> {
    return { ok: false, error: this.message, ...this.detail };
  }
}

export const badRequest = (msg: string, detail: Record<string, unknown> = {}): ApiError =>
  new ApiError(400, msg, detail);
export const unauthorized = (msg = 'Belum masuk atau sesi kedaluwarsa.'): ApiError =>
  new ApiError(401, msg);
export const forbidden = (msg = 'Peran Anda tidak boleh melakukan aksi ini.'): ApiError =>
  new ApiError(403, msg);
export const notFound = (msg = 'Tidak ditemukan.'): ApiError => new ApiError(404, msg);
export const conflict = (msg: string, detail: Record<string, unknown> = {}): ApiError =>
  new ApiError(409, msg, detail);
