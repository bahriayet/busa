/* ── API & REALTIME ─────────────────────────────────────
   Jembatan frontend ↔ backend Fastify. Saat pengguna login, seluruh data
   utama (order, mesin, dompet, alamat, pemberitahuan, chat, katalog) dibaca
   dari REST API dan pembaruan lantai diterima lewat WebSocket /ws. Bila
   server tidak dapat dijangkau, aplikasi jatuh kembali ke mode lokal
   (localStorage + seed) tanpa error di wajah pengguna. */

const API = {
  on: false,
  busy: false,
  ws: null,
  wsTimer: null,
  wsTries: 0,
  renderTimer: null,
};

/** Alamat backend: kosong = satu domain (relatif), seperti mode lokal. */
function apiOrigin() {
  const base = (typeof window !== 'undefined' && window.BUSA_API_BASE) ? String(window.BUSA_API_BASE) : '';
  return base.replace(/\/+$/, '');
}

async function apiReq(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (isAuthed()) headers.Authorization = 'Bearer ' + S.auth.token;
  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(apiOrigin() + path, init);
  let data = null;
  try { data = await res.json(); } catch { /* balasan tanpa isi */ }
  if (!res.ok || (data && data.ok === false)) {
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.status = res.status;
    err.detail = data && data.detail;
    if (res.status === 401 && isAuthed()) {
      API.stop();
      clearAuth();
      err.silent = true;
      toast({ title: 'Sesi berakhir', msg: 'Silakan masuk kembali.', tone: 'amber', icon: 'lock', ms: 4200 });
      go(S.portal === 'a' ? 'loginA' : 'loginC', S.portal === 'a' ? 'a' : 'c');
    }
    throw err;
  }
  return data || { ok: true };
}

function apiToastErr(err, title) {
  if (err && err.silent) return;
  toast({
    title: title || 'Server menolak',
    msg: (err && err.message) || 'Coba lagi sebentar.',
    tone: 'red', icon: 'alert', ms: 4600,
  });
}

/* ── MERGE DATA SERVER → S ────────────────────────────── */

function apiMergeCatalog(data) {
  if (!data) return;
  (data.services || []).forEach((sv) => {
    const local = CATALOG.find((c) => c.id === sv.id);
    if (!local) return;
    local.price = sv.price;
    local.hours = sv.hours;
    local.active = sv.active;
    if (sv.name) local.name = sv.name;
    S.svc[local.id] = Object.assign(S.svc[local.id] || {}, { price: sv.price, hours: sv.hours, active: sv.active });
  });
  (data.addons || []).forEach((a) => {
    const local = ADDONS.find((x) => x.id === a.id);
    if (local) { local.price = a.price; local.active = a.active; }
  });
  if (Array.isArray(data.promos) && data.promos.length) S.promos = data.promos;
  if (Array.isArray(data.tiers) && data.tiers.length) S.tiers = data.tiers;
  if (Array.isArray(data.areas) && data.areas.length) S.areas = data.areas;
}

function apiPatchOrder(patch) {
  if (!patch || !patch.code) return;
  const i = S.orders.findIndex((o) => o.code === patch.code);
  if (i < 0) {
    if (patch.customer !== undefined) S.orders.unshift(Object.assign({}, patch));
    return;
  }
  S.orders[i] = Object.assign({}, S.orders[i], patch);
}

function apiApplyMe(me) {
  if (!me || !me.customer) return;
  const c = me.customer;
  S.me = c;
  ME = c.name;
  S.persona = Object.assign({}, S.persona, {
    name: c.name, phone: c.phone || S.persona.phone,
    member: c.tier, since: c.memberSince ? apiSinceLabel(c.memberSince) : S.persona.since,
  });
  S.wallet.balance = c.balance;
  S.stamps = c.stamps || 0;
  S.sub = c.tier || 'basic';
  if (me.wallet && typeof me.wallet === 'object') {
    if (typeof me.wallet.balance === 'number') S.wallet.balance = me.wallet.balance;
    if (Array.isArray(me.wallet.txns)) S.wallet.txns = me.wallet.txns;
  }
  if (Array.isArray(me.addresses)) S.addresses = me.addresses;
  if (Array.isArray(me.notifs)) S.notifs = me.notifs;
  if (Array.isArray(me.chat)) S.chat = me.chat;
  if (Array.isArray(me.orders)) S.orders = me.orders.filter((o) => !o.cancelled);
  if (S.cart && S.addresses.length && !S.addresses.some((a) => a.id === S.cart.addr)) {
    S.cart.addr = (S.addresses.find((a) => a.def) || S.addresses[0]).id;
  }
}

function apiSinceLabel(ms) {
  const d = new Date(ms);
  const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return bulan[d.getMonth()] + ' ' + d.getFullYear();
}

async function apiRefreshMe() {
  if (!isCustomerAuthed()) return null;
  const me = await apiReq('GET', '/api/me');
  apiApplyMe(me);
  return me;
}

async function apiLoadAdmin() {
  const [orders, machines, dash] = await Promise.all([
    apiReq('GET', '/api/orders?limit=200'),
    apiReq('GET', '/api/machines'),
    apiReq('GET', '/api/dashboard'),
  ]);
  if (Array.isArray(orders.orders)) S.orders = orders.orders.filter((o) => !o.cancelled);
  if (Array.isArray(machines.machines)) S.machines = machines.machines;
  apiApplyDash(dash);
  API.dashAt = Date.now();
}

function apiApplyDash(dash) {
  if (!dash) return;
  if (Array.isArray(dash.revenue)) S.revenue = dash.revenue;
  if (Array.isArray(dash.mix)) S.mix = dash.mix;
  if (Array.isArray(dash.activity)) S.activity = dash.activity;
  if (Array.isArray(dash.staff)) S.staff = dash.staff;
}

/** Segarkan angka dasbor saat admin membuka lantai/laporan (maks. sekali / 20 dtk). */
API.refreshDashboard = async function (force) {
  if (!API.on || !isAdminAuthed()) return null;
  const now = Date.now();
  if (!force && API.dashAt && now - API.dashAt < 20000) return null;
  API.dashAt = now;
  apiApplyDash(await apiReq('GET', '/api/dashboard'));
  return true;
};

/* ── BOOTSTRAP & SIKLUS HIDUP ─────────────────────────── */

API.bootstrap = async function () {
  if (!isAuthed()) return false;
  try {
    apiMergeCatalog(await apiReq('GET', '/api/catalog'));
    await API.loadQris();
    if (isCustomerAuthed()) await apiRefreshMe();
    else if (isAdminAuthed()) await apiLoadAdmin();
    API.on = true;
    S.apiOn = true;
    API.wsConnect();
    save();
    API.paintConn();
    return true;
  } catch (err) {
    API.on = false;
    S.apiOn = false;
    API.lastError = err;
    API.paintConn();
    return false;
  }
};

API.init = async function () {
  if (!isAuthed()) return false;
  API.busy = true;
  API.paintConn();
  const ok = await API.bootstrap();
  API.busy = false;
  if (ok) render();
  else if (!API.lastError || API.lastError.status !== 401) {
    toast({ title: 'Mode lokal', msg: 'Server tidak terjangkau — data contoh dipakai. Klik status di kanan atas untuk sambung ulang.', tone: 'amber', icon: 'info', ms: 5200 });
  }
  API.paintConn();
  return ok;
};

API.stop = function () {
  API.on = false;
  S.apiOn = false;
  S.users = [];
  S.usersLoaded = false;
  S.qris = null;
  clearTimeout(API.wsTimer);
  if (API.ws) {
    try { API.ws.close(); } catch { /* sudah tertutup */ }
    API.ws = null;
  }
  API.paintConn();
};

/* ── PAPAN PUBLIK /api/live (halaman situs) ───────────── */

API.live = { at: 0, doneToday: null, orders: [] };

/** Segarkan daftar "sedang dikerjakan" publik agar halaman situs menampilkan
 *  data nyata server (bukan contoh lokal), walau pengunjung belum login. */
API.loadLive = async function () {
  if (typeof S === 'undefined' || S.portal !== 'landing') return false;
  try {
    const res = await fetch(apiOrigin() + '/api/live');
    if (!res.ok) return false;
    const data = await res.json();
    if (!data || data.ok !== true || !Array.isArray(data.orders)) return false;
    API.live = {
      at: Date.now(),
      doneToday: typeof data.doneToday === 'number' ? data.doneToday : null,
      orders: data.orders,
    };
    const sig = JSON.stringify(API.live.orders.map((o) => [o.code, o.stage, o.etaLabel])) + '|' + API.live.doneToday;
    const changed = sig !== API.liveSig;
    API.liveSig = sig;
    const ae = document.activeElement;
    const typing = !!(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'));
    if (changed && !typing && S.portal === 'landing' && S.route === 'landing') render();
    return true;
  } catch {
    return false;
  }
};

/* ── STATUS KONEKSI & SAMBUNG ULANG ───────────────────── */

API.paintConn = function () {
  const el = (typeof qs === 'function') ? qs('#conn-btn') : null;
  if (!el) return;
  if (typeof isAuthed !== 'function' || !isAuthed()) { el.hidden = true; return; }
  el.hidden = false;
  const label = qs('#conn-label');
  if (API.busy) {
    el.dataset.state = 'sync';
    el.title = 'Menghubungkan ke server…';
    if (label) label.textContent = 'Menghubungkan…';
  } else if (API.on) {
    el.dataset.state = 'on';
    el.title = 'Server aktif — data tersinkron. Klik untuk menyegarkan.';
    if (label) label.textContent = 'Server aktif';
  } else {
    el.dataset.state = 'off';
    el.title = 'Server tidak terjangkau — mode lokal. Klik untuk sambung ulang.';
    if (label) label.textContent = 'Mode lokal · sambung';
  }
};

/** Tombol status: bangunkan backend bila cold start, lalu bootstrap ulang. */
API.reconnect = async function () {
  if (API.busy) return false;
  toast({ title: 'Menghubungkan…', msg: 'Server gratis bisa butuh sampai 1 menit untuk bangun.', tone: 'blue', icon: 'drum', ms: 5200 });
  const ok = await API.init();
  if (ok) toast({ title: 'Server tersambung', msg: 'Data disinkronkan dari backend.', tone: 'mint', icon: 'check' });
  return ok;
};

/* ── WEBSOCKET /ws ────────────────────────────────────── */

API.wsConnect = function () {
  if (!isAuthed() || API.ws || typeof WebSocket === 'undefined' || !location.host) return;
  let wsBase;
  try {
    const u = new URL(apiOrigin() || location.href);
    wsBase = (u.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + u.host;
  } catch { return; }
  const token = (S.auth && S.auth.token) ? String(S.auth.token) : '';
  let ws;
  try { ws = new WebSocket(wsBase + '/ws?token=' + encodeURIComponent(token)); } catch { return; }
  API.ws = ws;
  ws.addEventListener('message', (e) => {
    let msg = null;
    try { msg = JSON.parse(e.data); } catch { return; }
    apiWsHandle(msg);
  });
  ws.addEventListener('open', () => { API.wsTries = 0; API.paintConn(); });
  ws.addEventListener('close', (e) => {
    API.ws = null;
    /* 4401 = token tidak valid/kedaluwarsa — jangan reconnect berulang. */
    if (e && e.code === 4401) return;
    if (isAuthed()) {
      /* Backoff 4 dtk → 30 dtk: server gratis mungkin sedang bangun dari cold start. */
      API.wsTries = Math.min((API.wsTries || 0) + 1, 5);
      const delay = Math.min(4000 * Math.pow(1.7, API.wsTries - 1), 30000);
      clearTimeout(API.wsTimer);
      API.wsTimer = setTimeout(API.wsConnect, delay);
    }
    API.paintConn();
  });
  ws.addEventListener('error', () => { /* close akan menangani reconnect */ });
};

function apiWsHandle(msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'hello') {
    if (Array.isArray(msg.machines)) S.machines = msg.machines;
    if (Array.isArray(msg.events)) S.events = msg.events;
    apiScheduleRender();
    return;
  }
  if (msg.type === 'floor') {
    if (Array.isArray(msg.machines)) S.machines = msg.machines;
    if (Array.isArray(msg.orders)) msg.orders.forEach(apiPatchOrder);
    if (Array.isArray(msg.events)) S.events = msg.events;
    apiScheduleRender();
    return;
  }
  if (msg.type === 'scan') {
    if (Array.isArray(msg.machines)) S.machines = msg.machines;
    if (msg.order) apiPatchOrder(msg.order);
    if (typeof msg.stamps === 'number') S.stamps = msg.stamps;
    if (msg.event) {
      if (!Array.isArray(S.events)) S.events = [];
      if (!S.events.some((e) => e.id === msg.event.id)) S.events.unshift(msg.event);
    }
    apiScheduleRender();
  }
}

/* Render ulang hemat: patch elemen hidup dulu, lalu gambar ulang penuh hanya
   di papan yang isinya berubah bentuk (kanban/papan/pindai) — tanpa animasi
   masuk supaya tidak berkedip tiap 7 detik, dan ditahan saat ada input aktif. */
function apiScheduleRender() {
  if (typeof renderTicker === 'function') renderTicker();
  if (typeof livePatch === 'function') livePatch();
  if (typeof paintBell === 'function') paintBell();
  clearTimeout(API.renderTimer);
  API.renderTimer = setTimeout(() => {
    if (!VIEWS[S.route]) return;
    if (qs('#modalRoot.on') || qs('#drawerRoot.on')) return;
    if (!['antrean', 'papan', 'scan'].includes(S.route)) return;
    const ae = document.activeElement;
    if (ae && ae !== document.body && qs('#view').contains(ae)
        && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName)) return;
    render(false);
  }, 450);
}

/* ── MUTASI: PELANGGAN ────────────────────────────────── */

API.submitOrder = async function (payload) {
  const data = await apiReq('POST', '/api/orders', payload);
  if (data.order) apiPatchOrder(data.order);
  await apiRefreshMe();
  return data;
};

API.submitWalkin = async function (payload) {
  const data = await apiReq('POST', '/api/orders/walkin', payload);
  if (data.order) apiPatchOrder(data.order);
  return data;
};

API.addAddress = async function (tag, label) {
  const data = await apiReq('POST', '/api/me/addresses', { tag, label });
  if (Array.isArray(data.addresses)) S.addresses = data.addresses;
  return data;
};

API.delAddress = async function (id) {
  const data = await apiReq('DELETE', '/api/me/addresses/' + encodeURIComponent(id));
  if (Array.isArray(data.addresses)) S.addresses = data.addresses;
  return data;
};

API.defaultAddress = async function (id) {
  const data = await apiReq('POST', '/api/me/addresses/' + encodeURIComponent(id) + '/default');
  if (Array.isArray(data.addresses)) S.addresses = data.addresses;
  return data;
};

API.notifsRead = async function () {
  await apiReq('POST', '/api/me/notifs/read');
  S.notifs.forEach((n) => { n.read = true; });
  return true;
};

API.chat = async function (text) {
  const data = await apiReq('POST', '/api/me/chat', { text });
  if (Array.isArray(data.chat)) S.chat = data.chat;
  return data;
};

/* ── MUTASI: LANTAI & ADMIN ───────────────────────────── */

API.advance = async function (code) {
  const o = S.orders.find((x) => x.code === code);
  if (!o || o.stage >= STAGES.length - 1) return null;
  const held = S.machines.some((m) => m.ticket === code);
  let action = 'tahap';
  if (o.stage >= 2 && o.stage <= 4 && !held) action = 'muat';
  else if (o.stage === 7) action = 'selesai';
  const data = await apiReq('POST', '/api/scan', { code, action });
  if (data.order) apiPatchOrder(data.order);
  if (Array.isArray(data.machines)) S.machines = data.machines;
  if (typeof data.stamps === 'number') S.stamps = data.stamps;
  if (isCustomerAuthed()) await apiRefreshMe();
  return data;
};

/** Pindai operator dari layar Pindai — server memutuskan, klien menerapkan hasilnya. */
API.scanEvent = async function (payload) {
  const data = await apiReq('POST', '/api/scan', payload);
  if (data.order) apiPatchOrder(data.order);
  if (Array.isArray(data.machines)) S.machines = data.machines;
  if (typeof data.stamps === 'number') S.stamps = data.stamps;
  if (data.event) {
    if (!Array.isArray(S.events)) S.events = [];
    if (!S.events.some((e) => e.id === data.event.id)) S.events.unshift(data.event);
  }
  return data;
};

API.collect = async function (code) {
  const data = await apiReq('POST', '/api/orders/' + encodeURIComponent(code) + '/collect');
  if (data.order) apiPatchOrder(data.order);
  return data;
};

/** Kasir/staf menandai pesanan lunas (mis. tunai diterima). */
API.pay = async function (code, method) {
  const data = await apiReq('POST', '/api/orders/' + encodeURIComponent(code) + '/pay', { method });
  if (data.order) apiPatchOrder(data.order);
  return data;
};

/** Pindah jam jemput — pelanggan hanya sampai sebelum masuk lantai. */
API.reslot = async function (code, slotTime) {
  const data = await apiReq('POST', '/api/orders/' + encodeURIComponent(code) + '/reslot', { slotTime });
  if (data.order) apiPatchOrder(data.order);
  return data;
};

/** Unggah bukti bayar QRIS — status lunas tetap menunggu verifikasi kasir. */
API.proof = async function (code, dataUrl) {
  const data = await apiReq('POST', '/api/orders/' + encodeURIComponent(code) + '/proof', { dataUrl });
  if (data.order) apiPatchOrder(data.order);
  if (data.proof) { S.proofs = S.proofs || {}; S.proofs[code] = data.proof; }
  return data;
};

/** Baca bukti bayar tersimpan (kasir memeriksa sebelum menandai lunas). */
API.loadProof = async function (code) {
  const data = await apiReq('GET', '/api/orders/' + encodeURIComponent(code) + '/proof');
  S.proofs = S.proofs || {};
  S.proofs[code] = data.proof || null;
  return data.proof || null;
};

API.cancel = async function (code) {
  const data = await apiReq('POST', '/api/orders/' + encodeURIComponent(code) + '/cancel');
  S.orders = S.orders.filter((o) => o.code !== code);
  if (isCustomerAuthed()) await apiRefreshMe();
  return data;
};

API.patchService = async function (id, patch) {
  const data = await apiReq('PATCH', '/api/services/' + encodeURIComponent(id), patch);
  if (data.service) apiMergeCatalog({ services: [data.service] });
  return data;
};

API.patchAddon = async function (id, patch) {
  const data = await apiReq('PATCH', '/api/addons/' + encodeURIComponent(id), patch);
  if (data.addon) apiMergeCatalog({ addons: [data.addon] });
  return data;
};

/* ── MUTASI: QRIS PEMBAYARAN ──────────────────────────── */

/** Baca gambar QRIS aktif. Gagal baca bukan alasan boot berhenti — pakai bawaan. */
API.loadQris = async function () {
  try {
    const data = await apiReq('GET', '/api/qris');
    S.qris = data.qris || null;
  } catch (err) {
    if (err && err.silent) throw err;
    S.qris = null;
  }
  return S.qris;
};

API.uploadQris = async function (dataUrl) {
  const data = await apiReq('PUT', '/api/qris', { dataUrl });
  S.qris = data.qris || null;
  return S.qris;
};

API.resetQris = async function () {
  const data = await apiReq('DELETE', '/api/qris');
  S.qris = null;
  return data;
};

/* ── MUTASI: MANAJEMEN PENGGUNA (ADMIN) ───────────────── */

API.loadUsers = async function () {
  const data = await apiReq('GET', '/api/users');
  S.users = Array.isArray(data.users) ? data.users : [];
  S.usersLoaded = true;
  return S.users;
};

API.createUser = async function (body) {
  const data = await apiReq('POST', '/api/users', body);
  await API.loadUsers();
  return data;
};

API.updateUser = async function (id, patch) {
  const data = await apiReq('PATCH', '/api/users/' + encodeURIComponent(id), patch);
  await API.loadUsers();
  return data;
};

API.deleteUser = async function (id) {
  const data = await apiReq('DELETE', '/api/users/' + encodeURIComponent(id));
  S.users = S.users.filter((u) => u.id !== id);
  return data;
};
