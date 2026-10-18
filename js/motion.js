/* Lapisan gerak BUSA — GSAP core + timeline + ScrollTrigger + utils.
   Tanpa GSAP (file vendor hilang / offline) aplikasi tetap berjalan:
   fallback IntersectionObserver di ui.js yang mengambil alih. */

const MOTION = (function () {
  const ok = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  if (!ok) return { ok: false, enter() { }, refresh() { } };

  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ duration: 0.55, ease: 'power3.out', overwrite: 'auto' });
  /* Refresh otomatis saat resize dimatikan — resize ditangani sendiri lewat
     refreshSoon() yang menunda perhitungan selama pin "babak tiga" aktif. */
  ScrollTrigger.config({ autoRefreshEvents: 'visibilitychange,load' });

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
        /* Pusat 9 kartu poster (persen) — urut 01…09 seperti daftar tahap. */
        const CELLS = [[22, 28], [49, 28], [77, 28], [22, 55], [49, 55], [77, 55], [22, 83], [49, 83], [77, 83]];
        const lens = qs('.peak-lens', peak);
        const ring = qs('.peak-lens-ring', peak);
        const base = qs('.peak-poster-base', peak);
        if (base) gsap.set(base, { filter: 'brightness(.5) saturate(.72)' });
        if (lens) gsap.set(lens, { clipPath: 'circle(16% at ' + CELLS[0][0] + '% ' + CELLS[0][1] + '%)' });
        if (ring) gsap.set(ring, { opacity: 1, left: CELLS[0][0] + '%', top: CELLS[0][1] + '%', xPercent: -50, yPercent: -50 });

        const ptl = gsap.timeline({
          defaults: { duration: 0.4, ease: 'none' },
          scrollTrigger: {
            trigger: peak, start: 'top top', end: () => '+=' + (window.innerHeight * 3.2),
            /* fastScrollEnd: saat di-scroll cepat (fling/drag scrollbar), animasi
               langsung mengejar posisi akhir supaya pin tidak "tertinggal" dan
               sempat menampilkan babak ini padahal sudah kembali ke atas. */
            pin: true, scrub: 0.5, fastScrollEnd: true, anticipatePin: 1, invalidateOnRefresh: true,
            onUpdate: (self) => peak.style.setProperty('--bc-p', self.progress.toFixed(3)),
          },
        });
        peakST = ptl.scrollTrigger || null;
        ptl.addLabel('buka', 0);
        ptl.from('.peak-poster', { opacity: 0, scale: .95, transformOrigin: '76% 50%' }, 'buka')
          .from('.peak-copy', { opacity: 0, y: 20 }, 'buka')
          .addLabel('bakar', '+=0.05');
        stages.forEach((s, i) => {
          const cell = CELLS[i] || CELLS[0];
          if (lens) ptl.to(lens, { clipPath: 'circle(16% at ' + cell[0] + '% ' + cell[1] + '%)', duration: 0.26 }, 'bakar+=' + (i * 0.3));
          if (ring) ptl.to(ring, { left: cell[0] + '%', top: cell[1] + '%', duration: 0.26 }, 'bakar+=' + (i * 0.3));
          ptl.fromTo(s, { opacity: 0.1, x: 26 }, { opacity: 1, x: 0 }, 'bakar+=' + (i * 0.3))
            .to(s, { opacity: 0.18, x: -12 }, 'bakar+=' + (i * 0.3 + 0.42));
        });
        ptl.addLabel('tutup', '+=0.15');
        if (base) ptl.to(base, { filter: 'brightness(1) saturate(1)' }, 'tutup');
        if (lens) ptl.to(lens, { opacity: 0 }, 'tutup');
        if (ring) ptl.to(ring, { opacity: 0, scale: 1.5 }, 'tutup');
        ptl.to('.peak-led', { opacity: 1, scale: 1.2 }, 'tutup')
          .from('.peak-done', { opacity: 0, y: 10 }, 'tutup+=0.1');

        /* Perbaikan pasca-refresh: saat refresh (resize jendela / gambar selesai
           dimuat) terjadi selagi pin "babak tiga" aktif, ScrollTrigger kadang
           mengukur start/end dengan basis scroll yang salah — babak ikut
           terparkir di ujung bawah pin-spacer dan menyisakan celah kosong
           besar. Invariannya: start selalu sama dengan posisi dokumen ujung
           atas pin-spacer. Kalau melenceng, koreksi lalu update ulang
           (setelah siklus refresh selesai, lewat event 'refresh'). */
        const repairPin = () => {
          const st = ptl.scrollTrigger;
          const spacer = st && st.pin && st.pin.parentNode;
          if (!st || !spacer || !spacer.classList || !spacer.classList.contains('pin-spacer')) return;
          const top = spacer.getBoundingClientRect().top + window.scrollY;
          if (Math.abs(st.start - top) > 2) {
            const dur = st.end - st.start;
            st.start = top;
            st.end = top + dur;
            st.update();
          }
          healPeak(true);
        };
        ScrollTrigger.addEventListener('refresh', repairPin);
        return () => {
          ScrollTrigger.removeEventListener('refresh', repairPin);
          peakST = null;
        };
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
  /* Refresh dari pemuatan gambar bisa datang beruntun (carousel 6 foto).
     Debounce supaya recalculation pin tidak bertumpuk saat pengguna menggulir. */
  let refreshTimer = 0;
  let navRO = null;
  let peakST = null;
  let refreshDeferred = false;
  let lastScrollT = 0;
  /* Tinggi header landing → variabel CSS `--ldnav-h`. Babak tiga yang di-pin
     memakai variabel ini sebagai jarak atas supaya kicker tidak tersembunyi
     di balik header sticky. Tinggi diukur (bukan dipatok) karena nav
     membungkus jadi dua baris di lebar sempit. */
  function syncNavH() {
    const nav = qs('.ld-nav');
    if (!nav) return;
    const h = nav.offsetHeight + 'px';
    const root = document.documentElement;
    if (root.style.getPropertyValue('--ldnav-h') !== h) {
      root.style.setProperty('--ldnav-h', h);
      /* Paksa resolusi ulang gaya babak tiga begitu variabel berubah —
         sebagian browser menahan komputasi padding sampai ada reflow. */
      const peak = qs('[data-bc-act="peak"]');
      if (peak) void peak.offsetHeight;
    }
  }
  /* Amati nav dengan ResizeObserver: perubahan bungkus baris langsung
     tertangkap tanpa bergantung urutan event resize jendela. */
  function watchNav() {
    if (navRO) { navRO.disconnect(); navRO = null; }
    const nav = qs('.ld-nav');
    if (!nav) return;
    syncNavH();
    if (typeof ResizeObserver !== 'undefined') {
      navRO = new ResizeObserver(() => { syncNavH(); refreshSoon(); });
      navRO.observe(nav);
    }
  }
  /* Refresh ScrollTrigger saat pin "babak tiga" aktif berbahaya: pengukuran
     ulang di tengah pin bisa memarkir babak di ujung pin-spacer, dan refresh
     lanjutan yang jatuh di keadaan itu mengunci kerusakannya. Karena itu
     refresh ditunda selama scroll berada di wilayah pin; begitu keluar,
     perhitungan ulang dijalankan. */
  function inPeakPin() {
    if (!peakST || !peakST.pin) return false;
    const spacer = peakST.pin.parentNode;
    if (!spacer || !spacer.classList || !spacer.classList.contains('pin-spacer')) return false;
    const top = spacer.getBoundingClientRect().top + window.scrollY;
    const dur = spacer.offsetHeight - (peakST.pin.offsetHeight || 0);
    const y = window.scrollY || window.pageYOffset || 0;
    return y > top - 2 && y < top + dur + 2;
  }
  function refreshNow() {
    syncNavH();
    /* Jangan hitung ulang selagi scroll masih berjalan (mis. animasi gulir
       mulus dari klik tautan babak — refresh akan memotongnya) dan jangan
       selagi berada di wilayah pin. Coba lagi setelah gulir reda. */
    if (inPeakPin() || Date.now() - lastScrollT < 200) {
      refreshDeferred = true;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshNow, 260);
      return;
    }
    refreshDeferred = false;
    /* ScrollTrigger.refresh() menyimpan & memulihkan posisi gulir sendiri.
       Kalau pemulihannya gagal total (halaman terlempar ke paling atas),
       kembalikan posisi semula. */
    const y0 = window.scrollY || window.pageYOffset || 0;
    ScrollTrigger.refresh();
    const y1 = window.scrollY || window.pageYOffset || 0;
    if (y0 > 10 && y1 < 10) window.scrollTo({ top: y0, left: 0, behavior: 'instant' });
  }
  function refreshSoon() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshNow, 220);
  }
  /* Penyembuh keadaan "terparkir": posisi gulir ada di wilayah pin tetapi pin
     tidak menempel (sisa refresh di tengah pin atau lompatan gulir ekstrem).
     Perhitungan ulang sekali-dua kali memulihkannya; dibatasi agar tidak
     berputar-putar. */
  let healTries = 0;
  let healTimer = 0;
  function healPeak(defer) {
    if (healTimer) { clearTimeout(healTimer); healTimer = 0; }
    const st = peakST;
    if (!st || !st.pin) return;
    if (st.isActive || !inPeakPin()) { healTries = 0; return; }
    if (healTries >= 2) return;
    const run = () => {
      healTimer = 0;
      if (peakST !== st || st.isActive || !inPeakPin()) { healTries = 0; return; }
      healTries += 1;
      st.refresh();
    };
    if (defer) requestAnimationFrame(run);
    else healTimer = setTimeout(run, 140);
  }
  window.addEventListener('scroll', () => {
    lastScrollT = Date.now();
    if (refreshDeferred) refreshNow();
    healPeak(false);
  }, { passive: true });
  function enter(portal, route, animate = true) {
    reduce = mqReduce.matches;
    fine = mqFine.matches;
    watchNav();
    refreshDeferred = false;
    healTries = 0;
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
      /* Landing mode slider: pin/parallax/reveal-scroll tidak dipakai —
         babak tampil sebagai slide layar penuh dengan animasi sendiri. */
      if (route === 'landing' && !qs('#ldSlider')) landingDevices();
      bindTilt(qs('#view'));
    }, qs('#view'));

    requestAnimationFrame(() => ScrollTrigger.refresh());
  }

  mqReduce.addEventListener('change', () => { lastKey = ''; });

  /* Lebar berubah → nav bisa membungkus/lepas bungkus → ukur ulang header
     lalu segarkan perhitungan pin. */
  window.addEventListener('resize', () => { syncNavH(); refreshSoon(); });

  return { ok: true, enter, refresh: refreshSoon };
})();
