import assert from 'node:assert/strict';
import { test } from 'node:test';

import { auditLine } from '../src/lib/audit.ts';

/**
 * Log audit keamanan: hanya peristiwa penting yang dicatat, dan tidak pernah
 * memuat body/query (tidak ada sandi/rahasia yang bisa bocor ke log).
 */

const base = { method: 'POST', route: '/api/auth/login', ip: '10.0.0.9' };

test('akses ditolak dicatat sebagai warn', () => {
  for (const status of [401, 403, 429]) {
    const line = auditLine(base, status);
    assert.equal(line?.level, 'warn');
    assert.equal(line?.data.status, status);
    assert.deepEqual(Object.keys(line!.data).sort(), ['actor', 'ip', 'method', 'route', 'status']);
  }
});

test('login berhasil mencatat identitas, bukan sandi', () => {
  const line = auditLine({ ...base, login: 'admin' }, 200);
  assert.equal(line?.level, 'info');
  assert.equal(line?.data.login, 'admin');
  assert.ok(!Object.hasOwn(line!.data, 'password'));
});

test('mutasi terautentikasi dicatat dengan aktor', () => {
  const line = auditLine({
    method: 'PATCH', route: '/api/addons/:id', ip: '10.0.0.9',
    auth: { userId: 'u_1', role: 'admin', name: 'Admin' },
  }, 200);
  assert.equal(line?.level, 'info');
  assert.equal(line?.data.actor, 'u_1');
  assert.equal(line?.data.role, 'admin');
});

test('baca anonim biasa tidak dicatat', () => {
  assert.equal(auditLine({ method: 'GET', route: '/api/catalog', ip: '10.0.0.9' }, 200), null);
  assert.equal(auditLine({ method: 'POST', route: '/scan', ip: '10.0.0.9' }, 200), null);
});
