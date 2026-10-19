import { test, expect, type Page } from '@playwright/test';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization',
};

/** Matikan sumber daya eksternal (font, peta) supaya test cepat & stabil. */
async function blockExternal(page: Page) {
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '/* font eksternal diblokir saat E2E */' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await page.route(/^https:\/\/www\.google\.com\/maps/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Peta uji</title><body></body>' }));
}

/** Semua panggilan API diarahkan ke respons tiruan agar test stabil & offline. */
async function mockPublicApi(page: Page) {
  await blockExternal(page);
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

    const slideLabels = page.locator('.ld-thumb-l');
    await expect(slideLabels).toHaveCount(6);
    await expect(slideLabels.first()).toBeVisible();
    const labelClipped = await slideLabels.evaluateAll(
      (els) => els.some((el) => el.scrollWidth > el.clientWidth + 1),
    );
    expect(labelClipped, 'label thumbnail tidak boleh terpotong di HP').toBe(false);

    const navBox = await page.locator('.ld-nav').boundingBox();
    expect(navBox, 'header landing harus terukur').not.toBeNull();
    expect(navBox!.height).toBeLessThan(70);

    const thumbBox = await page.locator('.ld-thumb').first().boundingBox();
    expect(thumbBox, 'thumbnail harus terukur').not.toBeNull();
    expect(thumbBox!.height).toBeGreaterThanOrEqual(44);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('kartu lokasi memanjang ke kanan di bawah form jadwal pada laptop pendek', async ({ page }) => {
    await mockPublicApi(page);
    await page.goto('/#/', { waitUntil: 'domcontentloaded' });
    await page.locator('.ld-thumbs .ld-thumb').nth(5).evaluate((el) => (el as HTMLElement).click());
    await expect(page.locator('#a6')).toHaveClass(/\bon\b/);
    await page.waitForTimeout(900);

    const map = page.locator('#a6 .find-map');
    await expect(map).toBeVisible();
    await expect(map.locator('iframe')).toHaveAttribute('src', /google\.com\/maps/);

    const mapBox = await map.boundingBox();
    const formBox = await page.locator('#a6 .signup').boundingBox();
    const findBox = await page.locator('#a6 .find-us').boundingBox();
    const thumbsBox = await page.locator('.ld-thumbs').boundingBox();
    expect(mapBox, 'peta harus terukur').not.toBeNull();
    expect(formBox, 'form jadwal harus terukur').not.toBeNull();
    expect(findBox, 'kartu lokasi harus terukur').not.toBeNull();
    expect(thumbsBox, 'thumbnail harus terukur').not.toBeNull();

    // Kartu lokasi selebar area konten dan berada tepat di bawah form jadwal.
    expect(findBox!.y, 'kartu lokasi harus di bawah form').toBeGreaterThanOrEqual(formBox!.y + formBox!.height - 1);
    expect(findBox!.x + findBox!.width, 'kartu lokasi harus memanjang sampai kanan form')
      .toBeGreaterThanOrEqual(formBox!.x + formBox!.width - 1);
    expect(findBox!.width, 'kartu lokasi harus lebih lebar dari form').toBeGreaterThan(formBox!.width * 1.5);

    expect(mapBox!.width, 'peta harus memanjang').toBeGreaterThan(mapBox!.height * 2);
    expect(mapBox!.y + mapBox!.height, 'peta tidak boleh tertutup thumbnail').toBeLessThanOrEqual(thumbsBox!.y + 1);
  });

  test('slider aksesibel: ARIA, inert, fokus keyboard, Home/End', async ({ page }) => {
    await mockPublicApi(page);
    await page.goto('/#/', { waitUntil: 'domcontentloaded' });

    const deck = page.locator('#ldSlider');
    await expect(deck).toHaveAttribute('role', 'region');
    await expect(deck).toHaveAttribute('aria-roledescription', 'carousel');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/BUSA Laundry Ops/);

    const active = page.locator('.ld-slider .act.on');
    const second = page.locator('#a2');
    await expect(active).toHaveAttribute('id', 'a1');
    await expect(second).toHaveAttribute('aria-hidden', 'true');
    expect(await second.evaluate((el) => el.inert)).toBe(true);
    await expect(page.locator('#ldPrev')).toBeDisabled();
    await expect(page.locator('.ld-thumb').first()).toHaveAttribute('aria-current', 'step');

    // Thumbnail: pindah babak + pengumuman live.
    await page.locator('.ld-thumb').nth(2).click();
    await expect(active).toHaveAttribute('id', 'a3');
    await expect(page.locator('#ldLive')).toContainText('Babak 3 dari 6');
    await expect(page.locator('#ldLive')).toContainText('Dalam drum');
    await expect(page.locator('.ld-thumb').nth(2)).toHaveAttribute('aria-current', 'step');
    await expect(page.locator('#ldPrev')).toBeEnabled();

    // End/Home + fokus pindah ke heading slide aktif.
    await page.keyboard.press('End');
    await expect(active).toHaveAttribute('id', 'a6');
    await expect(page.locator('#ldNext')).toBeDisabled();
    expect(await page.evaluate(() => document.activeElement?.closest('.act')?.id || null)).toBe('a6');

    await page.keyboard.press('Home');
    await expect(active).toHaveAttribute('id', 'a1');
    await expect(page.locator('#ldPrev')).toBeDisabled();

    // Panah saat mengetik di input tidak boleh membajak kursor.
    await page.locator('#ldtk').click();
    await page.keyboard.press('ArrowRight');
    await expect(active).toHaveAttribute('id', 'a1');
    await expect(page.locator('#ldtk')).toBeFocused();

    // Skip link memindahkan fokus ke konten utama.
    await page.locator('.skip').focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement?.id || null)).toBe('view');
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('animasi slider dimatikan', async ({ page }) => {
      await mockPublicApi(page);
      await page.goto('/#/', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.ld-slider .act.on')).toHaveAttribute('id', 'a1');

      const state = await page.locator('.ld-slider .act').first().evaluate((el) => {
        const cs = getComputedStyle(el);
        const inner = getComputedStyle(el.querySelector('.ld-inner')!);
        return { transition: cs.transitionProperty, duration: cs.transitionDuration, anim: inner.animationName };
      });
      const durations = state.duration.split(',').map((v) => {
        const n = parseFloat(v);
        return v.trim().endsWith('ms') ? n / 1000 : n;
      });
      expect(Math.max(...durations)).toBeLessThan(0.01);
      expect(state.anim).toBe('none');
    });
  });

  test('login menampilkan tautan legal', async ({ page }) => {
    await mockPublicApi(page);
    await page.goto('/#/c/loginC', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.login-legal')).toBeVisible();
    await expect(page.locator('.login-legal a')).toHaveCount(2);
    await expect(page.locator('.login-legal a').first()).toHaveAttribute('href', './privasi');
    await expect(page.locator('.login-legal a').last()).toHaveAttribute('href', './syarat');
  });

  test('halaman legal publik dapat dibuka dan saling tertaut', async ({ page }) => {
    await page.goto('/privasi', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kebijakan Privasi');
    await expect(page.locator('.legal-card h2')).toHaveCount(11);

    await page.locator('.legal-foot a', { hasText: 'Syarat' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Syarat & Ketentuan');
    await expect(page.locator('.legal-card h2')).toHaveCount(12);
    await expect(page.locator('.legal-card')).toContainText('Ganti rugi');
  });
});
