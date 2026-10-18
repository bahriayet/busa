/* Lapisan gerak BUSA — GSAP core + timeline + ScrollTrigger + utils.
   Tanpa GSAP (file vendor hilang / offline) aplikasi tetap berjalan:
   fallback IntersectionObserver di ui.js yang mengambil alih. */

const MOTION = (function () {
  const ok = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  if (!ok) return { ok: false, enter() { }, refresh() { } };

  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ duration: 0.55, ease: 'power3.out', overwrite: 'auto' });

  const U = gsap.utils;
  const mm = gsap.matchMedia();
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');
  let reduce = mqReduce.matches;
  let fine = mqFine.matches;
  let ctx = null;
  let lastKey = '';

  document.body.classList.add('gsap-on');

  /* ── 1. kecepatan gulir menaikkan RPM drum (satu properti turunan) ───── */
  const toMul = U.pipe(U.normalize(0, 1300), U.clamp(0, 1), U.mapRange(1, 0.34));
  let mul = 1, want = 1;
  /* Vendor ScrollTrigger lama tidak punya getVelocity (muncul sejak 3.11) —
     tanpa pengawal ini ticker melempar exception setiap frame. */
  const getVel = (typeof ScrollTrigger.getVelocity === 'function') ? ScrollTrigger.getVelocity : () => 0;

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const step = () => {
      want = toMul(Math.abs(getVel()));
      mul += (want - mul) * 0.09;
      if (Math.abs(mul - want) < 0.002) mul = want;
      document.documentElement.style.setProperty('--spinmul', mul.toFixed(3));
    };
    gsap.ticker.add(step);
    return () => { gsap.ticker.remove(step); document.documentElement.style.removeProperty('--spinmul'); };
  });

  /* ── 2. tilt 3D pada kartu: setara tilt.js, dibangun dengan quickTo ───── */
  function bindTilt(scope) {
    if (!fine || reduce) return;
    U.toArray('[data-tilt]', scope).forEach((el) => {
      if (el.__tilt) return;
      const max = parseFloat(el.dataset.tilt) || 6;
      const lift = parseFloat(el.dataset.tiltLift) || 9;
      const rx = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3.out' });
      const ry = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3.out' });
      gsap.set(el, { transformPerspective: 760, transformStyle: 'preserve-3d' });
      const move = (e) => {
        const r = el.getBoundingClientRect();
        const nx = U.clamp(0, 1, (e.clientX - r.left) / r.width);
        const ny = U.clamp(0, 1, (e.clientY - r.top) / r.height);
        ry((nx - 0.5) * 2 * max);
        rx((0.5 - ny) * 2 * max);
        gsap.set(el, { '--gx': (nx * 100).toFixed(1) + '%', '--gy': (ny * 100).toFixed(1) + '%' });
      };
      const leave = () => { rx(0); ry(0); gsap.set(el, { '--gx': '50%', '--gy': '50%' }); };
      el.__tilt = { move, leave };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerleave', leave);
    });
  }

  function unbindTilt() {
    U.toArray('[data-tilt]').forEach((el) => {
      if (!el.__tilt) return;
      el.removeEventListener('pointermove', el.__tilt.move);
      el.removeEventListener('pointerleave', el.__tilt.leave);
      gsap.set(el, { clearProps: 'transform,transformPerspective,transformStyle' });
      delete el.__tilt;
    });
  }

  /* ── 4. entrance per rute: satu timeline berlabel ─────────────────────── */
  function enterChrome(portal, route) {
    const tl = gsap.timeline({ defaults: { duration: 0.45, ease: 'power3.out' } });
    tl.addLabel('chrome', 0);
    if (route === 'landing') {
      tl.from('.ld-thumbs, .ld-arrows', { opacity: 0, y: 10 }, 'chrome');
      return tl;
    }
    tl.from('#nav', { opacity: 0, x: -14 }, 'chrome')
      .from('.nav-i', { opacity: 0, x: -10, stagger: U.distribute({ base: 0.01, amount: 0.05 }) }, 'chrome+=0.04')
      .from('.topbar', { opacity: 0, y: -8 }, 'chrome')
      .from('.ticker', { clipPath: 'inset(0 100% 0 0)', duration: 0.55, ease: 'power2.inOut' }, 'chrome');
    return tl;
  }

  /* ── 5. Landing memakai slider layar penuh; animasi slide diatur
     oleh CSS .ld-slider dan pengendali ldSlide() di landing.js. */

  /* ── 6. reveal massal untuk semua permukaan ───────────────────────────── */
  function bindReveals(scope) {
    const items = U.toArray('[data-reveal]', scope);
    if (!items.length) return;
    gsap.set(items, { opacity: 0, y: 14 });
    ScrollTrigger.batch(items, {
      start: 'top 92%', once: true, interval: 0.09, batchMax: 6,
      onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, stagger: 0.055, duration: 0.6, ease: 'power3.out', overwrite: true }),
    });
  }

  /* ── API ──────────────────────────────────────────────────────────────── */
  /* Refresh ScrollTrigger dari pemuatan gambar bisa datang beruntun (galeri).
     Debounce supaya recalculation tidak bertumpuk. */
  let refreshTimer = 0;
  function refreshSoon() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      const y0 = window.scrollY || window.pageYOffset || 0;
      ScrollTrigger.refresh();
      const y1 = window.scrollY || window.pageYOffset || 0;
      if (y0 > 10 && y1 < 10) window.scrollTo({ top: y0, left: 0, behavior: 'instant' });
    }, 220);
  }
  function enter(portal, route, animate = true) {
    reduce = mqReduce.matches;
    fine = mqFine.matches;
    if (animate) {
      const key = portal + '/' + route;
      if (!reduce && key !== lastKey) enterChrome(portal, route);
      lastKey = key;
    }

    if (ctx) { ctx.revert(); ctx = null; }
    unbindTilt();

    ctx = gsap.context(() => {
      if (reduce) { gsap.set('[data-reveal]', { opacity: 1, y: 0 }); return; }
      /* Refresh otomatis (animate=false) tidak memutar ulang reveal —
         elemen baru sudah terlihat oleh aturan CSS `body.gsap-on`. */
      if (animate) bindReveals(qs('#view'));

      bindTilt(qs('#view'));
    }, qs('#view'));

    requestAnimationFrame(() => ScrollTrigger.refresh());
  }

  mqReduce.addEventListener('change', () => { lastKey = ''; });

  return { ok: true, enter, refresh: refreshSoon };
})();
