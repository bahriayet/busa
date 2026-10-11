/* ── PINDAI — lantai kerja berbasis event ───────────────
   Satu-satunya jalan masuk untuk mengubah tahap cucian adalah recordEvent().
   Tanpa backend, event disimpan lokal dan ditandai sync:'lokal'.
   Begitu SCAN_API diisi, event dikirim ke POST /scan dan antrean sinkron
   ikut pulih sendiri kalau jaringan sempat mati. */

const SCAN = { mode: 'muat', operator: 'Dodo P.', query: '', draft: '' };

function nowMs() { return Date.now(); }

function apiBase() {
  return (typeof SCAN_API !== 'undefined' && SCAN_API) ? String(SCAN_API).replace(/\/$/, '') : '';
}

function sendEvent(ev) {
  const base = apiBase();
  if (!base) return Promise.resolve({ ok: true, local: true });
  return fetch(base + '/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ev),
  }).then((r) => ({ ok: r.ok, status: r.status })).catch((e) => ({ ok: false, error: e.message }));
}

function machineCap(m) { return m.cap || parseInt(String(m.model).match(/(\d+)\s*kg/i) || 0, 10) || 8; }

function machineFor(kind) {
  return S.machines.filter((m) => {
    const k = m.kind || (m.model.indexOf('Dry') === 0 ? 'dryclean' : m.model.indexOf('Steam') === 0 ? 'steam' : m.model.indexOf('Dryer') === 0 ? 'dry' : 'wash');
    return k === kind;
  });
}

function suggestMachine(weight, kind) {
  const pool = (kind ? machineFor(kind) : S.machines).filter((m) => m.state !== 'idle' || m.load === 0);
  const fit = pool.filter((m) => machineCap(m) >= weight);
  const list = (fit.length ? fit : pool).slice().sort((a, b) => (a.load - b.load) || (a.left - b.left));
  return list[0] || null;
}

function findOrder(code) {
  const q = String(code || '').trim().toUpperCase();
  if (!q) return null;
  return S.orders.find((o) => o.code.toUpperCase() === q)
    || S.orders.find((o) => o.code.toUpperCase().endsWith(q.replace(/^.*[^0-9]/, '')))
    || null;
}

function orderEta(o) {
  if (!o || o.stage >= STAGES.length - 1) return { mins: 0, label: 'selesai' };
  let mins = 0;
  for (let i = o.stage + 1; i < STAGES.length; i++) mins += STAGE_MIN[i] || 0;
  const need = STAGE_MACHINE[o.stage];
  if (need) {
    const m = S.machines.find((x) => x.id === o.machine);
    if (m && m.left > 0) mins += m.left;
  }
  const wait = Math.round((S.orders.filter((x) => x.code !== o.code && x.stage === o.stage).length) * 6);
  mins += wait;
  const d = new Date(nowMs() + mins * 60000);
  return { mins, label: pad(d.getHours()) + ':' + pad(d.getMinutes()), long: mins };
}

function dwellMin(o) { return o.stageAt ? Math.round((nowMs() - o.stageAt) / 60000) : null; }

function bottlenecks() {
  return S.orders.filter((o) => {
    if (o.stage >= STAGES.length - 1) return false;
    const d = dwellMin(o);
    const target = STAGE_MIN[o.stage] || 30;
    return d !== null && d > target * 1.6;
  }).map((o) => {
    const m = S.machines.find((x) => x.id === o.machine && x.ticket === o.code);
    return { o, dwell: dwellMin(o), target: STAGE_MIN[o.stage] || 30, machine: m ? m.id : null, left: m ? m.left : 0 };
  });
}

function needsOf(o) {
  const hasBed = o.items.some((i) => i.id === 'bedcover');
  const hasDry = o.items.some((i) => i.id === 'kering');
  return { hasBed, hasDry, weight: o.weight };
}

function recordEvent(input) {
  const o = input.order || findOrder(input.code);
  if (!o) {
    toast({ title: 'Label tidak dikenal', msg: 'Coba ' + S.orders[0].code + ' atau ketik 4 digit terakhir.', tone: 'red', icon: 'alert' });
    return null;
  }
  if (input.machine && !S.machines.find((m) => m.id === input.machine)) {
    toast({ title: 'Mesin tidak ada', msg: String(input.machine), tone: 'red', icon: 'gear' });
    return null;
  }
  if (typeof API !== 'undefined' && API.on && isAuthed()) {
    apiRecordEvent(input, o);
    return { api: true, code: o.code };
  }
  const ev = {
    id: 'EV-' + String(S.seq + 1000).slice(-4),
    at: nowMs(), clock: nowClock(), code: o.code, action: input.action,
    machine: input.machine || o.machine || null,
    stage: o.stage, to: input.to == null ? o.stage : input.to,
    by: input.by || SCAN.operator, note: input.note || '', sync: 'antre',
  };

  if (input.action === 'terima') { ev.to = 0; }
  if (input.action === 'muat') {
    const need = needsOf(o);
    const kind = STAGE_MACHINE[Math.max(o.stage, 2)] || 'wash';
    const cand = suggestMachine(need.weight, kind);
    const target = input.machine || (cand && cand.id);
    if (!target) { toast({ title: 'Tidak ada drum muat', msg: 'Semua mesin penuh. Tahan dulu di antrean.', tone: 'amber', icon: 'pause' }); return null; }
    const m = S.machines.find((x) => x.id === target);
    if (machineCap(m) < need.weight) {
      const big = machineFor('wash').filter((x) => machineCap(x) >= need.weight).sort((a, b) => a.load - b.load)[0];
      toast({ title: m.id + ' cuma ' + machineCap(m) + ' kg', msg: need.weight + ' kg tidak muat.' + (big ? ' Usulan: ' + big.id + ' (' + machineCap(big) + ' kg).' : ' Tidak ada drum cukup besar.'), tone: 'amber', icon: 'alert' });
      return null;
    }
    ev.machine = m.id; ev.to = Math.max(o.stage, 2);
    m.ticket = o.code; m.load = clamp(Math.round((need.weight / machineCap(m)) * 100), 8, 99); m.state = 'run';
    m.left = STAGE_MIN[ev.to] || 30; m.rpm = 6 + (m.load > 70 ? 3 : 0);
    o.machine = m.id;
  }
  if (input.action === 'tahap') { ev.to = Math.min(STAGES.length - 1, o.stage + 1); }
  if (input.action === 'lepas') {
    const m = S.machines.find((x) => x.id === (input.machine || o.machine));
    if (m) { m.ticket = '—'; m.load = 0; m.state = 'idle'; m.rpm = 0; }
    ev.to = Math.min(STAGES.length - 1, o.stage);
  }
  if (input.action === 'qc') { ev.to = 2; ev.note = ev.note || 'noda sisa, masuk rendam ulang'; }
  if (input.action === 'selesai') { ev.to = STAGES.length - 1; }

  o.stage = ev.to;
  o.stageAt = ev.at;
  o.scanned = true;
  if ((input.action === 'tahap' || input.action === 'selesai') && o.stage === 6 && o.mode === 'delivery' && o.courier === '—') {
    o.courier = ['Yudha P.', 'Sinta R.', 'Bagas W.'][Math.floor(Math.random() * 3)];
  }
  if (o.stage === STAGES.length - 1 && !o.collected) {
    if (S.stamps < 7) S.stamps++; else S.stamps = 0;
    toast({ title: o.code + ' selesai', msg: 'Stempel loyalti bertambah (' + S.stamps + '/7)', tone: 'mint', icon: 'star' });
  }

  S.events.unshift(ev);
  S.events = S.events.slice(0, 240);
  if (o.stage === STAGES.length - 1) bubbles(12);
  save();

  const kind = input.action === 'lepas' ? 'amber' : input.action === 'qc' ? 'red' : 'mint';
  toast({
    title: o.code + ' · ' + labelAction(ev.action),
    msg: (ev.machine ? ev.machine + ' · ' : '') + STAGES[o.stage].label + ' · ETA ' + orderEta(o).label,
    tone: kind, icon: 'scan', ms: 3200,
  });
  S.notifs.unshift({ id: 'n' + ev.id, tone: kind, icon: 'scan', title: ev.by + ' memindai ' + o.code, msg: labelAction(ev.action) + (ev.machine ? ' di ' + ev.machine : ''), at: ev.clock, read: false });
  paintBell();

  sendEvent(ev).then((res) => {
    ev.sync = res.local ? 'lokal' : res.ok ? 'terkirim' : 'gagal';
    save();
    if (S.route === 'scan') patchScanLog();
    if (!res.ok && !res.local) toast({ title: 'Belum terkirim', msg: ev.id + ' antre di perangkat, diset ulang saat /scan reachable.', tone: 'amber', icon: 'alert', ms: 3800 });
  });
  return ev;
}

function labelAction(a) {
  return { terima: 'diterima di kasir', muat: 'dimuat ke drum', tahap: 'naik tahap', lepas: 'drum dikosongkan', qc: 'balik rendam (QC)', selesai: 'diserahkan' }[a] || a;
}

/** Pindai saat server hidup: server yang memutuskan, UI menerapkan balasannya. */
function apiRecordEvent(input, o) {
  const action = input.action;
  API.scanEvent({
    code: o.code,
    action,
    machine: (input.machine || '').toUpperCase() || null,
    by: input.by || SCAN.operator,
    note: input.note || '',
  }).then((data) => {
    const fresh = (data && data.order) || o;
    const kind = action === 'lepas' ? 'amber' : action === 'qc' ? 'red' : 'mint';
    toast({
      title: fresh.code + ' · ' + labelAction(action),
      msg: (fresh.machine && fresh.machine !== '—' ? fresh.machine + ' · ' : '') + STAGES[fresh.stage].label + ' · ETA ' + orderEta(fresh).label,
      tone: kind, icon: 'scan', ms: 3200,
    });
    if (data && data.warning) toast({ title: 'Perhatian lantai', msg: data.warning, tone: 'amber', icon: 'alert', ms: 4400 });
    if (fresh.stage >= STAGES.length - 1) bubbles(12);
    save();
    if (S.route === 'scan') render();
    else { renderTicker(); livePatch(); paintBell(); }
  }).catch((err) => apiToastErr(err, 'Pindai ditolak'));
}

function flushPending() {
  const pend = S.events.filter((e) => e.sync === 'antre' || e.sync === 'gagal');
  if (!apiBase()) { pend.forEach((e) => { e.sync = 'lokal'; }); save(); return { sent: 0, mode: 'lokal' }; }
  pend.forEach((e) => sendEvent(e).then((r) => { if (r.ok) { e.sync = 'terkirim'; save(); } }));
  return { sent: pend.length, mode: 'api' };
}

/* ── VIEW: layar pindai operator ─────────────────── */

VIEWS.scan = {
  title: 'Pindai Lantai',
  kicker: () => (typeof API !== 'undefined' && API.on) ? 'sinkron realtime ke server' : apiBase() ? 'sinkron ke ' + apiBase() : 'mode lokal, belum ada API',
  render() {
    const late = bottlenecks();
    const aktif = S.orders.filter((o) => o.stage > 0 && o.stage < STAGES.length - 1).length;
    const recent = S.events.slice(0, 14);
    return `
    <div class="sc-top">
      <div class="sc-alerts">
        ${late.length ? late.map((x) => `
          <div class="alert t-red" data-reveal>${icon('alert')}
            <div><b>${esc(x.o.code)} macet di ${esc(STAGES[x.o.stage].label)}</b>
              <p>${x.dwell} menit di tahap ini, target ${x.target} menit.</p></div>
            <button class="btn sm" data-act="scan-focus" data-code="${x.o.code}">${icon('scan')} Pindai</button>
            <button class="btn sm ghost" data-act="scan-advance" data-code="${x.o.code}">${icon('chev')} Naik tahap</button></div>`).join('')
        : `<div class="alert ok t-mint" data-reveal>${icon('check')}<div><b>Tidak ada yang macet</b><p>Sembilan tahap berjalan di bawah target, ${aktif} pesanan diproses.</p></div></div>`}
      </div>
      <div class="sc-modes" role="group" aria-label="Mode pindai">
        ${[['terima', 'Terima'], ['muat', 'Mulai proses'], ['tahap', 'Naik tahap'], ['lepas', 'Selesai proses'], ['qc', 'QC gagal'], ['selesai', 'Serahkan']]
        .map(([m, l]) => `<button class="mode ${SCAN.mode === m ? 'on' : ''}" data-act="scan-mode" data-v="${m}">${esc(l)}</button>`).join('')}
        <button class="mode sim ${S.settings.pindaiSaja ? 'on' : ''}" data-act="scan-sim" title="Kalau aktif, tahap hanya bergerak lewat pindai">
          ${icon(S.settings.pindaiSaja ? 'lock' : 'bolt')} ${S.settings.pindaiSaja ? 'hanya pindai' : 'simulasi lantai'}
        </button>
      </div>
    </div>

    <form class="scanner" data-act="scan-form" data-reveal>
      <span class="scan-lamp ${SCAN.mode === 'qc' ? 'bad' : 'good'}"></span>
      <label class="scan-in">
        <span class="mono lbl">Label ${esc(SCAN.mode)}</span>
        <input id="scanq" class="mono" value="${esc(SCAN.draft)}" placeholder="BUSA-4471" autocomplete="off" spellcheck="false" aria-label="Nomor label">
      </label>
      <label class="scan-in slim">
        <span class="mono lbl">Operator</span>
        <select id="scanby" class="in mono">
          ${[SCAN.operator].concat(SEED.staff.map((s) => s.name)).filter((v, i, a) => a.indexOf(v) === i).map((n) => `<option ${n === SCAN.operator ? 'selected' : ''}>${esc(n)}</option>`).join('')}
        </select>
      </label>
      <button class="btn primary big" type="submit">${icon('scan')} Eksekusi</button>
      <p class="scan-hint mono">${esc(suggestion())}</p>
    </form>

    <section class="panel sc-log mt" data-reveal>
      <header class="p-head"><h2 class="display">Jejak lantai</h2>
        <span class="mono note">${S.events.length} event · <button class="lnk" data-act="scan-flush">set ulang sinkron</button></span></header>
      <div id="sc-log-body">${logRows(recent)}</div>
    </section>`;
  },
  wire() {
    const q = qs('#scanq');
    if (q && !REDUCED) q.focus();
  },
};

function suggestion() {
  const o = findOrder(SCAN.draft || SCAN.query);
  if (!o) return 'Belum ada label dikenali. Coba ' + S.orders[0].code + ' lalu tekan Enter.';
  if (SCAN.mode === 'muat') {
    const need = needsOf(o);
    return o.code + ' · ' + need.weight + ' kg siap diproses — unit dipilih otomatis oleh sistem.';
  }
  const e = orderEta(o);
  return o.code + ' · ' + STAGES[o.stage].label + (o.stageAt ? ' · ' + dwellMin(o) + ' menit di tahap ini' : '') + ' · ETA ' + e.label;
}

function logRows(list) {
  if (!list.length) return `<p class="mono fine">Belum ada event. Pindai satu label untuk memulai jejak.</p>`;
  return `<table class="tbl ev"><thead><tr><th>Jam</th><th>Event</th><th>Label</th><th>Aksi</th><th>Operator</th><th>Sinkron</th></tr></thead><tbody>` +
    list.map((e, i) => `<tr style="--i:${i}">
      <td class="mono">${esc(e.clock)}</td><td class="mono ev-id">${esc(e.id)}</td>
      <td><button class="lnk mono" data-act="scan-focus" data-code="${esc(e.code)}">${esc(e.code)}</button></td>
      <td>${esc(labelAction(e.action))}${e.note ? `<p class="mono fine">${esc(e.note)}</p>` : ''}</td>
      <td>${esc(e.by)}</td>
      <td><span class="sync s-${esc(e.sync)}">${esc(e.sync)}</span></td></tr>`).join('') + `</tbody></table>`;
}

function patchScanLog() {
  const box = qs('#sc-log-body');
  if (box) box.innerHTML = logRows(S.events.slice(0, 14));
}

function patchScanHint() {
  const h = qs('.scan-hint');
  if (h) h.textContent = suggestion();
  const lamp = qs('.scan-lamp');
  if (lamp) lamp.classList.toggle('bad', SCAN.mode === 'qc');
}

function scanSubmit(rawCode, by) {
  const q = qs('#scanq');
  const bEl = qs('#scanby');
  const code = String(rawCode !== undefined ? rawCode : (q ? q.value : '')).trim();
  const operator = by || (bEl ? bEl.value : SCAN.operator) || SCAN.operator;
  if (!code) { toast({ title: 'Label kosong', msg: 'Pindai atau ketik nomor label lebih dulu.', tone: 'red', icon: 'alert', ms: 2400 }); if (q) q.focus(); return null; }
  const ev = recordEvent({ code, action: SCAN.mode, by: operator });
  if (ev) {
    SCAN.draft = '';
    if (q) q.value = '';
    patchScanLog();
    render();
    const nq = qs('#scanq'); if (nq && !REDUCED) nq.focus();
  }
  return ev;
}
