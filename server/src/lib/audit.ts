import type { AuthInfo } from '../plugins/auth.ts';

/**
 * Baris audit keamanan untuk log terstruktur. Fungsi murni supaya bisa diuji
 * tanpa server: tentukan apa yang layak dicatat, dan JANGAN pernah menyertakan
 * body/query — hanya method, pola rute, IP, dan identitas (tanpa sandi).
 *
 * Aturan:
 *  - 401/403/429 → warn (akses ditolak / brute force)
 *  - login/register sukses → info (jejak masuk)
 *  - mutasi (POST/PUT/PATCH/DELETE) oleh pengguna terautentikasi → info
 *  - selain itu → tidak dicatat (log tetap ringan)
 */

export interface AuditInput {
  method: string;
  /** Pola rute Fastify (tanpa query/params), mis. '/api/users/:id'. */
  route: string;
  ip: string;
  auth?: AuthInfo;
  /** Field login dari body khusus rute auth (username/telepon) — bukan sandi. */
  login?: string;
}

export interface AuditLine {
  level: 'warn' | 'info';
  msg: string;
  data: Record<string, unknown>;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const AUTH_ROUTES = new Set(['/api/auth/login', '/api/auth/register']);

export function auditLine(input: AuditInput, status: number): AuditLine | null {
  const { method, route, ip, auth, login } = input;

  if (status === 401 || status === 403 || status === 429) {
    return {
      level: 'warn',
      msg: 'permintaan ditolak',
      data: { status, method, route, ip, actor: auth?.userId ?? null },
    };
  }

  if (AUTH_ROUTES.has(route) && status < 400) {
    return {
      level: 'info',
      msg: 'masuk berhasil',
      data: { status, route, ip, login: login ?? null },
    };
  }

  if (MUTATING.has(method) && auth) {
    return {
      level: 'info',
      msg: 'mutasi oleh pengguna',
      data: { status, method, route, ip, actor: auth.userId, role: auth.role },
    };
  }

  return null;
}
