import { test, expect, type Page } from '@playwright/test';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization',
};

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

type SlidesPatch = { value: (string | null)[] } | null;

/** Mock login + seluruh endpoint bootstrap admin, termasuk simpan background. */
async function mockAdminApi(page: Page) {
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '/* font eksternal diblokir saat E2E */' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());

  const state: { patch: SlidesPatch; patches: number } = { patch: null, patches: 0 };

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }

    const path = new URL(req.url()).pathname;
    let body: Record<string, unknown> = { ok: true };

    if (path === '/api/auth/login') {
      body = {
        ok: true,
        token: 'e2e-token',
        user: { id: 'e2e-admin', name: 'E2E Admin', username: 'admin', role: 'admin' },
      };
    } else if (path === '/api/content') {
      body = { ok: true, gallery: [], location: null, slides: [null, null, null, null, null, null] };
    } else if (path === '/api/orders') {
      body = { ok: true, orders: [] };
    } else if (path === '/api/machines') {
      body = { ok: true, machines: [] };
    } else if (path === '/api/dashboard') {
      body = { ok: true };
    } else if (path === '/api/catalog') {
      body = { ok: true, services: [] };
    } else if (path === '/api/qris') {
      body = { ok: true, qris: null };
    } else if (path === '/api/content/slides' && req.method() === 'PATCH') {
      state.patch = req.postDataJSON() as SlidesPatch;
      state.patches += 1;
      body = { ok: true, value: state.patch ? state.patch.value : null };
    }

    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  });

  return state;
}

test.describe('Admin — profil', () => {
  test('hanya satu tombol ganti password dan tanpa panel pintasan', async ({ page }) => {
    await mockAdminApi(page);
    await page.goto('/#/a/loginA', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-act="login-a-id"]').fill('admin');
    await page.locator('[data-act="login-a-pw"]').fill('busa1234');
    await page.locator('[data-act="login-a-pw"]').press('Enter');

    await page.locator('.avatar').click();
    await expect(page.locator('#route-title')).toHaveText('Profil & setelan');
    await expect(page.getByRole('heading', { name: 'Profil' })).toBeVisible();

    await expect(page.locator('[data-act="go"][data-route="changePassword"]')).toHaveCount(1);
    await expect(page.getByText('Data & pintasan')).toHaveCount(0);
    await expect(page.locator('.kbd-list')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Notifikasi' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Alamat' })).toHaveCount(0);
    await expect(page.getByText('Data & cadangan')).toBeVisible();
    await expect(page.locator('[data-act="export"]')).toBeVisible();
    await expect(page.locator('[data-act="export-json"]')).toBeVisible();
    await expect(page.locator('[data-act="reset-all"]')).toHaveCount(0);
  });
});

test.describe('Admin — background slide', () => {
  test('login, unggah, lalu hapus background babak 1', async ({ page }) => {
    const state = await mockAdminApi(page);

    await page.goto('/#/a/loginA', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-act="login-a-id"]').fill('admin');
    await page.locator('[data-act="login-a-pw"]').fill('busa1234');
    await page.locator('[data-act="login-a-pw"]').press('Enter');

    // Login berhasil → sidebar admin tampil.
    await expect(page.locator('body[data-portal="a"]')).toBeVisible();
    const navTampilan = page.locator('#nav [data-route="tampilan"]');
    await expect(navTampilan).toBeVisible();
    await navTampilan.click();

    await expect(page.getByRole('heading', { name: 'Background slide' })).toBeVisible();
    await expect(page.locator('.slide-card')).toHaveCount(6);
    await expect(page.locator('.slide-card').first()).toContainText('gambar bawaan');
    await expect(page.locator('.slide-card').first()).not.toContainText('gambar unggahan admin');

    // Unggah gambar kecil lewat input tersembunyi.
    await page.locator('#slide-file-0').setInputFiles({
      name: 'babak-1.png',
      mimeType: 'image/png',
      buffer: PNG_1PX,
    });

    await expect(page.getByText('Background diperbarui')).toBeVisible();
    await expect.poll(() => state.patch?.value?.[0] ?? null).toMatch(/^data:image\//);
    expect(state.patches).toBe(1);

    const firstCard = page.locator('.slide-card').first();
    await expect(firstCard).toContainText('gambar unggahan admin');
    await expect(firstCard.locator('.slide-thumb img')).toHaveAttribute('src', /^data:image\//);
    await expect(page.locator('[data-act="slide-del"][data-i="0"]')).toBeVisible();

    // Hapus → kembali ke gambar bawaan.
    await page.locator('[data-act="slide-del"][data-i="0"]').click();
    await expect(page.getByText('Kembali ke gambar bawaan')).toBeVisible();
    await expect.poll(() => state.patches).toBe(2);
    expect(state.patch).not.toBeNull();
    expect(state.patch!.value[0]).toBeNull();
    await expect(firstCard).toContainText('gambar bawaan');
    await expect(firstCard.locator('.slide-thumb img')).not.toHaveAttribute('src', /^data:image\//);
    await expect(page.locator('[data-act="slide-del"][data-i="0"]')).toHaveCount(0);
  });
});
