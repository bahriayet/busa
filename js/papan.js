/* ── PAPAN HARI INI ──────────────────────────────────
   Pengganti cincin. Satu baris per mesin, sumbu jam 07.00–21.00,
   bagian terisi = drum dipakai, bagian terang = masih kosong dan
   bisa diisi. Tidak ada gestur aneh: ketuk keranjang, ketuk waktu
   kosong, selesai. Jadwal dihitung dari order + STAGE_MIN. */

const DAY_START = 7 * 60;
const DAY_MIN = 14 * 60;
const LENS = [
  { from: 2, to: 5, kind: 'wash', label: 'Rendam · Cuci · Bilas' },
  { from: 5, to: 6, kind: 'dry', label: 'Keringkan' },
  { from: 6, to: 7, kind: 'steam', label: 'Setrika uap' },
];
const KIND_LABEL = { wash: 'drum cuci', dry: 'pengering', steam: 'setrika uap', dryclean: 'cuci kering' };
const PAP = { pick: '', hint: '' };

function clockOf(min) { const t = DAY_START + clamp(min, 0, DAY_MIN); return pad(Math.floor(t / 60)) + ':' + pad(t % 60); }

function durText(m) { const h = Math.floor(m / 60), r = Math.round(m % 60); return h ? h + ' jam ' + r + ' menit' : r + ' menit'; }

function minutesOf(o, i) {
  const m = /(\d{1,2}):(\d{2})/.exec(o.created || '');
  if (m) return clamp((+m[1]) * 60 + (+m[2]) - DAY_START, 0, DAY_MIN - 60);
  return clamp(20 + i * 34, 0, DAY_MIN - 60);
}

function kindFor(o, base) {
  if (base.kind === 'wash' && o.items.some((x) => x.id === 'kering')) return 'dryclean';
  return base.kind;
}

function earliestEnd(m, t) {
  let e = t, moved = true, guard = 0;
  while (moved && guard++ < 60) {
    moved = false;
    for (const b of m.blocks) if (b.start <= e && b.end > e) { e = b.end; moved = true; }
  }
  return e;
}

function buildDayPlan() {
  const pool = {};
  S.machines.forEach((m) => { const k = m.kind || 'wash'; (pool[k] = pool[k] || []).push({ id: m.id, cap: machineCap(m), blocks: [] }); });

  const orders = [...S.orders].sort((a, b) => minutesOf(a, 0) - minutesOf(b, 0));
  const timeline = {};
  orders.forEach((o, idx) => {
    let cur = minutesOf(o, idx);
    timeline[o.code] = [];
    LENS.forEach((ln) => {
      const kind = kindFor(o, ln);
      const list = pool[kind] || [];
      if (!list.length) return;
      const dur = STAGE_MIN[ln.from] + (ln.from === 2 ? STAGE_MIN[3] + STAGE_MIN[4] : 0);
      let best = null, bestEnd = Infinity;
      list.forEach((cand) => {
        const end = Math.max(earliestEnd(cand, cur), cur) + dur;
        if (end < bestEnd || (end === bestEnd && best && cand.cap < best.cap)) { best = cand; bestEnd = end; }
      });
      if (!best) return;
      const blk = { code: o.code, kind, machine: best.id, start: Math.max(earliestEnd(best, cur), cur), end: bestEnd, label: ln.label };
      best.blocks.push(blk);
      timeline[o.code].push(blk);
      cur = bestEnd;
    });
    timeline[o.code].lastFree = cur;
  });

  const byMachine = {};
  S.machines.forEach((m) => { byMachine[m.id] = []; });
  Object.keys(pool).forEach((k) => pool[k].forEach((m) => {
    let cur = 0;
    m.blocks.sort((a, b) => a.start - b.start).forEach((b) => {
      if (b.start - cur >= 20) byMachine[m.id].push({ machine: m.id, kind: k, start: cur, end: Math.min(b.start, DAY_MIN) });
      cur = Math.max(cur, b.end);
    });
    if (DAY_MIN - cur >= 20) byMachine[m.id].push({ machine: m.id, kind: k, start: cur, end: DAY_MIN });
  }));

  const gaps = Object.keys(byMachine).reduce((a, id) => a.concat(byMachine[id]), []).sort((x, y) => x.start - y.start);
  return { pool, byMachine, gaps, timeline };
}

function waitingBaskets(plan) {
  return S.orders.filter((o) => o.stage < 2).map((o) => {
    const kind = kindFor(o, LENS[0]);
    const fits = plan.gaps.filter((g) => g.kind === kind && machineCap(S.machines.find((m) => m.id === g.machine)) >= o.weight);
    const first = fits.sort((a, b) => a.start - b.start)[0];
    return { o, kind, first, options: fits };
  });
}

function setHint(text) { PAP.hint = text; const h = qs('#pbhint'); if (h) h.textContent = text; }

function pickBasket(code) {
  PAP.pick = PAP.pick === code ? '' : code;
  if (PAP.pick) {
    const o = S.orders.find((x) => x.code === code);
    const kind = kindFor(o, LENS[0]);
    setHint(o.code + ' (' + kg(o.weight) + ' kg) butuh ' + KIND_LABEL[kind] + '. Ketuk bagian terang di baris mesin, atau pakai tombol di kanan.');
  } else setHint('');
  render();
}

function placeAt(machineId, startMin, endMin) {
  const o = S.orders.find((x) => x.code === PAP.pick);
  const m = S.machines.find((x) => x.id === machineId);
  if (!m) return false;
  if (!o) { setHint('Waktu kosong ' + machineId + ' ' + clockOf(startMin) + '–' + clockOf(endMin) + ' (' + durText(endMin - startMin) + '). Pilih keranjang dulu di kanan.'); return false; }
  if (machineCap(m) < o.weight) {
    const alt = S.machines.filter((x) => machineCap(x) >= o.weight).sort((a, b) => a.load - b.load)[0];
    setHint(o.weight + ' kg tidak muat di ' + machineId + ' (' + machineCap(m) + ' kg).' + (alt ? ' Yang cukup: ' + alt.id + ' (' + machineCap(alt) + ' kg).' : ' Tidak ada drum cukup besar hari ini.'));
    toast({ title: 'Kapasitas kurang', msg: o.weight + ' kg > ' + machineCap(m) + ' kg di ' + machineId, tone: 'amber', icon: 'alert' });
    return false;
  }
  const ev = recordEvent({ code: o.code, action: 'muat', machine: machineId });
  PAP.pick = '';
  if (ev) {
    const t = buildDayPlan().timeline[o.code];
    setHint(o.code + ' dimuat ke ' + machineId + ' mulai ' + clockOf(startMin) + (t && t.lastFree ? ' · perkiraan kelar ' + clockOf(t.lastFree) : ''));
    bubbles(10);
  }
  return !!ev;
}

VIEWS.papan = {
  title: 'Papan Hari Ini', kicker: 'Mesin kosong jam berapa',
  render() {
    const plan = buildDayPlan();
    const now = clamp((new Date().getHours() * 60 + new Date().getMinutes()) - DAY_START, 0, DAY_MIN);
    const q = waitingBaskets(plan);
    const atRisk = S.orders.filter((o) => {
      const t = plan.timeline[o.code];
      if (!t || !t.lastFree) return false;
      const promised = /(\d{1,2}):(\d{2})/.exec(o.slot.time || '');
      return promised && (t.lastFree + STAGE_MIN[7]) > ((+promised[1]) * 60 + (+promised[2]) - DAY_START);
    });

    return `
    <div class="pb-top">
      <div>
        <p class="mono kicker">${esc(todayDateLabel())} · jam kerja ${clockOf(0)}–${clockOf(DAY_MIN)}</p>
        <h1 class="display xl">Bagian terang pada baris mesin adalah drum yang belum dipakai</h1>
        <p class="lede">Jadwal dihitung dari ${S.orders.length} pesanan dan durasi sembilan tahap. Ketuk keranjang yang menunggu, lalu ketuk bagian terang pada mesin yang cocok.</p>
      </div>
      <div class="pb-sum">
        <div class="psum t-mint"><b class="num lg">${Math.floor(plan.gaps.reduce((a, g) => a + (g.end - g.start), 0) / 60)}</b><p class="mono lbl">jam drum masih kosong</p></div>
        <div class="psum t-blue"><b class="num lg">${q.length}</b><p class="mono lbl">keranjang menunggu</p></div>
        <div class="psum ${atRisk.length ? 't-red' : 't-muted'}"><b class="num lg">${atRisk.length}</b><p class="mono lbl">berisiko telat</p></div>
      </div>
    </div>

    <p class="pb-hint mono" id="pbhint">${esc(PAP.hint || 'Belum ada yang dipilih.')}</p>

    <section class="panel pb-rows" data-reveal>
      <header class="p-head"><h2 class="display">Enam mesin</h2><span class="mono note">07.00 → 21.00</span></header>
      <ul class="pb-list">
        ${S.machines.map((m, i) => {
      const kind = m.kind || 'wash';
      const blocks = (plan.pool[kind] || []).find((x) => x.id === m.id);
      const bs = blocks ? blocks.blocks : [];
      const gs = plan.byMachine[m.id] || [];
      const free = gs.reduce((a, g) => a + (g.end - g.start), 0);
      const nextFree = gs.length ? Math.min.apply(null, gs.map((g) => g.start)) : null;
      return `<li class="pbrow t-${kind}" style="--i:${i}">
                <div class="pb-id"><b class="mono">${m.id}</b><p class="mono fine">${esc(m.model)}</p><span class="pb-cap mono">${machineCap(m)} kg</span></div>
                <div class="pb-bar" data-m="${m.id}">
                  <div class="pb-track">
                    ${bs.map((b) => `<span class="pb-blk t-${b.kind}" style="left:${(b.start / DAY_MIN * 100).toFixed(2)}%;width:${((Math.min(b.end, DAY_MIN) - b.start) / DAY_MIN * 100).toFixed(2)}%" title="${esc(b.code)} · ${clockOf(b.start)}–${clockOf(b.end)} · ${esc(b.label)}">
                      <b class="mono">${esc(b.code.replace('BUSA-', ''))}</b></span>`).join('')}
                    ${gs.map((g) => `<button class="pb-free ${PAP.pick ? 'aim' : ''}" style="left:${(g.start / DAY_MIN * 100).toFixed(2)}%;width:${((g.end - g.start) / DAY_MIN * 100).toFixed(2)}%" data-act="gap-pick" data-m="${m.id}" data-s="${g.start}" data-e="${g.end}"${PAP.pick ? '' : ' disabled'} title="${m.id} bebas ${clockOf(g.start)}–${clockOf(g.end)} · klik untuk memuat">
                      <span class="mono">${durText(g.end - g.start)}</span></button>`).join('')}
                  </div>
                  <span class="pb-now" style="left:${(now / DAY_MIN * 100).toFixed(2)}%"><i></i><b class="mono">${clockOf(now)}</b></span>
                </div>
                <div class="pb-side">
                  ${bs.length ? `<p class="pb-busy"><b class="mono">${esc(bs[bs.length - 1].code)}</b><span class="mono fine">sampai ${clockOf(bs[bs.length - 1].end)}</span></p>` : '<p class="pb-idle mono">kosong seharian</p>'}
                  ${nextFree !== null ? `<p class="mono nxt">bebas ${clockOf(nextFree)}</p>` : '<p class="mono nxt">padat</p>'}
                  <p class="mono fine">${durText(free)} ruang</p>
                </div>
              </li>`;
    }).join('')}
      </ul>
      <div class="pb-legend">
        ${[['wash', 'cuci + bilas'], ['dry', 'pengering'], ['steam', 'setrika uap'], ['dryclean', 'cuci kering']].map(([k, l]) => `<span class="lg t-${k}">${esc(l)}</span>`).join('')}
        <span class="lg free">celah kosong = bisa diisi</span>
      </div>
    </section>

    <div class="pb-grid">
      <section class="panel pb-q" data-reveal>
        <header class="p-head"><h2 class="display">Keranjang menunggu</h2><span class="mono note">${q.length} belum punya drum</span></header>
        <ul class="baskets">
          ${q.map(({ o, kind, first, options }) => {
      const best = options.filter((g) => machineCap(S.machines.find((m) => m.id === g.machine)) >= o.weight)[0];
      return `<li class="basket ${PAP.pick === o.code ? 'on' : ''}" data-act="basket-pick" data-code="${o.code}" tabindex="0" role="button" aria-pressed="${PAP.pick === o.code}">
                <span class="bask-grip">${icon('basket')}</span>
                <div class="bask-b"><b class="mono">${esc(o.code)}</b><p>${esc(o.customer.split(' ')[0])} · ${kg(o.weight)} kg · ${esc(KIND_LABEL[kind])}</p></div>
                <div class="bask-go">
                  ${best ? `<button class="btn sm ${PAP.pick === o.code ? 'primary' : 'ghost'}" data-act="gap-pick" data-m="${best.machine}" data-s="${best.start}" data-e="${best.end}">${icon('plus')} Muat ${best.machine} ${clockOf(best.start)}</button>`
        : `<span class="mono full">${icon('alert')} tidak ada drum cukup besar</span>`}
                </div>
              </li>`;
    }).join('') || `<li class="empty">${icon('check')} Semua keranjang sudah punya drum.</li>`}
        </ul>
        <div class="pb-acts">
          <button class="btn ghost sm" data-act="papan-recompute">${icon('refresh')} Hitung ulang</button>
          <button class="btn sm" data-act="go" data-portal="a" data-route="scan">${icon('scan')} Layar pindai</button>
          <button class="btn sm ghost" data-act="go" data-portal="a" data-route="antrean">${icon('grid')} Papan antrean</button>
        </div>
      </section>

      <section class="panel pb-risk" data-reveal>
        <header class="p-head"><h2 class="display">Risiko meleset</h2><span class="mono note">${atRisk.length}</span></header>
        ${atRisk.length ? `<ul class="risk-list">${atRisk.map((o) => {
          const t = plan.timeline[o.code];
          const finish = t.lastFree + STAGE_MIN[7];
          const promised = /(\d{1,2}):(\d{2})/.exec(o.slot.time || '');
          const due = promised ? (+promised[1]) * 60 + (+promised[2]) - DAY_START : DAY_MIN;
          return `<li><b class="mono">${esc(o.code)}</b><span class="mono">${esc(o.slot.time)}</span>
                    <p>Janji ${clockOf(due)}, perkiraan siap ${clockOf(Math.min(finish, DAY_MIN))} · meleset ${Math.round(finish - due)} menit${finish > DAY_MIN ? ' dan lewat jam kerja' : ''}. Solusi: pindahkan ${esc(o.machine || 'drum')} ke ${esc((plan.gaps.filter((g) => g.kind === 'wash').sort((a, b) => a.start - b.start)[0] || { machine: 'M-03' }).machine)} atau tunda lipatan ke tim sore.</p></li>`;
        }).join('')}</ul>` : `<p class="mono fine">Semua janji jemputan masih tertampung ${S.machines.length} drum.</p>`}
        <div class="pb-how">
          <p class="mono lbl">Cara baca papan ini</p>
          <ol>
            <li>Baris = satu mesin, sepanjang jam kerja.</li>
            <li>Blok berwarna = cucian yang sudah dijadwalkan di situ.</li>
            <li>Bagian terang = drum tidak dipakai, ketuk untuk menaruh keranjang.</li>
            <li>Garis tegak = jam sekarang.</li>
          </ol>
        </div>
      </section>
    </div>`;
  },
};
