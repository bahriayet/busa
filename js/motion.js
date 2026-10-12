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
  let peakMM = null;
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
      tl.from('.ld-brand, .ld-links a, .ld-cta .btn', { opacity: 0, y: -8, stagger: 0.04 }, 'chrome')
        .from('.hero-panel > *', { opacity: 0, y: 14, stagger: 0.045 }, 'chrome+=0.1')
        .from('.hero-drums .drum', { opacity: 0, scale: 0.92, stagger: { each: 0.06, from: 'random' } }, 'chrome+=0.15');
      return tl;
    }
    tl.from('#nav', { opacity: 0, x: -14 }, 'chrome')
      .from('.nav-i', { opacity: 0, x: -10, stagger: U.distribute({ base: 0.01, amount: 0.05 }) }, 'chrome+=0.04')
      .from('.topbar', { opacity: 0, y: -8 }, 'chrome')
      .from('.ticker', { clipPath: 'inset(0 100% 0 0)', duration: 0.55, ease: 'power2.inOut' }, 'chrome');
    return tl;
  }

  /* ── 5. perangkat halaman publik (flow/in, reveal, pin, pan, count) ───── */
  function landingDevices() {
    U.toArray('[data-bc-reveal]').forEach((el) => {
      gsap.fromTo(el, { clipPath: 'circle(8% at 50% 50%)' }, {
        clipPath: 'circle(76% at 50% 50%)', duration: 0.9, ease: 'power2.inOut',
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      });
    });

    U.toArray('[data-bc-parallax]').forEach((el) => {
      const rate = parseFloat(el.dataset.bcParallax) || -0.12;
      gsap.to(el, {
        y: () => rate * window.innerHeight, ease: 'none',
        scrollTrigger: { trigger: el.closest('section') || el, start: 'top bottom', end: 'bottom top', scrub: 1, invalidateOnRefresh: true },
      });
    });

    U.toArray('[data-bc-count]').forEach((el) => {
      const to = parseFloat(el.dataset.bcCount) || 0;
      const dec = (String(el.dataset.bcCount).split('.')[1] || '').length;
      const box = { v: 0 };
      gsap.set(el, { textContent: '0' });
      gsap.to(box, {
        v: to, duration: 1.3, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        onUpdate: () => { el.textContent = box.v.toFixed(dec).replace('.', ','); },
      });
    });

    const rail = qs('[data-bc-pan]');
    if (rail) {
      gsap.to(rail, {
        x: () => -(rail.scrollWidth - rail.clientWidth), ease: 'none',
        scrollTrigger: { trigger: rail.closest('section'), start: 'top 60%', end: 'bottom 70%', scrub: 1, invalidateOnRefresh: true },
      });
    }

    const peak = qs('[data-bc-act="peak"]');
    if (peak) {
      /* Pin "babak tiga" hanya untuk layar besar. Di HP, pin + perubahan
         tinggi viewport (address bar muncul/hilang) adalah sumber glitch
         gulir — biarkan bagian ini mengalir normal di ponsel. */
      peakMM = gsap.matchMedia();
      peakMM.add('(min-width: 1001px)', () => {
        const stages = U.toArray('.peak-i', peak);
        const ptl = gsap.timeline({
          defaults: { duration: 0.4, ease: 'none' },
          scrollTrigger: {
            trigger: peak, start: 'top top', end: () => '+=' + (window.innerHeight * 3.2),
            pin: true, scrub: 0.9, anticipatePin: 1, invalidateOnRefresh: true,
            onUpdate: (self) => peak.style.setProperty('--bc-p', self.progress.toFixed(3)),
          },
        });
        ptl.addLabel('buka', 0);
        ptl.to('.peak-door', { scale: 0.62, opacity: 0.1, rotation: 30 }, 'buka')
          .to('.peak-inner', { rotation: 260, scale: 1.14 }, 'buka')
          .from('.peak-copy', { opacity: 0, y: 20 }, 'buka')
          .addLabel('bakar', '+=0.05');
        stages.forEach((s, i) => {
          ptl.fromTo(s, { opacity: 0.1, x: 26 }, { opacity: 1, x: 0 }, 'bakar+=' + (i * 0.3))
            .to(s, { opacity: 0.18, x: -12 }, 'bakar+=' + (i * 0.3 + 0.42));
        });
        ptl.addLabel('tutup', '+=0.15');
        ptl.to('.peak-led', { opacity: 1, scale: 1.2 }, 'tutup')
          .from('.peak-done', { opacity: 0, y: 10 }, 'tutup+=0.1');
      });
    }

    gsap.to(document.documentElement, {
      '--sp': '100%', ease: 'none',
      scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 0.3 },
    });
  }

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
  function enter(portal, route, animate = true) {
    reduce = mqReduce.matches;
    fine = mqFine.matches;
    if (animate) {
      const key = portal + '/' + route;
      if (!reduce && key !== lastKey) enterChrome(portal, route);
      lastKey = key;
    }

    if (ctx) { ctx.revert(); ctx = null; }
    if (peakMM) { peakMM.revert(); peakMM = null; }
    unbindTilt();

    ctx = gsap.context(() => {
      if (reduce) { gsap.set('[data-reveal]', { opacity: 1, y: 0 }); return; }
      /* Refresh otomatis (animate=false) tidak memutar ulang reveal —
         elemen baru sudah terlihat oleh aturan CSS `body.gsap-on`. */
      if (animate) bindReveals(qs('#view'));
      if (route === 'landing') landingDevices();
      bindTilt(qs('#view'));
    }, qs('#view'));

    requestAnimationFrame(() => ScrollTrigger.refresh());
  }

  mqReduce.addEventListener('change', () => { lastKey = ''; });

  return { ok: true, enter, refresh: () => ScrollTrigger.refresh() };
})();
