import { test, expect, type Page } from '@playwright/test';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization',
};

/** Semua panggilan API diarahkan ke respons tiruan agar test stabil & offline. */
async function mockPublicApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, slides: [null, null, null, null, null, null] }),
    });
  });
}

test.describe('Landing slider', () => {
  test('memuat 6 babak dan navigasi berurutan tanpa lompat', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await mockPublicApi(page);

    await page.goto('/#/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.ld-nav .ld-brand b')).toHaveText('BUSA');
    await expect(page.locator('.ld-thumbs .ld-thumb')).toHaveCount(6);
    await expect(page.locator('.ld-slider .act.on')).toHaveCount(1);
    await expect(page.locator('.ld-slider .act.on')).toHaveAttribute('id', 'a1');
    await expect(page.locator('#ldCount')).toContainText('01 / 06');

    // Lompat lewat thumbnail ke babak 3.
    await page.locator('.ld-thumbs .ld-thumb').nth(2).click();
    await expect(page.locator('.ld-slider .act.on')).toHaveAttribute('id', 'a3');
    await expect(page.locator('#ldCount')).toContainText('03 / 06');

    // Panah berikutnya harus maju satu babak (bukan langsung ke akhir).
    await page.locator('#ldNext').click();
    await expect(page.locator('.ld-slider .act.on')).toHaveAttribute('id', 'a4');
    await expect(page.locator('#ldCount')).toContainText('04 / 06');

    // Regresi: daftar layanan babak 4 harus terlihat (dulu tersembunyi oleh .rail admin).
    await expect(page.locator('.ld-slider .act.on .svc-rail')).toBeVisible();
    expect(await page.locator('.ld-slider .act.on .rail-i').count()).toBeGreaterThan(2);

    // Keyboard juga maju satu babak.
    await page.waitForTimeout(900);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.ld-slider .act.on')).toHaveAttribute('id', 'a5');

    expect(pageErrors).toEqual([]);
  });

  test('mobile: header satu baris, tanpa overflow horizontal', async ({ page }) => {
    await mockPublicApi(page);
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto('/#/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.ld-nav .ld-brand')).toBeVisible();
    await expect(page.locator('.ld-nav .ld-clock')).toBeHidden();
    await expect(page.locator('.ld-thumbs .ld-thumb')).toHaveCount(6);

    const navBox = await page.locator('.ld-nav').boundingBox();
    expect(navBox, 'header landing harus terukur').not.toBeNull();
    expect(navBox!.height).toBeLessThan(70);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('halaman legal publik dapat dibuka dan saling tertaut', async ({ page }) => {
    await page.goto('/privasi.html', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kebijakan Privasi');
    await expect(page.locator('.legal-card h2')).toHaveCount(11);

    await page.locator('.legal-foot a', { hasText: 'Syarat' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Syarat & Ketentuan');
    await expect(page.locator('.legal-card h2')).toHaveCount(12);
    await expect(page.locator('.legal-card')).toContainText('Ganti rugi');
  });
});
