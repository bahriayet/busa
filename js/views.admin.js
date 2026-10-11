/* ── PORTAL ADMIN ─────────────────────────────────── */

const GROUPS = [
  { id: 'masuk', label: 'Masuk lantai', stages: [0, 1], tone: 'muted' },
  { id: 'cuci', label: 'Rendam · Cuci · Bilas', stages: [2, 3, 4], tone: 'blue' },
  { id: 'finishing', label: 'Kering · Setrika', stages: [5, 6], tone: 'amber' },
  { id: 'siap', label: 'QC & Siap', stages: [7], tone: 'lilac' },
  { id: 'selesai', label: 'Selesai', stages: [8], tone: 'mint' },
];

const svcOn = (s) => s.active !== false;

VIEWS.antrean = {
  title: 'Antrean', kicker: 'Papan tahapan',
  render() {
    const cols = GROUPS.map((g) => ({ ...g, items: S.orders.filter((o) => g.stages.includes(o.stage)) }));
    return `
    <div class="kan-head">
      <div><p class="mono kicker">${esc(todayDateLabel())}</p><h1 class="display xl">Antrean lantai — ${S.orders.length} pesanan</h1></div>
      <div class="kan-sum">
        ${cols.map((c) => `<span class="chip t-${c.tone}">${esc(c.label)} <b class="mono">${c.items.length}</b></span>`).join('')}
      </div>
    </div>
    <div class="kanban">
      ${cols.map((c, gi) => `
        <section class="kcol t-${c.tone}" style="--i:${gi}" data-reveal>
          <header class="kc-h"><b>${esc(c.label)}</b><span class="mono">${c.items.reduce((a, o) => a + o.weight, 0).toFixed(1)} kg</span></header>
          <div class="kc-body">
            ${c.items.map((o) => `
              <article class="kcard ${o.priority === 'express' ? 'exp' : ''}" data-act="detail" data-code="${o.code}" data-tilt="6" data-tilt-lift="8" tabindex="0">
                <div class="kc-top"><b class="mono">${esc(o.code)}</b>${o.priority === 'express' ? `<span class="exp-tag">${icon('bolt')}</span>` : ''}</div>
                <p class="kc-who">${esc(o.customer)}</p>
                <p class="mono fine">${kg(o.weight)} kg · ${esc(o.machine)} · ${esc(o.slot.time)}</p>
                <div class="kc-foot">
                  <span class="mono">${rp(o.total)}</span>
                  ${o.stage < 8 ? `<button class="knext" data-act="kan" data-code="${o.code}" aria-label="Naikkan tahap">${icon('chev')}</button>` : `<span class="mono done-t">${icon('check')} beres</span>`}
                </div>
              </article>`).join('') || `<p class="kc-empty mono">kolom kosong</p>`}
          </div>
        </section>`).join('')}
    </div>
    <p class="mono fine">Klik kartu untuk membuka detail; tombol › memindahkan pesanan ke tahap berikutnya. Simulasi lantai berjalan otomatis tiap 7 detik.</p>`;
  },
};

function customerRows() {
  const map = {};
  S.orders.forEach((o) => {
    const c = map[o.customer] || (map[o.customer] = { name: o.customer, phone: o.phone, n: 0, kg: 0, rp: 0, last: o.created, codes: [], express: 0 });
    c.n++; c.kg += o.weight; c.rp += o.total; c.codes.push(o.code); if (o.priority === 'express') c.express++;
  });
  return Object.values(map).map((c) => {
    c.tier = c.rp >= 400000 ? 'Bisnis' : c.rp >= 150000 ? 'Rutin' : 'Lepas';
    c.kg = Math.round(c.kg * 10) / 10;
    return c;
  }).sort((a, b) => b.rp - a.rp);
}

VIEWS.pelanggan = {
  title: 'Pelanggan', kicker: 'Basis pelanggan',
  render() {
    const rows = customerRows();
    const totalRp = rows.reduce((a, c) => a + c.rp, 0);
    return `
    <div class="rep-top">
      <div><p class="mono kicker">${rows.length} pelanggan · ${rows.reduce((a, c) => a + c.n, 0)} pesanan</p><h1 class="display xl">Siapa yang mengisi drum kita</h1></div>
      <label class="search-inline">${icon('search')}<input value="${esc(custQuery)}" data-act="cust-q" placeholder="cari nama…" aria-label="Cari pelanggan"></label>
    </div>
    <div class="cust-stats">
      <div class="cst t-blue" data-reveal><p class="mono lbl">Nilai pesanan</p><b class="num xl">${rp(totalRp)}</b></div>
      <div class="cst t-mint" data-reveal><p class="mono lbl">Pelanggan Bisnis</p><b class="num xl">${rows.filter((c) => c.tier === 'Bisnis').length}</b></div>
      <div class="cst t-orange" data-reveal><p class="mono lbl">Pesanan express</p><b class="num xl">${rows.reduce((a, c) => a + c.express, 0)}</b></div>
      <div class="cst t-lilac" data-reveal><p class="mono lbl">Rata-rata / pelanggan</p><b class="num xl">${rp(totalRp / (rows.length || 1))}</b></div>
    </div>
    <section class="panel tbl-wrap" data-reveal>
      <table class="tbl">
        <thead><tr><th>Pelanggan</th><th>Tagihan</th><th>Pesanan</th><th>Kilogram</th><th>Tier</th><th>Terakhir</th></tr></thead>
        <tbody>
          ${rows.filter((c) => !custQuery || c.name.toLowerCase().includes(custQuery.toLowerCase())).map((c, i) => `
            <tr style="--i:${i}" data-act="cust" data-name="${esc(c.name)}">
              <td><span class="who"><i class="av">${esc(initials(c.name))}</i><b>${esc(c.name)}</b></span><p class="mono fine">${esc(c.phone)}</p></td>
              <td class="mono num">${rp(c.rp)}</td><td class="mono">${c.n}</td><td class="mono">${kg(c.kg)} kg</td>
              <td><span class="stage-pill t-${c.tier === 'Bisnis' ? 'orange' : c.tier === 'Rutin' ? 'blue' : 'muted'}">${esc(c.tier)}</span></td>
              <td class="mono fine">${esc(c.last)}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>`;
  },
};

function custDrawer(name) {
  const list = S.orders.filter((o) => o.customer === name);
  const c = customerRows().find((x) => x.name === name) || { tier: 'Lepas', kg: 0, rp: 0, phone: '—', n: list.length };
  openDrawer(`
    <header class="dr-head"><div><p class="mono kicker">${esc(c.tier)} · ${list.length} pesanan</p><h2 class="display">${esc(name)}</h2></div>
      <button class="btn-icon" data-act="drawer-close" aria-label="Tutup">${icon('x')}</button></header>
    <div class="dr-body">
      <div class="kv">
        <div><p class="mono lbl">Telepon</p><b class="mono">${esc(c.phone)}</b></div>
        <div><p class="mono lbl">Total kg</p><b>${kg(c.kg)} kg</b></div>
        <div><p class="mono lbl">Tagihan</p><b>${rp(c.rp)}</b></div>
        <div><p class="mono lbl">Rata-rata</p><b>${rp(c.rp / (c.n || 1))}</b></div>
      </div>
      <p class="mono lbl mt">Pesanan</p>
      <ul class="mini-ord">
        ${list.map((o) => `<li data-act="detail" data-code="${o.code}"><span class="mono tk">${esc(o.code)}</span>
          <div class="mo-b"><b>${kg(o.weight)} kg · ${rp(o.total)}</b><p class="mono fine">${esc(o.created)}</p></div>
          <span class="stage-pill s-${o.stage}">${esc(STAGES[o.stage].label)}</span>${icon('chev', 'chev')}</li>`).join('')}
      </ul>
    </div>
    <footer class="dr-acts"><button class="btn primary" data-act="new-order">${icon('plus')} Order walk-in</button>
      <button class="btn ghost" data-act="copy" data-v="${esc(c.phone)}">${icon('phone')} Salin nomor</button></footer>`);
}

VIEWS.layanan = {
  title: 'Layanan & Harga', kicker: 'Katalog live',
  render() {
    return `
    <div class="rep-top">
      <div><p class="mono kicker">Perubahan langsung terasa di portal pelanggan</p><h1 class="display xl">Katalog layanan</h1></div>
      <div class="kan-sum"><button class="btn ghost sm" data-act="svc-reset">${icon('copy')} Kembalikan default</button></div>
    </div>
    <div class="svc-grid">
      ${CATALOG.map((s, i) => `
        <article class="svc-card t-${s.tone} ${svcOn(s) ? '' : 'off'}" style="--i:${i}" data-reveal>
          <div class="sc-head">${icon(s.icon)}<b class="display lg">${esc(s.name)}</b>
            <button class="sw ${svcOn(s) ? 'on' : ''}" data-act="svc-toggle" data-id="${s.id}" aria-label="Aktif/nonaktif"><i></i></button></div>
          <div class="sc-fields">
            <label class="fld"><span class="mono lbl">Harga / ${esc(s.unit)}</span>
              <input class="in sm mono" type="number" min="0" step="500" value="${s.price}" data-act="svc-field" data-k="price" data-id="${s.id}"></label>
            <label class="fld"><span class="mono lbl">Cycle (jam)</span>
              <input class="in sm mono" type="number" min="1" max="168" value="${s.hours}" data-act="svc-field" data-k="hours" data-id="${s.id}"></label>
          </div>
          <p class="svc-desc">${esc(s.desc)}</p>
          <div class="sc-calc"><span class="mono lbl">Simulasi 10 kg</span><b class="num md">${rp(s.price * (s.unit === 'kg' ? 10 : 10))}</b></div>
        </article>`).join('')}
    </div>
    <section class="panel" data-reveal>
      <header class="p-head"><h3 class="display">Tambahan</h3><span class="mono note">${ADDONS.length} aktif</span></header>
      <ul class="add-list">${ADDONS.map((a) => `<li>${icon(a.icon)}<div><b>${esc(a.name)}</b><p class="mono fine">${esc(a.note)}</p></div>
        <label class="fld inline"><span class="mono lbl">${a.kind === 'kg' ? '/kg' : '/paket'}</span>
          <input class="in xs mono" type="number" min="0" step="1000" value="${a.price}" data-act="addon-field" data-id="${a.id}"></label></li>`).join('')}</ul>
      <p class="mono fine mt">Minimum order per kg: 3 kg · Antar-jemput gratis di atas Rp 80.000 (Rp 12.000 di bawah itu).</p>
    </section>`;
  },
};

let custQuery = '';

/* ── MANAJEMEN PENGGUNA (ADMIN) ───────────────────── */

const ROLE_LABEL = { admin: 'Admin', staff: 'Staf', customer: 'Pelanggan' };

VIEWS.pengguna = {
  title: 'Pengguna', kicker: 'Akun & hak akses',
  render() {
    if (typeof API !== 'undefined' && API.on && !S.usersLoaded && !S.usersLoading) {
      S.usersLoading = true;
      API.loadUsers()
        .then(() => { S.usersLoading = false; render(); })
        .catch(() => { S.usersLoading = false; render(); });
    }
    const rows = S.users || [];
    const counts = { admin: 0, staff: 0, customer: 0 };
    rows.forEach((u) => { counts[u.role] = (counts[u.role] || 0) + 1; });
    const meId = S.auth.user ? S.auth.user.id : null;
    return `
    <div class="rep-top">
      <div><p class="mono kicker">${rows.length} akun · ${counts.admin} admin · ${counts.staff} staf · ${counts.customer} pelanggan</p>
        <h1 class="display xl">Siapa yang boleh masuk</h1></div>
      <div class="kan-sum">
        <button class="btn ghost sm" data-act="users-reload">${icon('refresh')} Muat ulang</button>
        <button class="btn primary sm" data-act="user-new">${icon('plus')} Tambah pengguna</button>
      </div>
    </div>
    <section class="panel tbl-wrap" data-reveal>
      <header class="p-head"><h3 class="display">Daftar akun</h3><span class="mono note">JWT + password scrypt</span></header>
      <table class="tbl">
        <thead><tr><th>Nama</th><th>Login</th><th>Peran</th><th>Status</th><th class="r">Aksi</th></tr></thead>
        <tbody>
          ${rows.map((u, i) => `<tr style="--i:${i}">
            <td><span class="who"><i class="av">${esc(initials(u.name))}</i><b>${esc(u.name)}</b></span>${u.id === meId ? ' <span class="mono chip tiny">anda</span>' : ''}</td>
            <td class="mono">${esc(u.username || u.phone || '—')}</td>
            <td><span class="stage-pill t-${u.role === 'admin' ? 'orange' : u.role === 'staff' ? 'blue' : 'muted'}">${esc(ROLE_LABEL[u.role] || u.role)}</span></td>
            <td>${u.active ? `<span class="mono fine">${icon('check')} aktif</span>` : '<span class="mono fine">nonaktif</span>'}</td>
            <td class="r"><div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">
              <button class="btn sm ghost" data-act="user-edit" data-id="${u.id}">${icon('sliders')} Ubah</button>
              <button class="btn sm ghost" data-act="user-toggle" data-id="${u.id}">${icon(u.active ? 'pause' : 'play')} ${u.active ? 'Jeda' : 'Aktifkan'}</button>
              <button class="btn sm danger" data-act="user-del" data-id="${u.id}" ${u.id === meId ? 'disabled title="Tidak bisa menghapus akun sendiri"' : ''}>${icon('x')} Hapus</button>
            </div></td>
          </tr>`).join('') || `<tr><td colspan="5"><p class="mono fine">${typeof API !== 'undefined' && API.on ? 'Memuat data pengguna…' : 'Server tidak terjangkau — data pengguna hanya tersedia saat API aktif.'}</p></td></tr>`}
        </tbody>
      </table>
    </section>
    <p class="mono fine">Perubahan peran berlaku pada login berikutnya. Menghapus akun tidak menghapus riwayat order pelanggan.</p>`;
  },
};

function userModal(u) {
  const edit = Boolean(u);
  if (!edit) {
    openModal(`
      <p class="mono kicker">Akun baru</p><h2 class="display lg">Tambah pengguna</h2>
      <label class="field"><p class="mono lbl">Nama lengkap</p><input id="u-name" class="in" placeholder="Nama pengguna" autocomplete="off"></label>
      <div class="two-col">
        <label class="field"><p class="mono lbl">Peran</p><select id="u-role" class="in">${['staff', 'admin', 'customer'].map((r) => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join('')}</select></label>
        <label class="field"><p class="mono lbl">Username (staf/admin)</p><input id="u-username" class="in mono" placeholder="mis. wulan" autocomplete="off"></label>
      </div>
      <label class="field"><p class="mono lbl">Nomor telepon (pelanggan)</p><input id="u-phone" class="in mono" placeholder="0812-xxxx-xxxx" autocomplete="off"></label>
      <label class="field"><p class="mono lbl">Password awal</p><input id="u-password" class="in mono" type="password" placeholder="Minimal 6 karakter" autocomplete="new-password"></label>
      <p class="hint">${icon('info', '')} Staf & admin masuk dengan username; pelanggan masuk dengan nomor telepon.</p>
      <div class="m-acts"><button class="btn primary" data-act="user-create">${icon('check')} Simpan</button>
      <button class="btn ghost" data-act="modal-close">Batal</button></div>`);
    return;
  }
  openModal(`
    <p class="mono kicker">Ubah akun</p><h2 class="display lg">${esc(u.name)}</h2>
    <label class="field"><p class="mono lbl">Nama lengkap</p><input id="u-name" class="in" value="${esc(u.name)}"></label>
    <div class="two-col">
      <label class="field"><p class="mono lbl">Peran</p><select id="u-role" class="in">${['staff', 'admin', 'customer'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select></label>
      <label class="field"><p class="mono lbl">Status</p><select id="u-active" class="in"><option value="1" ${u.active ? 'selected' : ''}>Aktif</option><option value="0" ${u.active ? '' : 'selected'}>Nonaktif</option></select></label>
    </div>
    <label class="field"><p class="mono lbl">Reset password (opsional)</p><input id="u-password" class="in mono" type="password" placeholder="Kosongkan bila tidak diganti" autocomplete="new-password"></label>
    <p class="mono fine">Login: <b>${esc(u.username || u.phone || '—')}</b></p>
    <div class="m-acts"><button class="btn primary" data-act="user-save" data-id="${u.id}">${icon('check')} Simpan perubahan</button>
    <button class="btn ghost" data-act="modal-close">Batal</button></div>`);
}

async function userCreate() {
  const name = (qs('#u-name').value || '').trim();
  const role = qs('#u-role').value || 'staff';
  const username = (qs('#u-username').value || '').trim();
  const phone = (qs('#u-phone').value || '').trim();
  const password = qs('#u-password').value || '';
  if (!name) { toast({ title: 'Nama wajib diisi', tone: 'red', icon: 'alert' }); return; }
  if (password.length < 6) { toast({ title: 'Password minimal 6 karakter', tone: 'red', icon: 'alert' }); return; }
  if (role === 'customer' && !phone) { toast({ title: 'Pelanggan butuh nomor telepon', tone: 'red', icon: 'alert' }); return; }
  if (role !== 'customer' && !username) { toast({ title: 'Staf/admin butuh username', tone: 'red', icon: 'alert' }); return; }
  try {
    await API.createUser({ name, role, username: username || undefined, phone: phone || undefined, password });
    closeModal(); render();
    toast({ title: 'Pengguna dibuat', msg: name + ' · ' + (ROLE_LABEL[role] || role), tone: 'mint', icon: 'check' });
  } catch (err) { apiToastErr(err, 'Gagal membuat pengguna'); }
}

async function userSave(id) {
  const u = (S.users || []).find((x) => x.id === id); if (!u) return;
  const name = (qs('#u-name').value || '').trim() || u.name;
  const role = qs('#u-role').value || u.role;
  const active = qs('#u-active').value === '1';
  const newPassword = qs('#u-password').value || '';
  if (newPassword && newPassword.length < 6) { toast({ title: 'Password minimal 6 karakter', tone: 'red', icon: 'alert' }); return; }
  const patch = { name, role, active };
  if (newPassword) patch.newPassword = newPassword;
  try {
    await API.updateUser(id, patch);
    closeModal(); render();
    toast({ title: 'Akun diperbarui', msg: name + ' · ' + (ROLE_LABEL[role] || role), tone: 'blue', icon: 'check' });
  } catch (err) { apiToastErr(err, 'Gagal menyimpan akun'); }
}

/* ── QRIS PEMBAYARAN (ADMIN) ──────────────────────── */

VIEWS.pembayaran = {
  title: 'Pembayaran', kicker: 'QRIS untuk pelanggan',
  render() {
    const custom = qrisIsCustom();
    const online = typeof API !== 'undefined' && API.on;
    return `
    <div class="rep-top">
      <div><p class="mono kicker">Satu kode untuk semua pelanggan</p><h1 class="display xl">QRIS pembayaran</h1></div>
      <div class="kan-sum">
        <button class="btn ghost sm" data-act="qris-download">${icon('download')} Unduh QRIS aktif</button>
      </div>
    </div>
    ${online ? '' : `<p class="hint warn">${icon('alert')} Server tidak terjangkau — QRIS hanya bisa diganti saat tersambung.</p>`}
    <section class="set-grid">
      <div class="panel" data-reveal>
        <header class="p-head"><h3 class="display">QRIS aktif</h3><span class="mono note">${custom ? 'diunggah admin' : 'gambar bawaan'}</span></header>
        <div class="qris-preview ${custom ? 'custom' : 'fallback'}">
          <img id="qris-img" src="${qrisSrc()}" alt="Pratinjau QRIS" onerror="this.onerror=null;this.src='./img/qris.svg';">
          <div>
            <b class="display lg">${custom ? 'QRIS kustom aktif' : 'Menunggu unggahan'}</b>
            <p class="mono fine">${custom
              ? 'Diperbarui ' + qrisDate(S.qris.updatedAt)
              : 'Pelanggan masih melihat gambar contoh di langkah Pembayaran.'}</p>
            <p>Gambar ini otomatis muncul di langkah Pembayaran pelanggan dan bisa mereka unduh untuk dipindai.</p>
          </div>
        </div>
        <div class="data-acts mt">
          ${custom ? `<button class="btn danger sm" data-act="qris-reset">${icon('x')} Hapus, kembali ke contoh</button>` : ''}
        </div>
      </div>
      <div class="panel" data-reveal>
        <header class="p-head"><h3 class="display">${custom ? 'Ganti QRIS' : 'Unggah QRIS'}</h3><span class="mono note">PNG · JPG · WEBP · besar dikompres otomatis</span></header>
        <div class="qris-drop" id="qris-drop" data-act="qris-pick" role="button" tabindex="0" aria-label="Pilih gambar QRIS">
          ${icon('upload')}
          <b>Letakkan gambar QRIS di sini</b>
          <p class="mono fine">atau klik untuk memilih file — gambar langsung menggantikan QRIS aktif.</p>
        </div>
        <input id="qris-file" type="file" accept="image/*" hidden>
        <p class="hint">${icon('info', '')} Simpan screenshot QRIS dari aplikasi bank/e-wallet Anda, lalu unggah di sini. Pelanggan melihat gambar yang sama saat checkout dan bisa mengunduhnya.</p>
      </div>
    </section>`;
  },
  wire() {
    const drop = qs('#qris-drop');
    const file = qs('#qris-file');
    if (!drop || !file) return;
    file.addEventListener('change', () => {
      qrisApplyFile(file.files && file.files[0]);
      file.value = '';
    });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('on'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('on'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('on');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) qrisApplyFile(f);
    });
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); }
    });
  },
};

/** Baca file lokal → data URL → unggah ke server; langsung terasa di portal pelanggan. */
async function qrisApplyFile(file) {
  if (!file) return;
  if (typeof API === 'undefined' || !API.on || !isAdminAuthed()) {
    toast({ title: 'Server tidak terjangkau', msg: 'QRIS hanya bisa diganti saat terhubung.', tone: 'amber', icon: 'alert' });
    return;
  }
  if (!/^image\//.test(file.type || '')) {
    toast({ title: 'Bukan berkas gambar', msg: 'Pilih file gambar (screenshot QRIS dari bank/e-wallet).', tone: 'red', icon: 'alert' });
    return;
  }
  try {
    const dataUrl = await prepareImageDataUrl(file);
    await API.uploadQris(dataUrl);
    render();
    toast({ title: 'QRIS diperbarui', msg: 'Pelanggan langsung melihat gambar baru.', tone: 'mint', icon: 'check' });
  } catch (err) { apiToastErr(err, 'QRIS gagal diunggah'); }
}
