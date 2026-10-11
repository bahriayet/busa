/* ── PORTAL PELANGGAN ─────────────────────────────── */

const allTiers = () => ((S.tiers && S.tiers.length) ? S.tiers : SEED.tiers);
const myTier = () => allTiers().find((t) => t.id === S.sub) || allTiers()[0];
const myKg = () => Math.round(visibleOrders().reduce((a, o) => a + o.weight, 0) * 10) / 10;

VIEWS.beranda = {
  title: () => 'Hai, ' + (S.persona && S.persona.name ? S.persona.name : SEED.persona.name).split(' ')[0], kicker: () => 'Ringkasan cucian Anda',
  render() {
    const mine = visibleOrders();
    const aktif = mine.filter((o) => o.stage < 8).sort((a, b) => b.stage - a.stage)[0];
    const siap = mine.filter((o) => o.stage >= 7 && o.stage < 8);
    const lalu = mine.filter((o) => o.stage === 8).slice(0, 3);
    const tier = myTier();
    const spend = mine.reduce((a, o) => a + (o.total || 0), 0);
    const slotKg = tier.price > 0 ? (tier.kgQuota || Math.round(Number((tier.perks[0].match(/\d+/) || [0])[0]))) : 0;
    const nextPick = mine.find((o) => o.stage < 2 && o.mode === 'pickup');
    return `
    <section class="hi" data-reveal>
      <div class="hi-l">
        <p class="mono kicker">${esc(todayDateLabel())}</p>
        <h1 class="display huge">Cucian Anda sedang<br><span class="ink-slash">${aktif ? esc(STAGES[aktif.stage].label.toLowerCase()) : 'menunggu antrean'}</span></h1>
        <p class="lede">Anda ${esc(tier.name)} sejak ${esc(S.persona.since)}. ${siap.length ? siap.length + ' pesanan siap diambil hari ini.' : 'Tidak ada yang perlu diambil hari ini.'}</p>
        <div class="hi-acts">
          <button class="btn primary big" data-act="new-order">${icon('plus')} Mulai order</button>
          ${aktif ? `<button class="btn ghost" data-act="detail" data-code="${aktif.code}">${icon('drum')} Lihat ${esc(aktif.code)}</button>` : ''}
          <button class="btn ghost" data-act="go" data-route="lacak" data-portal="c">${icon('truck')} Lacak kode</button>
        </div>
      </div>
      <div class="hi-r">
        ${aktif ? `
        <article class="live-card t-blue" data-act="detail" data-code="${aktif.code}" data-tilt="5" data-tilt-lift="8">
          ${drumMarkup({ rpm: (aktif.stage >= 7 ? 9 : 3.2) + 's', size: 116, state: aktif.stage >= 7 ? 'vent' : 'run', rags: 7 })}
          <div class="lc-b">
            <p class="mono kicker">${esc(aktif.created)} · ${esc(aktif.priority)}</p>
            <b class="display lg" data-scramble="${esc(aktif.code)}">${esc(aktif.code)}</b>
            <p class="lc-stage"><span class="stage-pill s-${aktif.stage}" data-live="order" data-id="${aktif.code}">${esc(STAGES[aktif.stage].label)}</span>
              <i class="mono">estimasi <b data-live="eta" data-id="${aktif.code}">${esc(etaFor(aktif.stage, aktif.priority))}</b></i></p>
            <div class="lc-bar"><i style="--w:${Math.round(aktif.stage / 8 * 100)}%"></i></div>
            <p class="mono fine">${kg(aktif.weight)} kg · ${esc(aktif.machine)}${aktif.courier !== '—' ? ' · kurir ' + esc(aktif.courier) : ''}</p>
          </div>
        </article>` : `<article class="live-card empty t-muted">
          ${drumMarkup({ rpm: '12s', size: 104, state: 'idle', rags: 3 })}
          <div class="lc-b"><b class="display lg">Belum ada yang berjalan</b>
            <p class="lede sm">Keranjang kosong. Order pertama hari ini dijemput maksimal 2 jam setelah dibuat.</p>
            <button class="btn primary" data-act="new-order">${icon('plus')} Buat order</button></div></article>`}
        <div class="hi-mini">
          <div class="hm t-orange"><b class="num lg">${S.stamps}/7</b><p class="mono lbl">Stempel loyalti</p></div>
          <div class="hm t-blue"><b class="num lg">${rp(spend)}</b><p class="mono lbl">Total belanja</p></div>
          <div class="hm t-mint"><b class="num lg">${kg(myKg())}</b><p class="mono lbl">kg bulan ini</p></div>
        </div>
      </div>
    </section>

    ${slotKg ? `
    <section class="quota" data-reveal>
      <div class="q-head"><p class="mono lbl">Kuota langganan ${esc(tier.name)}</p><b class="mono">${kg(myKg())} / ${slotKg} kg</b></div>
      <div class="track big"><i style="--w:${clamp(myKg() / slotKg * 100, 0, 100)}%"></i></div>
      <p class="mono fine">${myKg() > slotKg ? 'Melebihi kuota — kelebihan ditagih Rp 6.500/kg.' : 'Sisa ' + kg(slotKg - myKg()) + ' kg. Pemakaian di bawah kuota tidak hangus, dibawa ke bulan depan.'}</p>
    </section>` : ''}

    ${nextPick ? `
    <section class="pick-next t-mint" data-reveal>
      ${icon('calendar')}
      <div><b class="display lg">Penjemputan berikutnya ${esc(nextPick.slot.date)}</b>
        <p class="lede sm">Jam ${esc(nextPick.slot.time)} · ${esc((S.addresses.find((a) => a.id === S.cart.addr) || S.addresses.find((a) => a.def) || S.addresses[0] || {}).label)}. Kurir menunggu 15 menit dan mengirim foto bukti.</p></div>
      <button class="btn ghost" data-act="reslot" data-code="${nextPick.code}">${icon('clock')} Ubah jam</button>
    </section>` : ''}

    <section class="cust-grid">
      <div class="panel" data-reveal>
        <header class="p-head"><h2 class="display">Sedang di drum</h2><span class="mono note">${mine.filter((o) => o.stage < 7).length} aktif</span></header>
        <ul class="mini-ord">
          ${mine.filter((o) => o.stage < 7).slice(0, 4).map((o) => `
            <li data-act="detail" data-code="${o.code}">
              <span class="mono tk">${esc(o.code)}</span>
              <div class="mo-b"><b>${kg(o.weight)} kg · ${esc(o.items.map((x) => (CATALOG.find((c) => c.id === x.id) || {}).name).filter(Boolean).join(', '))}</b>
                <p class="mono fine">${esc(o.slot.date)} ${esc(o.slot.time)}</p></div>
              <span class="stage-pill s-${o.stage}">${esc(STAGES[o.stage].label)}</span>${icon('chev', 'chev')}
            </li>`).join('') || `<li class="empty">Semua cucian sudah selesai.</li>`}
        </ul>
      </div>
      <div class="panel" data-reveal>
        <header class="p-head"><h2 class="display">Perlu diambil</h2><span class="mono note">${siap.length} menunggu</span></header>
        <ul class="mini-ord">
          ${siap.map((o) => `<li data-act="detail" data-code="${o.code}"><span class="mono tk">${esc(o.code)}</span>
            <div class="mo-b"><b>${esc(o.machine)}</b><p class="mono fine">${rp(o.total)} · ${o.mode === 'pickup' ? 'ambil di cabang' : 'kurir menuju Anda'}</p></div>
            <span class="stage-pill s-${o.stage}">${esc(STAGES[o.stage].label)}</span>${icon('chev', 'chev')}</li>`).join('') || `<li class="empty">${icon('check')} Tidak ada antrean ambil.</li>`}
        </ul>
        <hr class="rule">
        <header class="p-head"><h3 class="display lg">Terakhir selesai</h3></header>
        <ul class="mini-ord dim">
          ${lalu.map((o) => `<li data-act="reorder" data-code="${o.code}"><span class="mono tk">${esc(o.code)}</span>
            <div class="mo-b"><b>${kg(o.weight)} kg</b><p class="mono fine">${esc(o.created)}</p></div>
            <span class="mono again">${icon('copy')} Pesan lagi</span></li>`).join('') || `<li class="empty">Belum ada riwayat.</li>`}
        </ul>
      </div>
      <div class="panel tips t-lilac" data-reveal>
        <header class="p-head"><h3 class="display">Dari lantai</h3></header>
        ${icon('spark')}
        <p class="lede sm">Kunyit dan kopi paling lolos kalau disiram air dingin sebelum masuk kantong. Jangan pakai sabun cuci tangan — ia mengunci noda di serat katun.</p>
        <div class="tip-list">
          <span class="chip">${icon('drop')} Suhu tetap 40°C untuk katun</span>
          <span class="chip">${icon('wind')} Handuk tidak boleh dicampur linen</span>
          <span class="chip">${icon('tag')} Label tahan air per item</span>
        </div>
        <button class="btn ghost sm" data-act="chat">${icon('mail')} Tanya tim</button>
      </div>
    </section>`;
  },
};

VIEWS.langganan = {
  title: 'Langganan', kicker: 'Tiga cara bayar',
  render() {
    const cur = myTier();
    const aktif = visibleOrders();
    const hemat = cur.id === 'basic' ? Math.round(aktif.reduce((a, o) => a + o.weight, 0) * 1400) : 0;
    return `
    <section class="sub-lead" data-reveal>
      <div>
        <p class="mono kicker">Paket berjalan · ${esc(cur.name)}</p>
        <h2 class="display hero">Bayar per kilogram,<br>atau per kebiasaan.</h2>
        <p class="lede">Kalau cucian Anda datang tiap minggu, paket rutin memotong harga dan memotong antrean. Kalau tidak, lepaskan saja — tidak ada kontrak yang mengikat.</p>
        ${cur.id === 'basic' && hemat > 0 ? `<p class="hint t-blue">${icon('spark')} Dengan pemakaian Anda bulan ini, paket Rutin Mingguan menghemat sekitar ${rp(hemat)}.</p>` : ''}
      </div>
      <div class="sub-now t-${cur.tone}">
        <p class="mono lbl">Paket aktif</p><b class="display xl">${esc(cur.name)}</b>
        <b class="num xxl">${cur.price ? rp(cur.price) : 'Gratis'}</b><i class="mono">${esc(cur.unit)}</i>
        <div class="sn-bar" aria-hidden="true">${[0, 1, 2].map((i) => drumMarkup({ rpm: (5 + i * 3) + 's', size: 46, state: 'run' })).join('')}</div>
        <button class="btn ghost" data-act="go" data-route="pesanan" data-portal="c">${icon('basket')} Pemakaian saya</button>
      </div>
    </section>
    <div class="tiles" data-reveal aria-hidden="true"></div>
    <section class="tiers">
      ${allTiers().map((t, i) => `
        <article class="tier t-${t.tone} ${t.id === cur.id ? 'now' : ''} ${t.id === 'premium' ? 'star' : ''}" style="--i:${i}" data-reveal data-tilt="6" data-tilt-lift="9">
          <div class="tr-corner">${icon('drum')}</div>
          <p class="mono kicker">${esc(t.best)}</p>
          <h3 class="display xl">${esc(t.name)}</h3>
          <div class="tr-price"><b class="num xl">${t.price ? rp(t.price) : 'Rp 0'}</b><i class="mono">${esc(t.unit)}</i></div>
          <ul class="tr-perks">${t.perks.map((p) => `<li>${icon('check')}${esc(p)}</li>`).join('')}</ul>
          ${t.id === cur.id
      ? `<span class="tr-cur">${icon('check')} Paket Anda sekarang</span>`
      : `<button class="btn ${t.id === 'premium' ? 'primary' : 'ghost'}" data-act="sub" data-v="${t.id}">${icon('bolt')} ${t.price ? 'Ambil paket ini' : 'Kembali ke lepas'}</button>`}
        </article>`).join('')}
    </section>
    <section class="panel cmp" data-reveal>
      <header class="p-head"><h3 class="display">Bandingkan detail</h3><span class="mono note">tanpa biaya tersembunyi</span></header>
      <div class="tbl-wrap"><table class="tbl cmp-tbl">
        <thead><tr><th>Yang Anda dapat</th>${allTiers().map((t) => `<th class="${t.id === cur.id ? 'act' : ''}">${esc(t.name)}</th>`).join('')}</tr></thead>
        <tbody>
          ${[['Harga per kg', ['Rp 8.000', 'Rp 6.900', 'Rp 6.200']],
    ['Antar-jemput', ['Gratis > Rp 80rb', 'Selalu gratis', 'Kurir khusus']],
    ['Prioritas antrean', ['Reguler', 'Di atas reguler', 'Teratas, SLA 24 jam']],
    ['Treatment noda', ['Rp 4.000/kg', '2× / bulan gratis', 'Termasuk tanpa batas wajar']],
    ['Klaim proteksi', ['Rp 500rb / item', 'Rp 750rb / item', 'Nilai kontrak 100%']],
    ['Laporan pemakaian', ['Riwayat order', 'Grafik bulanan', 'Dashboard per cabang']]].map((r, i) => `<tr style="--i:${i}"><td>${esc(r[0])}</td>${r[1].map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table></div>
      <p class="mono fine mt">Paket dipotong otomatis dari Dompet BUSA setiap tanggal 1. Batalkan lewat Profil, tagihan berhenti di akhir periode.</p>
    </section>`;
  },
};
