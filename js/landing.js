/* ── HALAMAN SITUS — grammar Live surface ──────────
   Halaman ini bukan pemasaran TENTANG aplikasinya; halaman ini aplikasinya,
   berjalan, dengan data contoh yang diberi label di wajahnya. Enam babak,
   satu puncak (masuk ke dalam drum), penutup berupa input nyata. */

const LDC = { weight: 6, slot: SLOTS[2], svc: 'setrika' };

function quickFind(raw) {
  const q = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!q) return { state: 'empty' };
  const digits = q.replace(/\D/g, '');
  const hit = S.orders.find((o) => o.code.toUpperCase() === q)
    || (digits.length >= 3 ? S.orders.find((o) => o.code.toUpperCase().endsWith('-' + digits) || o.code.toUpperCase().endsWith(digits)) : null);
  if (!hit) return { state: 'none', q };
  if (hit.stage >= 8) return { state: 'done', o: hit };
  return { state: 'live', o: hit };
}

function quickOut(r) {
  const box = qs('#ldtk-out');
  if (!box) return;
  box.hidden = false;
  if (r.state === 'empty') { box.className = 'quick-out warn'; box.innerHTML = `<p>${icon('alert')} Tulis dulu kodenya. Contoh yang benar: <b class="mono">${esc((S.orders[0] || { code: 'BUSA-0000' }).code)}</b></p>`; return; }
  if (r.state === 'none') {
    box.className = 'quick-out err';
    box.innerHTML = `<p>${icon('x')} <b>${esc(r.q)}</b> tidak kami temukan. Cek lagi angkanya, atau tanyakan lewat ${'<button class="lnk" data-act="chat">bantuan</button>'}.</p>`;
    return; }
  const o = r.o;
  const e = o.etaLabel ? { label: o.etaLabel } : orderEta(o);
  const items = o.items.map((x) => (CATALOG.find((c) => c.id === x.id) || { name: x.name || 'cucian' }).name).join(', ');
  box.className = 'quick-out ' + (r.state === 'done' ? 'ok' : 'found');
  box.innerHTML = `
    <div class="qo-head">
      ${r.state === 'done'
      ? `${icon('check')}<b class="display lg">${esc(o.code)} sudah selesai</b>`
      : `${drumMarkup({ rpm: (o.stage >= 7 ? 8 : 3.2) + 's', size: 44, state: o.stage >= 7 ? 'vent' : 'run', rags: 5, screws: false })}<b class="display lg">${esc(o.code)}</b>`}
    </div>
    ${r.state === 'done'
      ? `<p class="qo-line">${esc(o.customer.split(' ')[0])} · ${kg(o.weight)} kg · ${esc(o.created)}. Ambil di cabang sebelum 21.00, atau kami antar kalau mode Anda jemputan.</p>`
      : `<p class="qo-line">${esc(o.customer.split(' ')[0])} · ${kg(o.weight)} kg · ${esc(items)}</p>
         <p class="qo-stage"><span class="stage-pill s-${o.stage}"${o.live ? '' : ` data-live="order" data-id="${o.code}"`}>${esc(STAGES[o.stage].label)}</span>
            <b class="mono">siap sekitar <span${o.live ? '' : ` data-live="eta" data-id="${o.code}"`}>${esc(e.label)}</span></b>
            <i class="mono">${esc(o.machine !== '—' ? 'di ' + o.machine : 'menunggu drum')}</i></p>`}
    <button class="btn sm ghost" data-act="go" data-portal="c" data-route="lacak">${icon('truck')} Buka halaman lacak</button>`;
}

function liveAsOrder(l) {
  return {
    code: l.code, customer: l.customer || 'Pelanggan', weight: l.weight || 0,
    stage: l.stage, machine: l.machine || '—', priority: 'reguler',
    items: l.serviceName ? [{ id: '__live', name: l.serviceName }] : [],
    etaLabel: l.etaLabel, live: true,
  };
}

function ldTrack(preset) {
  const inp = qs('#ldtk');
  const val = preset !== undefined ? preset : (inp ? inp.value : '');
  if (inp && preset !== undefined) inp.value = preset;
  let r = quickFind(val);
  if (r.state === 'none' && typeof API !== 'undefined' && API.live && API.live.orders.length) {
    const q = String(val || '').trim().toUpperCase().replace(/\s+/g, '');
    const hit = API.live.orders.find((o) => String(o.code || '').toUpperCase() === q);
    if (hit) r = { state: 'live', o: liveAsOrder(hit) };
  }
  quickOut(r);
  if (inp && preset === undefined) inp.focus();
}

function ldcPrice() {
  const s = CATALOG.find((c) => c.id === LDC.svc) || CATALOG[0];
  const kgAmt = s.unit === 'kg' ? s.price * LDC.weight : s.price * Math.max(1, Math.round(LDC.weight / 3));
  const ship = kgAmt >= 80000 ? 0 : 12000;
  return { s, kgAmt, ship, total: kgAmt + ship, hours: LDC.svc === 'setrika' ? 48 : s.hours };
}

VIEWS.landing = {
  title: 'BUSA — Laundry Ops', kicker: 'Panel berjalan · data contoh',
  render() {
    /* Papan publik selalu memakai /api/live agar tampilan sama di semua
       perangkat — baik pengunjung anonim maupun yang sedang login. */
    const serverLive = (typeof API !== 'undefined' && API.live
      && Array.isArray(API.live.orders) && API.live.orders.length) ? API.live.orders : null;
    const live = serverLive
      ? serverLive.filter((o) => o.stage > 0 && o.stage < 8).slice(0, 5)
      : S.orders.filter((o) => o.stage > 0 && o.stage < 8).slice(0, 5);
    const doneToday = (serverLive && typeof API.live.doneToday === 'number')
      ? API.live.doneToday
      : S.orders.filter((o) => o.stage === 8).length;
    const stuck = S.orders.find((o) => o.stage === 0) || S.orders[0] || { code: 'BUSA-0000', stage: 0 };
    return `
    <header class="ld-nav">
      <a class="ld-brand" href="#/" data-act="go" data-route="landing" aria-label="BUSA, halaman awal">
        ${drumMarkup({ rpm: '7s', size: 28, state: 'run', rags: 4, screws: false })}<b>BUSA</b>
      </a>
      <nav class="ld-tabs" aria-label="Babak">
        ${[['a1', 'Sekarang'], ['a2', 'Masalah'], ['a3', 'Dalam drum'], ['a4', 'Kendalikan'], ['a5', 'Angka'], ['a6', 'Jadwalkan']]
        .map(([id, l]) => `<button class="ld-tab" data-act="bc-jump" data-v="${id}">${esc(l)}</button>`).join('')}
      </nav>
      <div class="ld-cta">
        <span class="ld-badge mono" title="Angka di halaman ini dihitung dari state aplikasi contoh">
          ${icon('info', '')} data contoh
        </span>
        <time class="ld-clock mono" id="ld-clock">--:--</time>
        <button class="btn sm" data-act="portal" data-v="c">Portal pelanggan</button>
        <button class="btn sm primary" data-act="bc-jump" data-v="a6">Jadwalkan jemputan</button>
      </div>
    </header>

    <section class="act act-live" id="a1">
      <div class="act-head">
        <p class="mono act-name">Babak satu · sekarang</p>
        <h2 class="display hero">Ini yang sedang terjadi<br>di dalam, detik ini.</h2>
        <p class="lede">Bukan janji, bukan angka promosi. Daftar di bawah dibaca dari panel yang sama yang dipakai kasir kami, dan bergerak selagi Anda membacanya.</p>
      </div>
      <div class="live-cols" data-reveal>
        <div class="live-col">
          <p class="mono lbl">Sedang dikerjakan</p>
          <ul class="live-list">
            ${live.map((o) => `
              <li class="ll" data-act="try" data-code="${o.code}">
                <span class="ll-drum">${drumMarkup({ rpm: (o.stage >= 7 ? 8 : 3.4) + 's', size: 36, state: o.stage >= 7 ? 'vent' : 'run', rags: 4, screws: false })}</span>
                <div class="ll-b">
                  <b class="mono ll-c">${esc(o.code)}</b>
                  <p>${esc(o.customer.split(' ')[0])} · ${kg(o.weight)} kg · ${esc(o.serviceName || (CATALOG.find((c) => c.id === (o.items[0] || {}).id) || { name: 'cucian' }).name)}</p>
                </div>
                <span class="stage-pill s-${o.stage}"${serverLive ? '' : ` data-live="order" data-id="${o.code}"`}>${esc(STAGES[o.stage].label)}</span>
                <span class="ll-eta mono">siap <b${serverLive ? '' : ` data-live="eta" data-id="${o.code}"`}>${esc(o.etaLabel || orderEta(o).label)}</b></span>
              </li>`).join('') || `<li class="empty">${icon('drum')} Semua cucian sudah keluar. Lantai sedang bersih.</li>`}
          </ul>
          <p class="mono fine">Nama disamarkan sebagian. Anda boleh meniru angka ini lewat portal pelanggan dengan kode yang sama.</p>
        </div>

        <div class="live-col">
          <p class="mono lbl">Cek cucian Anda</p>
          <h3 class="display lg">Masukkan kodenya, lihat posisinya sekarang.</h3>
          <p class="sb-lede">Kode ada di struk, bentuknya BUSA-0000. Ini panel yang sama yang dibaca kasir kami saat Anda menelepon.</p>
          <form class="quick-form" novalidate>
            <input id="ldtk" class="in mono big" placeholder="BUSA-4471" autocomplete="off" spellcheck="false" aria-label="Kode pesanan">
            <button class="btn primary" data-act="ld-track" type="submit">${icon('search')} Cek</button>
          </form>
          <div class="quick-try">
            <span class="mono lbl">Coba salah satu yang sedang jalan:</span>
            ${live.slice(0, 3).map((o) => `<button class="chip mono" data-act="ld-track-set" data-v="${esc(o.code)}">${esc(o.code)}</button>`).join('')}
          </div>
          <div class="quick-out" id="ldtk-out" hidden></div>
        </div>
      </div>
      <ul class="live-facts">
        <li><b class="num lg">48</b><span>jam cycle standar, dihitung dari diterima sampai dilipat</span></li>
        <li><b class="num lg">1</b><span>drum per pesanan. Cucian Anda tidak dicampur orang lain</span></li>
        <li><b class="num lg">500</b><span>ribu rupiah proteksi per item bila hilang atau rusak di tangan kami</span></li>
        <li><b class="num lg">${doneToday}</b><span>pesanan sudah diserahkan hari ini</span></li>
      </ul>
    </section>

    <section class="act act-quiet" id="a2" data-bc-reveal>
      <div class="quiet-strip">
        <span class="mono">${esc(stuck.code)}</span>
        <span class="stage-pill s-${stuck.stage}">${esc(STAGES[stuck.stage].label)}</span>
        <p class="mono fine">tahap berikutnya tidak tertulis di mana pun · tidak ada foto · tidak ada jam</p>
      </div>
      <h2 class="display xl">“Hampir selesai” bukan informasi.</h2>
      <p class="lede">Kami membuat panel ini karena pertanyaan terbesar pelanggan selalu sama, dan jawaban laundry pada umumnya selalu sama: nanti ya, Mbak, tinggal setrika.</p>
    </section>

    <section class="act act-peak" id="a3" data-bc-act="peak">
      <div class="peak-stage">
        <div class="peak-inner">
          ${Array.from({ length: 12 }).map((_, i) => `<i class="rag r${i % 4}" style="--a:${i * 30}deg;--r:${24 + (i % 4) * 7}%;--s:${14 + (i % 3) * 8}px"></i>`)}
        </div>
        <div class="peak-door">${drumMarkup({ rpm: '3s', size: 210, state: 'run', rags: 9 })}</div>
        <div class="peak-copy">
          <p class="mono act-name">Babak tiga · di dalam</p>
          <h2 class="display hero">Sembilan tahap,<br>dibakar satu per satu.</h2>
          <p class="lede">Gulir, dan cucian Anda berjalan. Tahan, dan ia berhenti di tahap yang sama dengan Anda.</p>
        </div>
        <ol class="peak-list">
          ${STAGES.map((s, i) => `<li class="peak-i"><b class="mono">${pad(i + 1)}</b>${icon(s.icon)}<span>${esc(s.label)}</span><i class="mono">${esc(s.note)}</i></li>`).join('')}
        </ol>
        <span class="peak-led"></span>
        <p class="peak-done mono">Semua tahap di atas tercatat dengan jam, mesin, dan nama operator.</p>
      </div>
    </section>

    <section class="act act-control" id="a4">
      <div class="act-head">
        <p class="mono act-name">Babak empat · kendalikan</p>
        <h2 class="display xl">Geser, dan permukaannya menjawab.</h2>
      </div>
      <div class="rail-wrap" data-reveal>
        <ul class="rail" data-bc-pan>
          ${CATALOG.filter(svcOn).map((s) => `
            <li class="rail-i t-${s.tone} ${LDC.svc === s.id ? 'on' : ''}" data-act="ld-svc" data-id="${s.id}" tabindex="0" role="button">
              ${icon(s.icon)}<b class="display lg">${esc(s.name)}</b>
              <span class="mono">${rp(s.price)} / ${esc(s.unit)}</span>
              <p>${esc(s.desc)}</p>
            </li>`).join('')}
        </ul>
      </div>
      <div class="console" data-reveal>
        <div class="con-l">
          <p class="mono lbl">Berat cucian</p>
          <b class="num xxl"><span id="ldw">${kg(LDC.weight)}</span><i>kg</i></b>
          <input id="ldslider" class="slider" type="range" min="3" max="40" step="0.5" value="${LDC.weight}" aria-label="Berat">
          <p class="mono lbl mt">Slot jemputan</p>
          <div class="slot-chips">
            ${SLOTS.map((s) => `<button class="schip ${LDC.slot === s ? 'on' : ''}" data-act="ld-slot" data-v="${s}">${esc(s)}</button>`).join('')}
          </div>
        </div>
        <div class="con-r">
          <div class="con-read"><span class="mono lbl">Layanan</span><b class="display lg" id="ld-svc-name">${esc(ldcPrice().s.name)}</b></div>
          <div class="con-read"><span class="mono lbl">Tagihan</span><b class="num xl" id="ld-price">${rp(ldcPrice().total)}</b>
            <p class="mono fine" id="ld-ship">${ldcPrice().ship ? 'antar-jemput ' + rp(ldcPrice().ship) : 'antar-jemput gratis, di atas Rp 80.000'}</p></div>
          <div class="con-read"><span class="mono lbl">Selesai sekitar</span><b class="mono" id="ld-eta">${esc(ldEta())}</b></div>
          <button class="btn primary" data-act="ld-use">${icon('basket')} Pakai pilihan ini</button>
        </div>
      </div>
    </section>

    <section class="act act-proof" id="a5">
      <div class="proof-grid">
        <figure class="kb" data-bc-parallax="-0.14" data-reveal>
          <img src="https://picsum.photos/seed/laundry-drum-interior/900/1100" alt="Drum mesin front-load sedang berputar" width="900" height="1100">
          <figcaption class="mono">M-02 · 18 kg · ${esc(STAGES[S.machines[1].stage].label)}</figcaption>
        </figure>
        <div>
          <p class="mono act-name">Babak lima · angka</p>
          <h2 class="display xl">Angka yang bisa Anda tuntut ulang.</h2>
          <ul class="proof-list">
            <li><b class="num lg" data-bc-count="${S.orders.length}">0</b><span>pesanan tercatat di panel ini, masing-masing dengan label dan jam</span></li>
            <li><b class="num lg" data-bc-count="${Math.round(S.orders.reduce((a, o) => a + o.total, 0) / 1000)}">0</b><span>ribu rupiah nilai cucian berjalan, bukan proyeksi</span></li>
            <li><b class="num lg" data-bc-count="${SEED.staff.length}">0</b><span>operator yang namanya muncul di kartu QC</span></li>
          </ul>
          <blockquote class="quote">
            <p>“Dulu saya cuci sendiri tiap Minggu. Sekarang 26 kg naik kurir tiap Selasa, balik sudah rapi.”</p>
            <footer class="mono">Kirana Buana · pemilik kos 14 pintu · pelanggan contoh</footer>
          </blockquote>
          <details class="q"><summary><b class="display lg">Berapa lama cycle standar, dan kalau noda tidak hilang?</b><span class="q-i">${icon('plus')}</span></summary>
            <p>Cuci + Setrika 48 jam sejak diterima; express 6 jam dengan antrean didahulukan. Untuk noda: kami foto sebelum-sesudah, dan bila tetap ada setelah dua kali treatment, biaya treatment dikembalikan seratus persen.</p></details>
        </div>
      </div>
    </section>

    <section class="act act-close" id="a6">
      <div class="close-grid">
        <div>
          <p class="mono act-name">Babak enam · jadwalkan</p>
          <h2 class="display hero">Satu kolom input,<br>dan cucian mulai bergerak.</h2>
          <p class="lede">Isi tiga baris ini. Kami buka order di portal pelanggan dengan berat dan slot yang sudah Anda geser di babak empat.</p>
        </div>
        <form class="signup" data-act="ld-form" autocomplete="off">
          <label class="fld"><span class="mono lbl">Nama</span><input class="in" id="ldname" placeholder="Rania" required></label>
          <label class="fld"><span class="mono lbl">Telepon</span><input class="in mono" id="ldtel" type="tel" placeholder="0812 7781 4402" required></label>
          <label class="fld"><span class="mono lbl">Kecamatan</span>
            <div class="ar-check">
              <input class="in mono" id="arq" placeholder="Buahbatu" data-act="area-input" aria-label="Cek area">
              <button class="btn sm" data-act="area-check" type="button">${icon('pin')} Cek</button>
            </div>
            <p class="ar-out" id="arout">Tulis kecamatan untuk melihat sisa slot hari ini.</p></label>
          <div class="signup-sum">
            <span class="mono">${esc(ldcPrice().s.name)} · <b id="ld-sum-w">${kg(LDC.weight)}</b> kg · <b id="ld-slot">${esc(LDC.slot)}</b></span>
            <b class="num" id="ld-sum-price">${rp(ldcPrice().total)}</b>
          </div>
          <button class="btn primary big" type="submit">${icon('truck')} Jadwalkan jemputan</button>
          <p class="hold mono" id="ldhold">Berat final ditentukan timbangan lantai, dan selalu bisa Anda tuntut ulang di kasir.</p>
        </form>
      </div>
      <div class="colophon">
        <p class="mono fine">BUSA Laundry Ops · Buahbatu, Bandung · 07.00–21.00 setiap hari · 0812-7781-4402</p>
        <p class="mono fine">© ${new Date().getFullYear()} · panel ini berjalan dengan data contoh; ganti angka dan testimoni dengan milik Anda sebelum tayang.</p>
      </div>
    </section>`;
  },
  wire() {
    const sl = qs('#ldslider');
    if (sl) sl.addEventListener('input', (e) => { LDC.weight = +e.target.value; paintLDC(); });
    const clk = qs('#ld-clock');
    if (clk) clk.textContent = nowClock();
    const ar = qs('#arq');
    if (ar) ar.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); areaCheck(ar.value); } });
    qsa('.kb img').forEach((im) => im.addEventListener('load', () => { if (typeof MOTION !== 'undefined' && MOTION.ok) MOTION.refresh(); }));
  },
};

function ldSubmit() {
  const name = ((qs('#ldname') || {}).value || '').trim();
  const tel = ((qs('#ldtel') || {}).value || '').trim();
  if (!name || !tel) { toast({ title: 'Nama dan telepon dulu', msg: 'Dua kolom pertama wajib diisi.', tone: 'red', icon: 'alert', ms: 2600 }); return; }
  if (!/^0\d{9,13}$/.test(tel.replace(/[\s-]/g, ''))) { toast({ title: 'Nomor belum pas', msg: 'Contoh yang kami kenali: 081277814402.', tone: 'red', icon: 'phone', ms: 3200 }); return; }
  const p = ldcPrice();
  S.cart = newCart();
  S.cart.items[LDC.svc] = p.s.unit === 'kg' ? LDC.weight : Math.max(1, Math.round(LDC.weight / 3));
  S.cart.weight = kgTotal() || LDC.weight;
  S.cart.slot = LDC.slot; S.cart.mode = 'pickup';
  S.cart.notes = 'Dijadwalkan dari halaman situs untuk ' + name + ' (' + tel + ').';
  S.cart.step = 1;
  go('order', 'c');
  bubbles(16);
  toast({ title: 'Keranjang disiapkan', msg: p.s.name + ' · ' + kg(LDC.weight) + ' kg · ' + rp(p.total) + ' · slot ' + LDC.slot, tone: 'orange', icon: 'basket', ms: 5000 });
}

function ldEta() {
  const p = ldcPrice();
  const d = new Date(Date.now() + p.hours * 3600000);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getMonth()];
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' · ' + d.getDate() + ' ' + m;
}

function setHintLanding(text) {
  const h = qs('#ldhold');
  if (h) h.textContent = text;
}

function paintLDC() {
  const p = ldcPrice();
  const set = (id, v) => { const el = qs(id); if (el) el.textContent = v; };
  set('#ldw', kg(LDC.weight));
  set('#ld-sum-w', kg(LDC.weight));
  set('#ld-slot', LDC.slot);
  set('#ld-svc-name', p.s.name);
  set('#ld-price', rp(p.total));
  set('#ld-sum-price', rp(p.total));
  set('#ld-ship', p.ship ? 'antar-jemput ' + rp(p.ship) : 'antar-jemput gratis, di atas Rp 80.000');
  set('#ld-eta', ldEta());
  qsa('.rail-i').forEach((el) => el.classList.toggle('on', el.dataset.id === LDC.svc));
  if (typeof MOTION !== 'undefined' && MOTION.ok) MOTION.refresh();
}

function areaCheck(name) {
  const out = qs('#arout'); if (!out) return;
  const q = String(name || '').trim().toLowerCase();
  if (!q) { out.textContent = 'Tulis nama kecamatan dulu.'; out.className = 'ar-out'; return; }
  const hit = SEED.areas.find((a) => a.kec.toLowerCase().includes(q) || a.kode.toLowerCase().includes(q));
  if (hit) {
    out.innerHTML = `<b>${esc(hit.kec)}</b> terlayani · jemput <b>${esc(hit.eta)}</b> · <b>${hit.slot}</b> slot hari ini`;
    out.className = 'ar-out ok t-mint';
  } else {
    out.innerHTML = `<b>“${esc(name)}”</b> di luar radius 8 km. Titipkan lewat kurir tetangga, atau ambil di cabang Buahbatu.`;
    out.className = 'ar-out no t-red';
  }
}
