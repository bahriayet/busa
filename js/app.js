const KEY = 'busa.ops.v1';

const SVC0 = CATALOG.map((s) => ({ id: s.id, price: s.price, hours: s.hours }));
const ADDON0 = ADDONS.map((a) => ({ id: a.id, price: a.price }));

const ME0 = SEED.persona.name;
let ME = ME0;

const PORTALS = {
  landing: { label: 'Situs', home: 'landing', nav: [] },
  c: {
    label: 'Pelanggan', home: 'beranda',
    nav: [
      { id: 'beranda', label: 'Beranda', icon: 'drum' },
      { id: 'order', label: 'Order', icon: 'plus' },
      { id: 'pesanan', label: 'Pesanan', icon: 'basket' },
      { id: 'lacak', label: 'Lacak', icon: 'truck' },
      { id: 'harga', label: 'Harga', icon: 'tag' },
      { id: 'langganan', label: 'Langganan', icon: 'star' },
      { id: 'statistik', label: 'Statistik', icon: 'chart' },
      { id: 'setelan', label: 'Profil', icon: 'user' },
    ],
  },
  a: {
    label: 'Admin', home: 'floor',
    nav: [
      { id: 'floor', label: 'Lantai', icon: 'drum' },
      { id: 'papan', label: 'Papan', icon: 'calendar' },
      { id: 'scan', label: 'Pindai', icon: 'scan' },
      { id: 'antrean', label: 'Antrean', icon: 'grid' },
      { id: 'pesanan', label: 'Pesanan', icon: 'basket' },
      { id: 'mesin', label: 'Mesin', icon: 'gear' },
      { id: 'pelanggan', label: 'Pelanggan', icon: 'user' },
      { id: 'pengguna', label: 'Pengguna', icon: 'key' },
      { id: 'layanan', label: 'Layanan', icon: 'tag' },
      { id: 'pembayaran', label: 'Pembayaran', icon: 'wallet' },
      { id: 'laporan', label: 'Laporan', icon: 'chart' },
      { id: 'setelan', label: 'Profil', icon: 'user' },
    ],
  },
};

const portalOf = (view) => (Object.keys(PORTALS).find((p) => PORTALS[p].nav.some((n) => n.id === view)) || 'c');
const navFor = (p) => PORTALS[p] ? PORTALS[p].nav : PORTALS.c.nav;
const homeOf = (p) => (PORTALS[p] || PORTALS.c).home;
function routeHash(portal, view) { return portal === 'landing' ? '#/' : '#/' + portal + '/' + view; }
function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  if (!raw) return { portal: 'landing', view: 'landing' };
  const seg = raw.split('/');
  if (seg.length === 1) return { portal: portalOf(seg[0]), view: seg[0] };
  const [p, v] = seg;
  if (!PORTALS[p]) return { portal: 'landing', view: 'landing' };
  return { portal: p, view: VIEWS[v] ? v : homeOf(p) };
}
function visibleOrders() {
  if (S.portal !== 'c') return S.orders;
  if (S.me) return S.orders.filter((o) => o.customerId === S.me.id || o.customer === S.me.name);
  return S.orders.filter((o) => o.customer === ME);
}

const SLOTS = SEED.slots;

let S = {
  theme: 'bone',
  portal: 'landing',
  route: 'landing',
  orders: SEED.orders.map((o) => ({ ...o })),
  machines: SEED.machines.map((m) => ({ ...m })),
  wallet: { balance: 412500, txns: SEED.txns.map((t) => ({ ...t })) },
  stamps: 4,
  addresses: SEED.addresses.map((a) => ({ ...a })),
  promos: SEED.promos,
  settings: { push: true, sms: false, promo: true, protect: true, sortKey: 'total', range: 14, pindaiSaja: false },
  notifs: [
    { id: 'n1', tone: 'mint', icon: 'star', title: 'BUSA-4469 siap diambil', msg: 'Kode rak C-07 · berlaku 3 hari', at: '10:12', read: false },
    { id: 'n2', tone: 'orange', icon: 'bolt', title: 'Express BUSA-4467 jalan', msg: 'Didahulukan di M-03, ETA 15:20', at: '09:51', read: false },
    { id: 'n3', tone: 'red', icon: 'alert', title: 'QC menandai 1 item', msg: 'Noda kopi BUSA-4463 masuk treatment ulang', at: '09:33', read: false },
    { id: 'n4', tone: 'lilac', icon: 'spark', title: 'Cashback 5% masuk', msg: rp(12400) + ' kembali ke Dompet BUSA', at: 'Kemarin', read: true },
  ],
  chat: SEED.chat.map((c) => ({ ...c })),
  cart: null,
  seq: 4472,
  events: [],
  svc: {},
  sub: SEED.persona.member,
  auth: { token: null, user: null, loggedIn: false },
  apiOn: false,
  me: null,
  persona: Object.assign({}, SEED.persona),
  users: [],
  usersLoaded: false,
  usersLoading: false,
  qris: null,
  proofs: {},
  revenue: null,
  mix: null,
  activity: null,
  staff: null,
  tiers: null,
  areas: null,
};

S.cart = newCart();

/* ── AUTH ─────────────────────────────────────────────── */

const AUTH_KEY = 'busa.auth.v1';

function saveAuth() {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify({ token: S.auth.token, user: S.auth.user })); } catch {}
}

function loadAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.token && d.user) { S.auth = { token: d.token, user: d.user, loggedIn: true }; }
  } catch {}
}

function clearAuth() {
  S.auth = { token: null, user: null, loggedIn: false };
  try { localStorage.removeItem(AUTH_KEY); } catch {}
}

function isAuthed() { return S.auth.loggedIn && S.auth.token; }
function isCustomerAuthed() { return isAuthed() && S.auth.user.role === 'customer'; }
function isAdminAuthed() { return isAuthed() && (S.auth.user.role === 'admin' || S.auth.user.role === 'staff'); }

async function doLogin(login, password) {
  const res = await fetch(apiOrigin() + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'Login gagal.');
  S.auth = { token: data.token, user: data.user, loggedIn: true };
  saveAuth();
  await API.bootstrap();
  return data;
}

function doLogout() {
  if (isAuthed() && S.auth.token) {
    fetch(apiOrigin() + '/api/auth/logout', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.auth.token },
      body: '{}',
    }).catch(() => {});
  }
  API.stop();
  clearAuth();
  go('landing', 'landing');
  toast({ title: 'Keluar berhasil', msg: 'Sesi Anda telah diakhiri', tone: 'lilac', icon: 'lock', ms: 2500 });
}

function authHeaders() {
  return isAuthed() ? { Authorization: 'Bearer ' + S.auth.token } : {};
}

function newCart() {
  return {
    step: 0, items: {}, addons: {}, pieces: { kering: 0 },
    weight: 5, mode: 'pickup', addr: (S.addresses[0] || {}).id, date: todayISO(), slot: SLOTS[2],
    code: '', notes: '', pay: 'qris', protect: false, created: null,
  };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      theme: S.theme, portal: S.portal, orders: S.orders, machines: S.machines, wallet: S.wallet, stamps: S.stamps,
      addresses: S.addresses, settings: S.settings, notifs: S.notifs, chat: S.chat, route: S.route, seq: S.seq,
      svc: S.svc, sub: S.sub, events: S.events,
    }));
  } catch (e) { /* storage penuh / mode privat */ }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object') return;
    /* Data lama/rusak tidak boleh mematikan boot: salin hanya bidang yang
       bentuknya valid, sisanya biarkan dari seed. */
    const clean = {};
    ['orders', 'machines', 'addresses', 'notifs', 'chat', 'events'].forEach((k) => {
      if (Array.isArray(d[k])) clean[k] = d[k];
    });
    if (d.wallet && typeof d.wallet === 'object' && Array.isArray(d.wallet.txns)) {
      clean.wallet = d.wallet;
      if (typeof d.wallet.balance !== 'number') clean.wallet.balance = 0;
    }
    if (d.settings && typeof d.settings === 'object') clean.settings = d.settings;
    if (d.theme === 'bone' || d.theme === 'night') clean.theme = d.theme;
    if (typeof d.stamps === 'number') clean.stamps = d.stamps;
    if (typeof d.seq === 'number') clean.seq = d.seq;
    if (d.svc && typeof d.svc === 'object') clean.svc = d.svc;
    if (d.sub && typeof d.sub === 'object') clean.sub = d.sub;
    Object.assign(S, clean);
    S.cart = newCart();
  } catch (e) { /* data rusak, pakai seed */ }
}

function kgTotal() {
  return CATALOG.filter((c) => c.unit === 'kg').reduce((a, s) => a + (S.cart.items[s.id] || 0), 0);
}
function unitTotal() {
  return CATALOG.filter((c) => c.unit !== 'kg').reduce((a, s) => a + (S.cart.items[s.id] || 0), 0);
}

function calc() {
  const lines = [];
  let sub = 0;
  CATALOG.forEach((sv) => {
    const q = S.cart.items[sv.id] || 0;
    if (q > 0) { const amt = sv.price * q; sub += amt; lines.push({ n: sv.name, q, unit: sv.unit, amt }); }
  });
  ADDONS.forEach((a) => {
    if (S.cart.addons[a.id]) {
      const amt = a.kind === 'kg' ? Math.round(a.price * Math.max(1, kgTotal())) : a.price;
      sub += amt; lines.push({ n: a.name, q: 1, unit: a.kind === 'kg' ? 'kg' : 'paket', amt });
    }
  });
  const ship = S.cart.mode === 'delivery' ? (sub >= 80000 ? 0 : 12000) : 0;
  const promo = S.promos.find((p) => p.code === S.cart.code.toUpperCase());
  let disc = 0;
  if (promo) disc = promo.kind === 'pct' ? Math.min(Math.round(sub * promo.value / 100), promo.cap) : Math.min(promo.value, promo.cap);
  const prot = S.cart.protect ? Math.round(sub * 0.02) : 0;
  const total = Math.max(0, sub - disc + ship + prot);
  return { lines, sub, ship, disc, prot, total, promo };
}

function distributeWeight(w) {
  const kgSvc = CATALOG.filter((c) => c.unit === 'kg' && S.cart.items[c.id] > 0);
  if (!kgSvc.length) return;
  const each = Math.max(0.5, Math.round((w / kgSvc.length) * 2) / 2);
  let left = w;
  kgSvc.forEach((c, i) => {
    const q = i === kgSvc.length - 1 ? Math.max(0.5, Math.round(left * 2) / 2) : each;
    S.cart.items[c.id] = q; left -= q;
  });
  S.cart.weight = kgTotal();
}

function etaFor(stage, priority) {
  const rest = STAGES.length - 1 - stage;
  const hrs = priority === 'express' ? rest * 0.6 : rest * 6.5;
  const d = new Date(Date.now() + hrs * 3600000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][d.getDay()]}`;
}

/* ── QRIS PEMBAYARAN ──────────────────────────────────── */

/** Gambar QRIS aktif: unggahan admin dari server, atau gambar bawaan. */
function qrisSrc() {
  return (S.qris && S.qris.dataUrl) ? S.qris.dataUrl : './img/qris.png';
}
function qrisIsCustom() {
  return Boolean(S.qris && S.qris.dataUrl);
}
function qrisDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Unduh gambar QRIS yang sedang tampil (unggahan admin atau fallback bawaan). */
function qrisDownload() {
  const img = qs('#qris-img');
  const src = qrisIsCustom() ? S.qris.dataUrl : (img ? (img.currentSrc || img.src) : './img/qris.svg');
  if (!src) return;
  const m = /^data:image\/(png|jpe?g|webp|gif)/.exec(src);
  const ext = /svg/i.test(src) ? 'svg' : m ? m[1].replace('jpeg', 'jpg') : 'png';
  const a = document.createElement('a');
  a.href = src;
  a.download = 'qris-busa.' + ext;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast({ title: 'QRIS diunduh', msg: 'Pindai dari galeri aplikasi bank/e-wallet Anda.', tone: 'mint', icon: 'download' });
}

/* ── GAMBAR LOKAL (QRIS & bukti bayar) ────────────────── */

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('File tidak bisa dibaca.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('File bukan gambar yang bisa dibaca.'));
    img.src = src;
  });
}

function dataUrlBytes(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((b64.length * 3) / 4);
}

/**
 * Siapkan gambar untuk diunggah: pakai apa adanya bila sudah kecil & format
 * standar; selain itu perkecil/konversi lewat canvas agar screenshot besar
 * atau format lain (BMP, AVIF, …) tetap bisa dipakai.
 */
async function prepareImageDataUrl(file, maxBytes = IMAGE_MAX_BYTES) {
  const source = await readFileAsDataURL(file);
  const supported = /^image\/(png|jpe?g|webp|gif)$/.test(file.type || '');
  if (supported && file.size <= maxBytes) return source;

  const img = await loadImageElement(source);
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) throw new Error('Ukuran gambar tidak terbaca.');
  const scale = Math.min(1, 1400 / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);

  let out = canvas.toDataURL('image/png');
  if (dataUrlBytes(out) > maxBytes) out = canvas.toDataURL('image/jpeg', 0.92);
  if (dataUrlBytes(out) > maxBytes) throw new Error('Gambar terlalu besar bahkan setelah dikompres.');
  return out;
}

/** Kirim bukti bayar QRIS dari pelanggan — kasir yang memutuskan lunas. */
async function submitProof(code, file) {
  const o = S.orders.find((x) => x.code === code);
  if (!o) return;
  if (!/^image\//.test(file.type || '')) {
    toast({ title: 'Bukan berkas gambar', msg: 'Pilih screenshot bukti transfer.', tone: 'red', icon: 'alert' });
    return;
  }
  try {
    const dataUrl = await prepareImageDataUrl(file);
    if (typeof API !== 'undefined' && API.on && isCustomerAuthed()) {
      await API.proof(code, dataUrl);
    } else {
      o.proof = dataUrl; o.hasProof = true; save();
    }
    S.proofs[code] = dataUrl;
    const fresh = S.orders.find((x) => x.code === code) || o;
    if (qs('#drawerRoot.on')) orderDrawer(fresh);
    render();
    toast({ title: 'Bukti terkirim', msg: 'Menunggu verifikasi kasir — status berubah setelah dicek.', tone: 'mint', icon: 'upload' });
  } catch (err) { apiToastErr(err, 'Bukti gagal diunggah'); }
}

/* ── SHELL ─────────────────────────────────────────────── */

function renderNav() {
  const nav = navFor(S.portal);
  const loggedIn = isAuthed();
  const user = S.auth.user;

  let navHTML = `<div class="rail-portal"><b>${esc(PORTALS[S.portal].label)}</b></div>`;
  if (loggedIn && (S.portal === 'c' || S.portal === 'a')) {
    navHTML += nav.map((n) => `<button class="nav-i ${S.route === n.id ? 'on' : ''}" data-act="go" data-portal="${S.portal}" data-route="${n.id}" title="${n.label}" aria-label="${n.label}">
      <span class="nav-dot"></span>${icon(n.icon)}<em>${n.label}</em>
    </button>`).join('');
    navHTML += `<div class="nav-auth-box"><button class="nav-i" data-act="logout" title="Keluar" aria-label="Keluar">
      <span class="nav-dot"></span>${icon('lock')}<em>Keluar</em>
    </button></div>`;
  } else if (S.portal === 'c') {
    navHTML += `<button class="nav-i on" data-act="go" data-portal="c" data-route="loginC" title="Masuk" aria-label="Masuk pelanggan">
      <span class="nav-dot"></span>${icon('user')}<em>Masuk</em>
    </button>`;
  } else if (S.portal === 'a') {
    navHTML += `<button class="nav-i on" data-act="go" data-portal="a" data-route="loginA" title="Masuk" aria-label="Masuk admin">
      <span class="nav-dot"></span>${icon('lock')}<em>Masuk</em>
    </button>`;
  }
  qs('#nav').innerHTML = navHTML;

  qs('#mnav').innerHTML = nav.map((n) => `<button class="mnav-i ${S.route === n.id ? 'on' : ''}" data-act="go" data-portal="${S.portal}" data-route="${n.id}" aria-label="${n.label}">${icon(n.icon)}<em>${n.label}</em></button>`).join('');
  qs('#portal-switch').innerHTML = Object.keys(PORTALS).map((k) => `<button class="ps-i ${S.portal === k ? 'on' : ''}" data-act="portal" data-v="${k}">${icon(k === 'landing' ? 'store' : k === 'c' ? 'user' : 'sliders')}<b>${PORTALS[k].label}</b></button>`).join('');

  const avatar = qs('.avatar');
  if (avatar) {
    if (loggedIn) {
      avatar.textContent = initials(user.name);
      avatar.dataset.act = 'go';
      avatar.dataset.route = 'setelan';
      avatar.dataset.portal = S.portal === 'a' ? 'a' : 'c';
      delete avatar.dataset.v;
      avatar.setAttribute('aria-label', 'Profil: ' + user.name);
      avatar.title = 'Profil (' + user.name + ')';
    } else {
      avatar.textContent = '?';
      avatar.dataset.act = 'portal';
      avatar.dataset.v = S.portal === 'a' ? 'a' : 'c';
      delete avatar.dataset.route;
      delete avatar.dataset.portal;
      avatar.setAttribute('aria-label', 'Masuk');
      avatar.title = 'Masuk';
    }
  }
}

let lastTickerHTML = '';
function renderTicker() {
  const live = S.orders.filter((o) => o.stage < 8);
  const items = [];
  S.machines.forEach((m) => {
    if (m.state !== 'idle') items.push(`<span class="tk"><b>${m.id}</b> ${esc(STAGES[m.stage].label)} <i class="led ${m.state}"></i> ${clockStr(m.left)} <small>${Math.round(m.temp)}°C</small></span>`);
  });
  live.slice(0, 5).forEach((o) => items.push(`<span class="tk"><b>${esc(o.code)}</b> ${esc(STAGES[o.stage].label)} <small>${esc(o.customer)}</small></span>`));
  const row = items.join('<span class="tk-sep">•</span>');
  const html = row + '<span class="tk-sep">•</span>' + row;
  if (html === lastTickerHTML) return;
  lastTickerHTML = html;
  qs('#ticker-track').innerHTML = html;
}

const VIEWS = {};

function go(route, portal) {
  if (!VIEWS[route]) { route = 'landing'; portal = 'landing'; }
  const p = portal || (route === 'landing' ? 'landing' : portalOf(route));
  const publicRoutes = ['loginC', 'loginA', 'register', 'forgot', 'resetPassword'];
  if (publicRoutes.includes(route)) {
    const lp = route === 'loginA' ? 'a' : 'c';
    S.portal = lp; S.route = route; location.hash = routeHash(lp, route); qs('#view').scrollTop = 0; render(); return;
  }
  if (route === 'changePassword' && !isAuthed()) { go('loginC'); return; }
  if (p === 'c' && !isCustomerAuthed()) { S.portal = 'c'; S.route = 'loginC'; location.hash = '#/c/loginC'; qs('#view').scrollTop = 0; render(); return; }
  if (p === 'a' && !isAdminAuthed()) { S.portal = 'a'; S.route = 'loginA'; location.hash = '#/a/loginA'; qs('#view').scrollTop = 0; render(); return; }
  S.portal = p;
  S.route = route;
  location.hash = routeHash(p, route);
  qs('#view').scrollTop = 0;
  window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
  render();
  if (typeof API !== 'undefined' && API.on && (route === 'floor' || route === 'laporan')) {
    API.refreshDashboard().then((changed) => { if (changed && S.route === route) render(); }).catch(() => {});
  }
  if (route === 'landing' && typeof API !== 'undefined' && API.loadLive) API.loadLive();
}

function switchPortal(p) {
  if (!PORTALS[p]) return;
  if (p === 'c' && !isCustomerAuthed()) { go('loginC', 'c'); return; }
  if (p === 'a' && !isAdminAuthed()) { go('loginA', 'a'); return; }
  const keep = PORTALS[p].nav.some((n) => n.id === S.route) ? S.route : homeOf(p);
  go(keep, p);
  toast({ title: 'Panel ' + PORTALS[p].label, msg: PORTALS[p].nav.length ? PORTALS[p].nav.length + ' bagian tersedia' : 'Halaman publik', icon: p === 'a' ? 'sliders' : p === 'c' ? 'user' : 'store', tone: 'lilac', ms: 2000 });
}

function render(animate = true) {
  document.body.dataset.portal = S.portal;
  const meta = VIEWS[S.route] || VIEWS.landing;
  const title = typeof meta.title === 'function' ? meta.title() : meta.title;
  const kicker = typeof meta.kicker === 'function' ? meta.kicker() : meta.kicker;
  qs('#route-title').textContent = title;
  qs('#route-kicker').textContent = kicker;
  document.title = title + ' — BUSA';
  qs('#view').innerHTML = meta.render();
  renderNav();
  renderTicker();
  paintBell();
  const useGsap = typeof MOTION !== 'undefined' && MOTION.ok;
  if (!useGsap) {
    if (animate) initReveal(qs('#view'));
    else qsa('[data-reveal]', qs('#view')).forEach((el) => el.classList.add('in'));
  }
  if (meta.wire) meta.wire();
  if (useGsap) MOTION.enter(S.portal, S.route, animate);
  document.body.dataset.route = S.route;
  if (typeof API !== 'undefined' && API.paintConn) API.paintConn();
}

/* ── VIEW: LOGIN PELANGGAN ────────────────────────────── */

VIEWS.loginC = {
  title: 'Masuk Pelanggan', kicker: 'Nomor telepon & password',
  render() {
    return `
    <section class="login-wrap" data-reveal>
      <div class="login-card t-customer">
        <div class="login-head">
          ${icon('user', 'big-ico')}
          <h2 class="display xl">Portal Pelanggan</h2>
          <p class="lede sm">Masuk dengan nomor telepon yang terdaftar di BUSA.</p>
        </div>
        <form class="login-form" data-act="login-customer-form">
          <label class="field">
            <p class="mono lbl">Nomor telepon</p>
            <input class="in mono" data-act="login-c-id" value="" placeholder="0812-7781-4402" autocomplete="tel" required>
          </label>
          <label class="field">
            <p class="mono lbl">Password</p>
            <input class="in mono" data-act="login-c-pw" type="password" placeholder="Password Anda" autocomplete="current-password" required>
          </label>
          <p class="login-err mono" id="login-c-err" hidden></p>
          <button class="btn primary big" type="submit">${icon('lock')} Masuk</button>
        </form>
        <div class="login-foot">
          <p class="mono fine">Demo: <b>0812-7781-4402</b> / <b>busa1234</b></p>
          <div class="login-links">
            <button class="lnk" data-act="go" data-route="forgot">Lupa password?</button>
            <button class="lnk" data-act="go" data-route="register">Daftar akun baru</button>
            <button class="lnk" data-act="go" data-route="loginA">Masuk sebagai admin →</button>
          </div>
        </div>
      </div>
    </section>`;
  },
  wire() { const i = qs('[data-act="login-c-id"]'); if (i) i.focus(); },
};

/* ── VIEW: LOGIN ADMIN ────────────────────────────────── */

VIEWS.loginA = {
  title: 'Masuk Admin', kicker: 'Username & password',
  render() {
    return `
    <section class="login-wrap" data-reveal>
      <div class="login-card t-admin">
        <div class="login-head">
          ${icon('sliders', 'big-ico')}
          <h2 class="display xl">Portal Admin</h2>
          <p class="lede sm">Masuk dengan username staf atau admin BUSA.</p>
        </div>
        <form class="login-form" data-act="login-admin-form">
          <label class="field">
            <p class="mono lbl">Username</p>
            <input class="in mono" data-act="login-a-id" value="" placeholder="admin" autocomplete="username" required>
          </label>
          <label class="field">
            <p class="mono lbl">Password</p>
            <input class="in mono" data-act="login-a-pw" type="password" placeholder="Password Anda" autocomplete="current-password" required>
          </label>
          <p class="login-err mono" id="login-a-err" hidden></p>
          <button class="btn primary big" type="submit">${icon('lock')} Masuk</button>
        </form>
        <div class="login-foot">
          <p class="mono fine">Demo: <b>admin</b> / <b>busa1234</b> &middot; <b>dodo</b> / <b>busa1234</b></p>
          <div class="login-links">
            <button class="lnk" data-act="go" data-route="forgot">Lupa password?</button>
            <button class="lnk" data-act="go" data-route="loginC">Masuk sebagai pelanggan →</button>
          </div>
        </div>
      </div>
    </section>`;
  },
  wire() { const i = qs('[data-act="login-a-id"]'); if (i) i.focus(); },
};

/* ── VIEW: REGISTER ───────────────────────────────────── */

VIEWS.register = {
  title: 'Daftar Akun', kicker: 'Buat akun pelanggan baru',
  render() {
    return `
    <section class="login-wrap" data-reveal>
      <div class="login-card t-customer">
        <div class="login-head">
          ${icon('plus', 'big-ico')}
          <h2 class="display xl">Daftar Akun</h2>
          <p class="lede sm">Buat akun pelanggan BUSA untuk mulai memesan.</p>
        </div>
        <form class="login-form" data-act="register-form">
          <label class="field">
            <p class="mono lbl">Nama lengkap</p>
            <input class="in mono" data-act="reg-name" value="" placeholder="Nama Anda" autocomplete="name" required>
          </label>
          <label class="field">
            <p class="mono lbl">Nomor telepon</p>
            <input class="in mono" data-act="reg-phone" value="" placeholder="0812-xxxx-xxxx" autocomplete="tel" required>
          </label>
          <label class="field">
            <p class="mono lbl">Password</p>
            <input class="in mono" data-act="reg-pw" type="password" placeholder="Minimal 6 karakter" autocomplete="new-password" required minlength="6">
          </label>
          <p class="login-err mono" id="reg-err" hidden></p>
          <button class="btn primary big" type="submit">${icon('check')} Daftar</button>
        </form>
        <div class="login-foot">
          <button class="lnk" data-act="go" data-route="loginC">Sudah punya akun? Masuk →</button>
        </div>
      </div>
    </section>`;
  },
  wire() { const i = qs('[data-act="reg-name"]'); if (i) i.focus(); },
};

/* ── VIEW: FORGOT PASSWORD ────────────────────────────── */

VIEWS.forgot = {
  title: 'Lupa Password', kicker: 'Reset password akun Anda',
  render() {
    return `
    <section class="login-wrap" data-reveal>
      <div class="login-card t-customer">
        <div class="login-head">
          ${icon('key', 'big-ico')}
          <h2 class="display xl">Lupa Password</h2>
          <p class="lede sm">Masukkan username atau nomor telepon untuk reset password.</p>
        </div>
        <form class="login-form" data-act="forgot-form">
          <label class="field">
            <p class="mono lbl">Username atau nomor telepon</p>
            <input class="in mono" data-act="forgot-id" value="" placeholder="admin atau 0812-xxxx-xxxx" autocomplete="username" required>
          </label>
          <p class="login-err mono" id="forgot-err" hidden></p>
          <p class="login-ok mono" id="forgot-ok" hidden></p>
          <button class="btn primary big" type="submit">${icon('mail')} Kirim Token Reset</button>
        </form>
        <div class="login-foot">
          <button class="lnk" data-act="go" data-route="resetPassword">Sudah punya token? Reset →</button>
          <button class="lnk" data-act="go" data-route="loginC">Kembali ke login →</button>
        </div>
      </div>
    </section>`;
  },
  wire() { const i = qs('[data-act="forgot-id"]'); if (i) i.focus(); },
};

/* ── VIEW: RESET PASSWORD ─────────────────────────────── */

VIEWS.resetPassword = {
  title: 'Reset Password', kicker: 'Masukkan token & password baru',
  render() {
    return `
    <section class="login-wrap" data-reveal>
      <div class="login-card t-customer">
        <div class="login-head">
          ${icon('lock', 'big-ico')}
          <h2 class="display xl">Reset Password</h2>
          <p class="lede sm">Masukkan token reset dan password baru Anda.</p>
        </div>
        <form class="login-form" data-act="reset-form">
          <label class="field">
            <p class="mono lbl">Token reset</p>
            <input class="in mono" data-act="reset-token" value="" placeholder="Token dari email/SMS" required>
          </label>
          <label class="field">
            <p class="mono lbl">Password baru</p>
            <input class="in mono" data-act="reset-pw" type="password" placeholder="Minimal 6 karakter" autocomplete="new-password" required minlength="6">
          </label>
          <p class="login-err mono" id="reset-err" hidden></p>
          <button class="btn primary big" type="submit">${icon('check')} Reset Password</button>
        </form>
        <div class="login-foot">
          <button class="lnk" data-act="go" data-route="loginC">Kembali ke login →</button>
        </div>
      </div>
    </section>`;
  },
  wire() { const i = qs('[data-act="reset-token"]'); if (i) i.focus(); },
};

/* ── VIEW: CHANGE PASSWORD ────────────────────────────── */

VIEWS.changePassword = {
  title: 'Ganti Password', kicker: 'Ubah password akun Anda',
  render() {
    return `
    <section class="login-wrap" data-reveal>
      <div class="login-card t-customer">
        <div class="login-head">
          ${icon('lock', 'big-ico')}
          <h2 class="display xl">Ganti Password</h2>
          <p class="lede sm">Masukkan password lama dan password baru.</p>
        </div>
        <form class="login-form" data-act="change-pw-form">
          <label class="field">
            <p class="mono lbl">Password lama</p>
            <input class="in mono" data-act="cpw-old" type="password" placeholder="Password saat ini" autocomplete="current-password" required>
          </label>
          <label class="field">
            <p class="mono lbl">Password baru</p>
            <input class="in mono" data-act="cpw-new" type="password" placeholder="Minimal 6 karakter" autocomplete="new-password" required minlength="6">
          </label>
          <p class="login-err mono" id="cpw-err" hidden></p>
          <button class="btn primary big" type="submit">${icon('check')} Ganti Password</button>
        </form>
        <div class="login-foot">
          <button class="lnk" data-act="go" data-route="setelan" data-portal="${S.portal}">Kembali ke setelan →</button>
        </div>
      </div>
    </section>`;
  },
  wire() { const i = qs('[data-act="cpw-old"]'); if (i) i.focus(); },
};

/* ── VIEW: LANTAI MESIN ───────────────────────────────── */

VIEWS.floor = {
  title: 'Lantai Mesin', kicker: 'Siklus berjalan',
  render() {
    const done = S.orders.filter((o) => o.stage === 8).length;
    const proses = S.orders.filter((o) => o.stage > 0 && o.stage < 8).length;
    const siap = S.orders.filter((o) => o.stage === 7).length;
    const rev = (S.revenue && S.revenue.length) ? S.revenue : SEED.revenue;
    const feed = (S.activity && S.activity.length) ? S.activity : SEED.activity;
    const mix = (S.mix && S.mix.length) ? S.mix : SEED.mix;
    const today = rev[rev.length - 1];
    const load = S.machines.reduce((a, m) => a + m.load, 0) / S.machines.length;
    const pickups = S.orders.filter((o) => o.mode === 'pickup' && o.stage >= 6).slice(0, 4);
    const runs = S.orders.filter((o) => o.mode === 'delivery' && o.stage >= 5 && o.stage < 8).slice(0, 4);
    return `
    <section class="board-head" data-reveal>
      <div class="bh-left">
        <p class="mono kicker">${esc(todayDateLabel())} · shift pagi · operator Wulan A.</p>
        <h1 class="display huge">Enam mesin<br><span class="ink-slash">sedang berputar</span></h1>
        <p class="lede">Setiap keranjang punya wajah. Beginilah cucian Anda bergerak detik ini — bukan angka di dashboardkosong.</p>
        <div class="bh-chips">
          <span class="chip live">${icon('bolt')} ${S.machines.filter((m) => m.state === 'run' || m.state === 'hot').length} siklus aktif</span>
          <span class="chip">${icon('ruler')} ${kg(S.orders.reduce((a, o) => a + o.weight, 0))} kg di lantai</span>
          <span class="chip">${icon('star')} ${done} selesai hari ini</span>
        </div>
      </div>
      <div class="bh-right">
        <div class="stat-hero">
          <p class="mono lbl">Peredaran hari ini</p>
          <b class="num xl" data-scramble="${rp(today.v * 1000)}">${rp(today.v * 1000)}</b>
          ${areaSVG(rev.slice(-10))}
          <p class="mono fine">+18% dari rata-rata 7 hari · ${today.n} transaksi</p>
        </div>
        <div class="stat-duo">
          <div class="stat-s"><b class="num lg">${proses}</b><p class="mono lbl">Dalam proses</p></div>
          <div class="stat-s"><b class="num lg">${siap}</b><p class="mono lbl">Siap diambil</p></div>
          <div class="stat-s wide">
            <p class="mono lbl">Beban rata-rata</p>${gaugeSVG(load, 'mint')}
          </div>
        </div>
      </div>
    </section>

    <div class="tiles" data-reveal aria-hidden="true"></div>

    <section class="floor-grid" aria-label="Peta mesin">
      ${S.machines.map((m, i) => machineTile(m, i)).join('')}
    </section>

    <section class="floor-lower">
      <div class="panel flow" data-reveal>
        <header class="p-head"><h2 class="display">Antrean hari ini</h2><span class="mono note">urut waktu</span></header>
        <ul class="pick-list">
          ${pickups.map((o) => `
            <li class="pick" data-act="detail" data-code="${o.code}">
              <span class="pick-t mono">${esc(o.slot.time.split('–')[0])}</span>
              <div class="pick-b"><b>${esc(o.customer)}</b><p>${o.weight} kg · ${esc(STAGES[o.stage].label)}</p></div>
              <span class="stage-pill s-${o.stage}" data-live="order" data-id="${o.code}">${esc(STAGES[o.stage].label)}</span>
              ${icon('chev', 'chev')}
            </li>`).join('') || `<li class="empty">${icon('basket')}<p>Belum ada yang siap diambil. Semua masih di dalam drum.</p></li>`}
        </ul>
        <hr class="rule">
        <header class="p-head"><h2 class="display">Rute kurir</h2><span class="mono note">${runs.length} perjalanan</span></header>
        <ul class="run-list">
          ${runs.map((o) => `
            <li class="run" data-act="detail" data-code="${o.code}">
              ${icon('truck')}<div><b>${esc(o.courier)}</b><p>${esc(o.code)} → ${esc(o.customer)}</p></div>
              <span class="mono eta">${esc(etaFor(o.stage, o.priority))}</span>
            </li>`).join('') || `<li class="empty">${icon('truck')}<p>Kurir sedang di garasi. Belum ada rute aktif.</p></li>`}
        </ul>
      </div>

      <div class="panel feed" data-reveal>
        <header class="p-head"><h2 class="display">Aktivitas lantai</h2><span class="mono live-dot"></span></header>
        <ul class="feed-list">
          ${feed.map((a, i) => `
            <li class="fe t-${a.tone}" style="--i:${i}"><span class="fe-i">${icon(a.icon)}</span>
              <div><p>${esc(a.text)}</p><time class="mono">${esc(a.t)}</time></div></li>`).join('')}
        </ul>
        <div class="mix-box">
          <p class="mono lbl">Komposisi layanan</p>
          ${donutSVG(mix)}
          <ul class="mix-legend">${mix.map((m) => `<li><i class="sw t-${m.tone}"></i>${esc(m.label)} <b class="mono">${m.pct}%</b></li>`).join('')}</ul>
        </div>
      </div>
    </section>`;
  },
};

function machineTile(m, i) {
  const st = STAGES[m.stage];
  const tone = m.state === 'idle' ? 'muted' : m.state === 'hot' ? 'orange' : m.state === 'vent' ? 'amber' : 'blue';
  return `<article class="machine t-${tone} ${m.state}" data-act="machine" data-id="${m.id}" data-live="tile" data-tilt="7" data-tilt-lift="12" style="--i:${i}" data-reveal tabindex="0" role="button" aria-label="Mesin ${m.id}">
    <div class="mc-top"><b class="mono mid">${m.id}</b><span class="state-chip" data-live="state">${esc(m.state === 'run' ? 'berjalan' : m.state === 'hot' ? 'panas' : m.state === 'vent' ? 'venting' : 'siaga')}</span></div>
    ${drumMarkup({ rpm: Math.max(1.6, 12 - m.rpm) + 's', size: 132, state: m.state, rags: 6 + (m.load > 60 ? 3 : 0), heat: m.state === 'hot' ? 1 : 0 })}
    <p class="mc-model">${esc(m.model)}</p>
    <div class="mc-stage"><span class="stage-pill s-${m.stage}" data-live="pill">${esc(st.label)}</span><time class="mono" data-live="left">−${clockStr(m.left)}</time></div>
    <div class="meters">
      <div class="meter"><span class="mono lbl">Beban</span><div class="track"><i data-live="loadbar" style="--w:${m.load}%"></i></div><b class="mono" data-live="load">${m.load}%</b></div>
      <div class="meter"><span class="mono lbl">Suhu</span><div class="track heat"><i data-live="heatbar" style="--w:${clamp(m.temp / 140 * 100, 2, 100)}%"></i></div><b class="mono" data-live="temp">${Math.round(m.temp)}°</b></div>
    </div>
    <p class="mc-tk mono">${esc(m.ticket)}</p>
  </article>`;
}

function machineModal(m) {
  openModal(`
    <div class="m-head"><div><p class="mono kicker">${esc(m.model)}</p><h2 class="display">${m.id}</h2></div>
      ${drumMarkup({ rpm: Math.max(1.6, 12 - m.rpm) + 's', size: 88, state: m.state })}</div>
    <div class="m-grid">
      <div><p class="mono lbl">Siklus</p><b>${esc(STAGES[m.stage].label)}</b></div>
      <div><p class="mono lbl">Tersisa</p><b class="mono">${clockStr(m.left)}</b></div>
      <div><p class="mono lbl">Suhu</p><b class="mono">${m.temp}°C</b></div>
      <div><p class="mono lbl">RPM drum</p><b class="mono">${m.rpm}</b></div>
      <div><p class="mono lbl">Beban</p><b class="mono">${m.load}%</b></div>
      <div><p class="mono lbl">Pesanan</p><b class="mono">${esc(m.ticket)}</b></div>
    </div>
    <div class="m-cycle">${STAGES.map((s, i) => `<span class="cy ${i < m.stage ? 'done' : i === m.stage ? 'now' : ''}" title="${esc(s.label)}"><i style="--w:${i <= m.stage ? 100 : 0}%"></i></span>`).join('')}</div>
    <div class="m-acts">
      <button class="btn ghost" data-act="machine-toggle" data-id="${m.id}">${icon(m.state === 'idle' ? 'play' : 'pause')} ${m.state === 'idle' ? 'Jalankan siklus' : 'Jeda siklus'}</button>
      <button class="btn primary" data-act="go" data-route="pesanan">${icon('basket')} Lihat pesanan terkait</button>
    </div>`, { wide: true });
}

/* ── VIEW: ORDER BARU ─────────────────────────────────── */

const STEPS = ['Layanan', 'Detail', 'Pembayaran', 'Selesai'];

VIEWS.order = {
  title: 'Order Baru', kicker: 'Empat langkah',
  render() {
    const c = S.cart;
    if (c.step === 3) return orderSuccess();
    return `
    <div class="order-wrap">
      <div class="order-main">
        <ol class="steps">
          ${STEPS.map((s, i) => `<li class="step ${i === c.step ? 'now' : i < c.step ? 'done' : ''}" ${i < c.step ? `data-act="step" data-i="${i}"` : ''}>
            <b class="num mono">${i + 1}</b><span>${esc(s)}</span>${i < STEPS.length - 1 ? '<i class="dash"></i>' : ''}</li>`).join('')}
        </ol>
        <div class="step-body">${[orderStep0, orderStep1, orderStep2][c.step]()}</div>
        <div class="order-nav">
          ${c.step > 0 ? `<button class="btn ghost" data-act="step" data-i="${c.step - 1}">${icon('arrow', 'flip')} Kembali</button>` : '<span></span>'}
          ${c.step < 2 ? `<button class="btn primary" data-act="next">${icon('chev')} Lanjut</button>`
            : `<button class="btn primary big" data-act="submit">${icon('basket')} Buat pesanan · ${rp(calc().total)}</button>`}
        </div>
      </div>
      <aside class="receipt-col">${receiptHTML()}</aside>
    </div>`;
  },
  wire() {
    const sl = qs('#wslider');
    if (sl) sl.addEventListener('input', (e) => { distributeWeight(+e.target.value); render(); const n = qs('#wslider'); if (n) n.focus(); });
  },
};

function orderStep0() {
  const c = S.cart;
  const chosen = CATALOG.filter((s) => c.items[s.id] > 0).length;
  return `
    <h2 class="display xl">Apa yang mau dicuci?</h2>
    <p class="lede sm">Pilih satu atau lebih. Berat bisa diatur di langkah berikutnya.</p>
    <div class="svc-picker">
      ${CATALOG.filter(svcOn).map((s, i) => `
        <label class="svc t-${s.tone} ${c.items[s.id] > 0 ? 'on' : ''}" style="--i:${i}" data-tilt="5" data-tilt-lift="7">
          <input type="checkbox" hidden data-act="svc" data-id="${s.id}" ${c.items[s.id] > 0 ? 'checked' : ''}>
          <span class="svc-top">${icon(s.icon)}<b class="display">${esc(s.name)}</b></span>
          <p class="svc-desc">${esc(s.desc)}</p>
          <span class="svc-price"><b class="num">${rp(s.price)}</b><i class="mono">/${esc(s.unit)}</i></span>
          <span class="svc-meta mono">${s.hours} jam${s.unit === 'kg' ? ' · per kg' : ' · per ' + s.unit}</span>
          <span class="svc-check">${icon('check')}</span>
        </label>`).join('')}
    </div>
    ${chosen === 0 ? `<p class="hint warn">${icon('alert')} Pilih minimal satu layanan untuk lanjut.</p>` : ''}`;
}

function orderStep1() {
  const c = S.cart;
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(Date.now() + i * 86400000);
    return { iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, lbl: i === 0 ? 'Hari ini' : i === 1 ? 'Besok' : ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][d.getDay()] + ' ' + d.getDate() };
  });
  const kgSvc = CATALOG.filter((s) => s.unit === 'kg' && c.items[s.id] > 0);
  const pcsSvc = CATALOG.filter((s) => s.unit !== 'kg' && c.items[s.id] > 0);
  return `
    <h2 class="display xl">Berapa banyak, kapan diambil?</h2>
    ${kgSvc.length ? `
    <div class="weight-box">
      <div class="wb-head"><p class="mono lbl">Total berat cucian</p><b class="num xxl"><span id="wval">${kg(c.weight)}</span><i>kg</i></b></div>
      <input id="wslider" class="slider" type="range" min="1" max="40" step="0.5" value="${c.weight}" aria-label="Berat total">
      <div class="wb-scale mono"><span>1</span><span>10</span><span>20</span><span>30</span><span>40 kg</span></div>
      <div class="wb-split">${kgSvc.map((s) => `<span class="chip tiny">${esc(s.name)} <b class="mono">${kg(c.items[s.id])} kg</b></span>`).join('')}</div>
    </div>` : `<p class="hint">${icon('info', '')} Tidak ada layanan per kg — isi jumlah per ${'item'} di bawah.</p>`}

    ${pcsSvc.length ? `<div class="pcs-rows">${pcsSvc.map((s) => `
      <div class="pcs-row"><span>${icon(s.icon)}<b>${esc(s.name)}</b><i class="mono">/${esc(s.unit)}</i></span>
        <span class="stepper"><button data-act="qty" data-id="${s.id}" data-d="-1" aria-label="Kurangi">${icon('minus')}</button>
        <b class="num">${c.items[s.id]}</b>
        <button data-act="qty" data-id="${s.id}" data-d="1" aria-label="Tambah">${icon('plus')}</button></span></div>`).join('')}</div>` : ''}

    <div class="two-col">
      <div class="field">
        <p class="mono lbl">Metode</p>
        <div class="seg">
          <button class="${c.mode === 'pickup' ? 'on' : ''}" data-act="mode" data-v="pickup">${icon('hanger')} Antar-jemput</button>
          <button class="${c.mode === 'drop' ? 'on' : ''}" data-act="mode" data-v="drop">${icon('store', '')} Titip di toko</button>
        </div>
        ${c.mode === 'pickup' ? `<div class="addr-pick">${S.addresses.map((a) => `
          <label class="addr ${c.addr === a.id ? 'on' : ''}"><input type="radio" name="addr" hidden data-act="addr" data-id="${a.id}" ${c.addr === a.id ? 'checked' : ''}>
            <b>${esc(a.tag)}</b><p>${esc(a.label)}</p></label>`).join('')}</div>` : `<p class="hint">${icon('pin')} Cabang Buahbatu · Jl. Soekarno-Ha No. 44, buka 07.00–21.00.</p>`}
      </div>
      <div class="field">
        <p class="mono lbl">Tanggal ${c.mode === 'pickup' ? 'penjemputan' : 'menitipkan'}</p>
        <div class="day-chips">${days.map((d) => `<button class="dchip ${c.date === d.iso ? 'on' : ''}" data-act="date" data-v="${d.iso}">${esc(d.lbl)}</button>`).join('')}</div>
        <p class="mono lbl mt">Jam</p>
        <div class="slot-chips">${SLOTS.map((s) => `<button class="schip ${c.slot === s ? 'on' : ''}" data-act="slot" data-v="${s}">${esc(s)}</button>`).join('')}</div>
      </div>
    </div>

    <div class="addons">
      <p class="mono lbl">Tambahkan</p>
      ${ADDONS.map((a, i) => `
        <label class="addon ${c.addons[a.id] ? 'on' : ''}" style="--i:${i}">
          <input type="checkbox" hidden data-act="addon" data-id="${a.id}" ${c.addons[a.id] ? 'checked' : ''}>
          ${icon(a.icon)}<b>${esc(a.name)}</b><p class="mono">${esc(a.note)}</p>
          <span class="ap mono">${a.kind === 'kg' ? rp(a.price) + '/kg' : rp(a.price)}</span>
        </label>`).join('')}
    </div>

    <label class="field"><p class="mono lbl">Catatan untuk tim lantai</p>
      <textarea class="ta" data-act="notes" placeholder="Contoh: pisahkan baju bayi, kerah blazer jangan ditimpa…">${esc(c.notes)}</textarea></label>`;
}

function orderStep2() {
  const c = S.cart;
  const r = calc();
  return `
    <h2 class="display xl">Kode promo & bayar</h2>
    <div class="promo-row">
      <input class="in mono" data-act="promo-input" value="${esc(c.code)}" placeholder="BUSA10" aria-label="Kode promo">
      <button class="btn" data-act="promo-apply">${icon('tag')} Pakai</button>
    </div>
    <div class="promo-hints">${S.promos.map((p) => `
      <button class="promo-card t-${p.kind === 'pct' ? 'orange' : 'mint'}" data-act="promo-set" data-code="${p.code}">
        <b class="display">${esc(p.label)}</b><span class="mono">${esc(p.code)}</span><p>${esc(p.terms)}</p></button>`).join('')}</div>

    <div class="field"><p class="mono lbl">Metode pembayaran</p>
      <div class="pay-rows">
        <label class="pay ${c.pay === 'qris' ? 'on' : ''}"><input type="radio" name="pay" hidden data-act="pay" data-v="qris" ${c.pay === 'qris' ? 'checked' : ''}>
          ${icon('grid')}<div><b>QRIS / e-wallet</b><p class="mono">Pindai QR, bayar sekarang</p></div></label>
        <label class="pay ${c.pay === 'cash' ? 'on' : ''}"><input type="radio" name="pay" hidden data-act="pay" data-v="cash" ${c.pay === 'cash' ? 'checked' : ''}>
          ${icon('tag')}<div><b>Tunai</b><p class="mono">Bayar saat cucian diserahkan</p></div></label>
      </div>
      ${c.pay === 'qris' ? `
        <div class="qris-box">
          <img id="qris-img" src="${qrisSrc()}" alt="Kode QRIS BUSA" onerror="this.onerror=null;this.src='./img/qris.svg';">
          <div>
            <b class="display lg">Scan & bayar ${rp(r.total)}</b>
            <p>Buka aplikasi e-wallet atau m-banking, pindai QR di samping, lalu masukkan nominal <b>${rp(r.total)}</b>. Tunjukkan bukti pembayaran ke kurir atau kasir saat penjemputan.</p>
            ${qrisIsCustom() ? `
              <div class="qris-acts">
                <button class="btn ghost sm" data-act="qris-download">${icon('download')} Unduh QRIS</button>
                <span class="mono fine">QRIS resmi BUSA${S.qris.updatedAt ? ' · diperbarui ' + qrisDate(S.qris.updatedAt) : ''}</span>
              </div>` : `
              <p class="mono fine">QRIS resmi belum diunggah admin — tanyakan kasir bila QR ini belum berlaku.</p>`}
          </div>
        </div>` : `
        <p class="hint">${icon('tag')} Siapkan uang tunai <b>${rp(r.total)}</b> — dibayarkan saat kurir atau kasir menyerahkan cucian Anda.</p>`}
    </div>

    <label class="protect ${c.protect ? 'on' : ''}">
      <input type="checkbox" hidden data-act="protect" ${c.protect ? 'checked' : ''}>
      ${icon('shield', '')}<div><b>Proteksi cucian <span class="mono">+2%</span></b><p>Ganti hingga Rp 500.000 per item bila hilang, robek, atau luntur akibat proses kami.</p></div>
    </label>

    <div class="confirm-hint">${icon('info', '')} <span>Estimasi selesai <b>${esc(etaFor(0, c.addons.express ? 'express' : 'reguler'))}</b> · ${c.mode === 'pickup' ? 'dijemput ' + esc(c.slot) : 'titip toko'} ${esc(c.date)}</span></div>`;
}

function orderSuccess() {
  const o = S.orders.find((x) => x.code === S.cart.created) || S.orders[0]
    || { code: S.cart.created || 'BUSA-0000', stage: 0, weight: 0, mode: 'pickup', slot: { date: '—', time: '—' } };
  return `
  <div class="success" data-reveal>
    <div class="ok-drums">
      ${['run', 'run', 'run'].map((_, i) => drumMarkup({ rpm: (4 + i * 2) + 's', size: 74 - i * 8, state: 'run' })).join('')}
    </div>
    <p class="mono kicker">Pesanan tercatat di lantai</p>
    <h2 class="display hero-num" data-scramble="${esc(o.code)}">${esc(o.code)}</h2>
    <p class="lede">Simpan kode ini untuk melacak. Tim menerima ${o.weight} kg dengan mode ${o.mode === 'pickup' ? 'antar-jemput' : 'titip toko'} pada ${esc(o.slot.date)} ${esc(o.slot.time)}.</p>
    <div class="ok-tl">${timelineMarkup(o.stage, o.code)}</div>
    <div class="ok-acts">
      <button class="btn primary" data-act="go" data-route="lacak">${icon('truck')} Lacak sekarang</button>
      <button class="btn ghost" data-act="reset-cart">${icon('plus')} Buat order lagi</button>
    </div>
  </div>`;
}

function receiptHTML() {
  const r = calc();
  const c = S.cart;
  const lines = r.lines.map((l) => `<tr><td>${esc(l.n)}<i class="mono"> · ${kg(l.q)} ${esc(l.unit)}</i></td><td class="mono num">${rp(l.amt)}</td></tr>`).join('');
  return `<div class="receipt" data-reveal>
    <div class="rc-perf"></div>
    <header class="rc-top"><b class="display">BUSA</b><span class="mono">kwitansi sementara</span></header>
    ${r.lines.length ? `<table class="rc-table"><tbody>${lines}</tbody></table>`
      : `<p class="rc-empty mono">Belum ada layanan dipilih.<br>Kwitansi mengisi sendiri saat Anda mencentang.</p>`}
    <div class="rc-rows">
      <div><span class="mono">Subtotal</span><b class="mono">${rp(r.sub)}</b></div>
      ${r.disc ? `<div class="minus"><span class="mono">Promo ${esc(r.promo ? r.promo.code : '')}</span><b class="mono">−${rp(r.disc)}</b></div>` : ''}
      ${r.ship ? `<div><span class="mono">Antar-jemput</span><b class="mono">${r.ship === 0 ? 'gratis' : rp(r.ship)}</b></div>`
        : c.mode === 'delivery' ? `<div class="minus"><span class="mono">Antar-jemput</span><b class="mono">gratis</b></div>` : ''}
      ${r.prot ? `<div><span class="mono">Proteksi 2%</span><b class="mono">${rp(r.prot)}</b></div>` : ''}
    </div>
    <div class="rc-total"><span class="mono lbl">Total</span><b class="num xl">${rp(r.total)}</b></div>
    <div class="rc-stamp">${S.stamps}/7 <span class="mono">stempel · gratis 1 kg</span></div>
    <div class="rc-bar" aria-hidden="true"></div>
    <p class="mono fine">Min. 3 kg · berat final ditentukan timbangan lantai.</p>
  </div>`;
}

/* ── VIEW: PESANAN ────────────────────────────────────── */

const FILTERS = [
  { id: 'all', label: 'Semua' }, { id: 'proses', label: 'Diproses' },
  { id: 'siap', label: 'Siap' }, { id: 'kirim', label: 'Dikirim' }, { id: 'done', label: 'Selesai' },
];
let orderFilter = 'all', orderQuery = '';

function orderBucket(o) {
  if (o.stage === 8) return o.mode === 'delivery' ? 'done' : 'siap';
  if (o.stage === 7) return 'siap';
  if (o.stage === 6 && o.mode === 'delivery') return 'kirim';
  return 'proses';
}

VIEWS.pesanan = {
  title: () => (S.portal === 'c' ? 'Pesanan Saya' : 'Pesanan'),
  kicker: () => (S.portal === 'c' ? 'Keranjang & riwayat' : 'Papan kendali'),
  render() {
    const pool = visibleOrders();
    const list = pool.filter((o) => (orderFilter === 'all' || orderBucket(o) === orderFilter) &&
      (!orderQuery || (o.code + o.customer + STAGES[o.stage].label).toLowerCase().includes(orderQuery.toLowerCase())));
    const counts = { all: pool.length };
    pool.forEach((o) => { counts[orderBucket(o)] = (counts[orderBucket(o)] || 0) + 1; });
    return `
    <div class="board-top">
      <div class="filters">
        ${FILTERS.map((f) => `<button class="fchip ${orderFilter === f.id ? 'on' : ''}" data-act="filter" data-v="${f.id}">
          ${esc(f.label)}<b class="mono">${counts[f.id] || 0}</b></button>`).join('')}
      </div>
      <label class="search-inline">${icon('search')}
        <input value="${esc(orderQuery)}" data-act="query" placeholder="cari kode atau nama…" aria-label="Cari pesanan"></label>
    </div>
    ${list.length ? `<ul class="ord-list">
      ${list.map((o, i) => orderRow(o, i)).join('')}</ul>`
      : `<div class="empty-state">${drumMarkup({ rpm: '9s', size: 120, state: 'idle', rags: 4 })}
          <h2 class="display">Drum kosong</h2><p class="lede">Tidak ada pesanan pada filter ini. Coba kata kunci lain atau buat order baru.</p>
          <button class="btn primary" data-act="reset-cart">${icon('plus')} Mulai order</button></div>`}`;
  },
};

function orderRow(o, i) {
  const pct = Math.round((o.stage / (STAGES.length - 1)) * 100);
  return `<li class="ord t-${o.priority === 'express' ? 'orange' : 'blue'}" data-act="detail" data-code="${o.code}" style="--i:${i}" data-reveal>
    <div class="ord-l">
      <b class="mono tk">${esc(o.code)}</b>
      <span class="who"><i class="av">${esc(initials(o.customer))}</i><b>${esc(o.customer)}</b></span>
      <p class="meta">${kg(o.weight)} ${o.weight >= 1 ? 'kg' : 'unit'} · ${esc(o.items.map((x) => (CATALOG.find((c) => c.id === x.id) || {}).name).filter(Boolean).join(', '))}</p>
    </div>
    <div class="ord-m">
      <div class="prog"><i data-live="prog" data-id="${o.code}" style="--w:${pct}%"></i><b class="mono" data-live="step" data-id="${o.code}">${o.stage + 1}/9</b></div>
      <span class="stage-pill s-${o.stage}" data-live="order" data-id="${o.code}">${esc(STAGES[o.stage].label)}</span>
      <p class="meta mono">${esc(o.created)} · ${esc(o.machine)} ${o.courier !== '—' ? '· ' + esc(o.courier) : ''}</p>
    </div>
    <div class="ord-r">
      <b class="num">${rp(o.total)}</b>
      <span class="mono tiny">${esc(o.mode === 'pickup' ? 'antar-jemput' : 'titip toko')} · ${esc(o.slot.time)}</span>
      <span class="go">${icon('chev')}</span>
    </div>
  </li>`;
}

function orderDrawer(o) {
  /* Drawer ini dipakai bersama admin & pelanggan: aksi lantai (majukan,
     ambil, label) hanya untuk staf/admin. Pelanggan hanya boleh membatalkan
     pesanannya sendiri selama belum masuk lantai — sama seperti aturan server. */
  const staff = isAdminAuthed();
  const customer = isCustomerAuthed();
  const acts = [];
  if (staff) {
    if (o.payStatus && o.payStatus !== 'lunas') {
      acts.push(`<button class="btn" data-act="pay-mark" data-code="${o.code}">${icon('wallet')} Tandai lunas</button>`);
    }
    acts.push(o.stage < 8
      ? `<button class="btn primary" data-act="advance" data-code="${o.code}">${icon('bolt')} Majukan siklus</button>`
      : `<button class="btn" data-act="collect" data-code="${o.code}">${icon('check')} Tandai diambil</button>`);
    acts.push(`<button class="btn ghost" data-act="label" data-code="${o.code}">${icon('tag')} Cetak label</button>`);
  }
  if (staff ? o.stage < 8 : o.stage === 0) {
    acts.push(`<button class="btn danger" data-act="cancel" data-code="${o.code}">${icon('x')} Batalkan</button>`);
  }
  const payLabel = o.payStatus === 'lunas' ? 'Lunas' : o.hasProof ? 'Menunggu verifikasi' : 'Belum lunas';
  const canProve = customer && o.pay === 'qris' && o.payStatus !== 'lunas' && !o.cancelled;
  openDrawer(`
    <header class="dr-head"><div><p class="mono kicker">${esc(o.created)}</p><h2 class="display" data-scramble="${esc(o.code)}">${esc(o.code)}</h2></div>
      <button class="btn-icon" data-act="drawer-close" aria-label="Tutup">${icon('x')}</button></header>
    <div class="dr-body">
      <div class="dr-drum">${drumMarkup({ rpm: (o.stage >= 7 ? 9 : 3.4) + 's', size: 104, state: o.stage >= 7 ? 'vent' : 'run' })}
        <div><b class="display lg">${esc(STAGES[o.stage].label)}</b><p class="mono">estimasi ${esc(etaFor(o.stage, o.priority))}</p></div></div>
      <div class="kv">
        <div><p class="mono lbl">Pelanggan</p><b>${esc(o.customer)}</b><p class="mono fine">${esc(o.phone)}</p></div>
        <div><p class="mono lbl">Berat</p><b>${kg(o.weight)} kg</b></div>
        <div><p class="mono lbl">Mesin</p><b class="mono">${esc(o.machine)}</b></div>
        <div><p class="mono lbl">Prioritas</p><b>${esc(o.priority)}</b></div>
        <div><p class="mono lbl">Jadwal</p><b>${esc(o.slot.date)}</b><p class="mono fine">${esc(o.slot.time)}</p></div>
        <div><p class="mono lbl">Kurir</p><b>${esc(o.courier)}</b></div>
        <div><p class="mono lbl">Pembayaran</p><b>${payLabel}</b><p class="mono fine">${esc(o.pay === 'wallet' ? 'dompet' : o.pay || '—')}</p></div>
      </div>
      ${canProve ? `
        <div class="proof-box">
          <b class="display">${o.hasProof ? icon('clock') + ' Menunggu verifikasi kasir' : icon('grid') + ' Bayar, lalu unggah bukti'}</b>
          <p>${o.hasProof
            ? 'Bukti bayar sudah terkirim untuk tagihan ' + rp(o.total) + '. Kasir menandai lunas setelah memeriksa.'
            : 'Pindai QRIS di langkah Pembayaran, lalu unggah screenshot bukti transfer di sini.'}</p>
          ${o.hasProof ? '' : `<button class="btn primary sm" data-act="proof-pick" data-code="${o.code}">${icon('upload')} Unggah bukti bayar</button>`}
        </div>` : ''}
      ${staff && o.hasProof ? `
        <div class="proof-box">
          <b class="display">${icon('eye')} Ada bukti bayar</b>
          <p>Pelanggan mengirim bukti untuk tagihan ${rp(o.total)} — periksa sebelum menandai lunas.</p>
          <button class="btn ghost sm" data-act="proof-view" data-code="${o.code}">${icon('eye')} Lihat bukti bayar</button>
        </div>` : ''}
      ${o.notes ? `<div class="note-box">${icon('mail')}<p>${esc(o.notes)}</p></div>` : ''}
      <p class="mono lbl mt">Riwayat siklus</p>
      ${timelineMarkup(o.stage, o.code)}
      <div class="dr-total"><span class="mono">Ditagih</span><b class="num lg">${rp(o.total)}</b></div>
    </div>
    ${acts.length ? `<footer class="dr-acts">${acts.join('')}</footer>` : ''}`);
}

/* ── VIEW: LACAK ──────────────────────────────────────── */

let trackCode = '', trackErr = false;

VIEWS.lacak = {
  title: 'Lacak', kicker: 'Satu kode, semua jawaban',
  render() {
    const o = trackCode ? visibleOrders().find((x) => x.code.toUpperCase() === trackCode.toUpperCase()) : null;
    if (trackCode && !o) {
      return `<div class="empty-state">${icon('search', 'big-ico')}<h2 class="display">Kode tidak ditemukan</h2>
        <p class="lede">“${esc(trackCode)}” ${S.portal === 'c' ? 'bukan bagian dari pesanan Anda' : 'tidak terdaftar'}. Cek kembali — format kami BUSA-0000.</p>
        <div class="try-row">${visibleOrders().slice(0, 3).map((x) => `<button class="chip mono" data-act="try" data-code="${x.code}">${x.code}</button>`).join('')}</div></div>`;
    }
    if (!o) {
      return `
      <section class="track-lead" data-reveal>
        <p class="mono kicker">Tanya apa pun soal cucian yang sedang jalan</p>
        <h2 class="display hero">Di mana kemeja saya?</h2>
        <form class="track-form" data-act="track-form">
          <input class="in big mono" data-act="track-input" value="${esc(trackCode)}" placeholder="BUSA-4470" aria-label="Kode pesanan">
          <button class="btn primary big" type="submit">${icon('search')} Lacak</button>
        </form>
        <div class="try-row"><span class="mono lbl">Punya pesanan aktif:</span>
          ${visibleOrders().filter((x) => x.stage < 8).slice(0, 4).map((x) => `<button class="chip mono" data-act="try" data-code="${x.code}">${x.code}</button>`).join('')}</div>
      </section>
      <section class="how">
        ${STAGES.slice(0, 9).map((s, i) => `<article class="how-i" style="--i:${i}" data-reveal>
          <b class="num big-display">${pad(i + 1)}</b>${icon(s.icon)}<b class="hl">${esc(s.label)}</b><p>${esc(s.note)}</p></article>`).join('')}
      </section>`;
    }
    return `
    <section class="track-live" data-reveal>
      <div class="tl-head">
        <div class="tl-drum">${drumMarkup({ rpm: (o.stage >= 7 ? 10 : 3) + 's', size: 190, state: o.stage >= 7 ? 'vent' : 'run', rags: 8 })}
          <span class="tl-ring" style="--p:${(o.stage / 8) * 100}%"></span></div>
        <div class="tl-info">
          <p class="mono kicker">${esc(o.created)} · ${esc(o.priority)}</p>
          <h2 class="display hero-num" data-scramble="${esc(o.code)}">${esc(o.code)}</h2>
          <p class="lede">${esc(o.customer)} · ${kg(o.weight)} kg · ${o.mode === 'pickup' ? 'antar-jemput' : 'titip toko'}</p>
          <div class="tl-meta">
            <span class="chip live">${icon('drum')} ${esc(STAGES[o.stage].label)}</span>
            <span class="chip">${icon('clock')} Estimasi ${esc(etaFor(o.stage, o.priority))}</span>
            <span class="chip">${icon('grid')} ${esc(o.machine)}</span>
            ${o.courier !== '—' ? `<span class="chip">${icon('truck')} ${esc(o.courier)}</span>` : ''}
          </div>
          <div class="tl-acts">
            ${isAdminAuthed() && o.stage < 8 ? `<button class="btn primary" data-act="advance" data-code="${o.code}">${icon('bolt')} Simulasikan siklus</button>` : ''}
            <button class="btn ghost" data-act="go" data-route="pesanan">${icon('basket')} Semua pesanan</button>
          </div>
        </div>
      </div>
      <div class="tl-strip">${STAGES.map((s, i) => `
        <div class="tli ${i < o.stage ? 'done' : i === o.stage ? 'now' : ''}" style="--i:${i}">
          <span class="tli-dot">${icon(i === o.stage ? 'drum' : s.icon)}</span><b>${esc(s.label)}</b></div>`).join('')}</div>
      <div class="tl-cols">
        <div class="panel">${timelineMarkup(o.stage, o.code)}</div>
        <div class="panel">
          <header class="p-head"><h3 class="display">Foto terakhir di lantai</h3></header>
          <figure class="kb"><img src="https://picsum.photos/seed/${esc(o.code)}-qc/900/620" alt="Kondisi cucian terakhir"><figcaption class="mono">${esc(STAGES[o.stage].label)} · ${esc(o.code)}</figcaption></figure>
          <div class="kv single"><div><p class="mono lbl">Catatan</p><p>${esc(o.notes || 'Tidak ada catatan khusus.')}</p></div></div>
        </div>
      </div>
    </section>`;
  },
  wire() { const i = qs('[data-act="track-input"]'); if (i) i.focus(); },
};

/* ── VIEW: HARGA ──────────────────────────────────────── */

VIEWS.harga = {
  title: 'Layanan & Harga', kicker: 'Tanpa biaya tersembunyi',
  render() {
    return `
    <section class="price-lead" data-reveal>
      <div><p class="mono kicker">Daftar harga</p><h2 class="display hero">Dibayar per kilogram,<br>ditimbang di depan Anda.</h2>
        <p class="lede">Tidak ada kejutan di akhir. Semua tambahan ditulis eksplisit, dan berat final selalu bisa Anda tuntut ulang di kasir.</p></div>
      <div class="est">
        <p class="mono lbl">Estimator cepat</p>
        <div class="est-in"><input id="estkg" class="in mono" type="number" min="1" max="80" value="7" aria-label="Berat"><span>kg</span></div>
        <ul class="est-rows" id="estrows"></ul>
      </div>
    </section>
    <div class="tiles" data-reveal aria-hidden="true"></div>
    <section class="price-list">
      ${CATALOG.filter(svcOn).map((s, i) => `
        <article class="pr ${i % 3 === 1 ? 'offset' : ''}" style="--i:${i}" data-reveal>
          <b class="pr-n num big-display">${pad(i + 1)}</b>
          <div class="pr-b">
            <h3 class="display lg">${icon(s.icon)} ${esc(s.name)}</h3>
            <p class="svc-desc">${esc(s.desc)}</p>
            <ul class="inc">${s.includes.map((x) => `<li>${icon('check')}${esc(x)}</li>`).join('')}</ul>
            <span class="mono chip">cycle ${s.hours} jam</span>
          </div>
          <div class="pr-p"><b class="num xl">${rp(s.price)}</b><i class="mono">per ${esc(s.unit)}</i>
            <button class="btn sm" data-act="pick-svc" data-id="${s.id}">${icon('plus')} Pesan</button></div>
        </article>`).join('')}
    </section>
    <section class="add-grid">
      <div class="panel" data-reveal>
        <header class="p-head"><h3 class="display">Tambahan</h3><span class="mono note">bisa digabung</span></header>
        <ul class="add-list">${ADDONS.map((a) => `<li>${icon(a.icon)}<div><b>${esc(a.name)}</b><p class="mono fine">${esc(a.note)}</p></div><span class="mono num">${rp(a.price)}</span><i class="mono unit">${a.kind === 'kg' ? '/kg' : '/paket'}</i></li>`).join('')}</ul>
      </div>
      <div class="panel" data-reveal>
        <header class="p-head"><h3 class="display">Simbol perawatan</h3><span class="mono note">kami patuhi</span></header>
        <table class="care">
          <tbody>
            ${[['◻ Cuci mesin 30–40°', 'Kapas, poli, denim'], '△|Cuci kering solvent|Jas, wool, sutra', '⊘ Jangan diperas|Bordir, ruksak', '▤ Setrika uap ≤160°|Poplin, linen', '⊹ Kering tumbling rendah|Handuk micro', '⊘2 Tidak ada pemutih|Semua warna gelap'].map((r, i) => {
  const p = typeof r === 'string' ? r.split('|') : r;
  return `<tr style="--i:${i}" data-reveal><td class="mono sym">${esc(p[0])}</td><td>${esc(p[1])}</td></tr>`;
}).join('')}
          </tbody>
        </table>
      </div>
    </section>
    <section class="faq" data-reveal>
      <h3 class="display xl">Pertanyaan yang sering masuk</h3>
      ${SEED.faq.map((f, i) => `<details class="q" style="--i:${i}" ${i === 0 ? 'open' : ''}><summary><b class="display">${esc(f.q)}</b><span class="q-i">${icon('plus')}</span></summary><p>${esc(f.a)}</p></details>`).join('')}
    </section>`;
  },
  wire() { paintEst(); },
};

function paintEst() {
  const box = qs('#estrows'); if (!box) return;
  const w = clamp(+qs('#estkg').value || 0, 1, 80);
  box.innerHTML = CATALOG.filter((s) => s.unit === 'kg').map((s) => `
    <li><span>${esc(s.name)}</span><b class="num">${rp(s.price * w)}</b></li>`).join('') +
    `<li class="sum"><span>+ tambahan & antar-jemput</span><b class="mono">tergantung pilihan</b></li>`;
}

/* ── VIEW: DOMPET ─────────────────────────────────────── */

VIEWS.statistik = {
  title: 'Statistik', kicker: 'Pesanan & pengeluaran Anda',
  render() {
    const mine = visibleOrders();
    const count = mine.length;
    const spend = mine.reduce((a, o) => a + (o.total || 0), 0);
    const kgSum = mine.reduce((a, o) => a + (o.weight || 0), 0);
    const avg = count ? spend / count : 0;
    return `
    <section class="cust-stats" data-reveal>
      <div class="cst t-blue"><p class="mono lbl">Total pesanan</p><b class="num xl">${count}</b><p class="mono fine">sejak bergabung</p></div>
      <div class="cst t-orange"><p class="mono lbl">Total pengeluaran</p><b class="num xl">${rp(spend)}</b><p class="mono fine">semua pesanan Anda</p></div>
      <div class="cst t-mint"><p class="mono lbl">Total berat</p><b class="num xl">${kg(kgSum)} kg</b><p class="mono fine">dicuci & disetrika</p></div>
      <div class="cst t-lilac"><p class="mono lbl">Rata-rata / pesanan</p><b class="num xl">${rp(avg)}</b><p class="mono fine">${count ? kg(kgSum / count) + ' kg per pesanan' : 'belum ada pesanan'}</p></div>
    </section>
    <section class="panel stamps mt" data-reveal>
      <header class="p-head"><h3 class="display">Kartu stempel</h3><span class="mono note">${S.stamps}/7</span></header>
      <div class="stamp-grid">
        ${Array.from({ length: 7 }).map((_, i) => `<div class="stm ${i < S.stamps ? 'on' : ''}">${icon('drum')}<b class="mono">${pad(i + 1)}</b></div>`).join('')}
      </div>
      <p class="lede sm">Tujuh kali order, satu kilogram cuci gratis. Stempel bertambah otomatis saat pesanan berstatus Selesai.</p>
      <div class="ref">
        <p class="mono lbl">Kode referralsaya</p>
        <div class="ref-row"><b class="mono">BUSA-RANIA-7742</b><button class="btn-icon" data-act="copy" data-v="BUSA-RANIA-7742" aria-label="Salin">${icon('copy')}</button></div>
        <p class="mono fine">Teman mendapat Rp 25.000, Anda dapat 1 stempel.</p>
      </div>
    </section>
    <section class="promo-strip" data-reveal>
      <h3 class="display">Promo aktif</h3>
      <div class="promo-cards">${S.promos.map((p, i) => `
        <button class="promo-card big t-${p.kind === 'pct' ? 'orange' : 'mint'}" style="--i:${i}" data-act="promo-set" data-code="${p.code}">
          <span class="pc-cut"></span><b class="display">${esc(p.label)}</b><span class="mono">kode ${esc(p.code)}</span>
          <p>${esc(p.terms)}</p><i class="mono">${p.kind === 'pct' ? p.value + '%' : rp(p.value)}</i></button>`).join('')}</div>
    </section>`;
  },
};

/* ── VIEW: LAPORAN ────────────────────────────────────── */

VIEWS.laporan = {
  title: 'Laporan', kicker: 'Operasional & uang',
  render() {
    const n = S.settings.range || 14;
    const rev = ((S.revenue && S.revenue.length) ? S.revenue : SEED.revenue).slice(-n);
    const staffRows = (S.staff && S.staff.length) ? S.staff : SEED.staff;
    const sum = rev.reduce((a, d) => a + d.v, 0) * 1000;
    const cnt = rev.reduce((a, d) => a + d.n, 0);
    const avgKg = S.orders.reduce((a, o) => a + o.weight, 0) / S.orders.length;
    const load = S.machines.reduce((a, m) => a + m.load, 0) / S.machines.length;
    const sorted = [...S.orders].sort(cmpSort);
    return `
    <div class="rep-top">
      <div class="kpi-rail">
        <div class="kpi big t-orange" data-reveal><p class="mono lbl">Peredaran ${n} hari</p><b class="num xxl">${rp(sum)}</b>${barsSVG(rev)}</div>
        <div class="kpi-s"><div class="kpi" data-reveal><p class="mono lbl">Transaksi</p><b class="num xl">${cnt}</b><p class="mono fine">${Math.round(cnt / n)} /hari</p></div></div>
        <div class="kpi-s"><div class="kpi" data-reveal><p class="mono lbl">Rata-rata order</p><b class="num xl">${rp(sum / cnt)}</b><p class="mono fine">${kg(avgKg)} kg per pesanan</p></div></div>
        <div class="kpi" data-reveal><p class="mono lbl">Utilisasi mesin</p>${gaugeSVG(load, 'blue')}</div>
      </div>
      <div class="range-chips">${[7, 14, 30].map((r) => `<button class="fchip ${(S.settings.range || 14) === r ? 'on' : ''}" data-act="range" data-v="${r}">${r} hari</button>`).join('')}
        <button class="btn ghost sm" data-act="export">${icon('download')} CSV</button></div>
    </div>
    <section class="rep-grid">
      <div class="panel" data-reveal>
        <header class="p-head"><h3 class="display">Beban per mesin</h3><span class="mono note">real-time</span></header>
        <ul class="hbars">${S.machines.map((m, i) => `<li style="--i:${i}" data-reveal>
          <span class="mono hb-id">${m.id}</span><div class="track"><i style="--w:${m.load}%" class="${m.state === 'hot' ? 'hot' : ''}"></i></div>
          <b class="mono">${m.load}%</b><span class="mono fine">${esc(STAGES[m.stage].label)}</span></li>`).join('')}</ul>
      </div>
      <div class="panel" data-reveal>
        <header class="p-head"><h3 class="display">Tim terbaik</h3><span class="mono note">minggu ini</span></header>
        <ul class="staff">${staffRows.map((s, i) => `<li style="--i:${i}" data-reveal>
          <i class="av">${esc(initials(s.name))}</i><div><b>${esc(s.name)}</b><p class="mono fine">${esc(s.role)} · ${esc(s.tag)}</p></div>
          <b class="num">${s.done}</b><span class="mono rate">${icon('star')}${s.rating}</span></li>`).join('')}</ul>
      </div>
    </section>
    <section class="panel tbl-wrap" data-reveal>
      <header class="p-head"><h3 class="display">Semua pesanan</h3>
        <span class="mono note">${S.orders.length} baris · klik judul untuk urutkan</span></header>
      <table class="tbl">
        <thead><tr>
          ${[['code', 'Kode'], ['customer', 'Pelanggan'], ['stage', 'Tahap'], ['weight', 'Berat'], ['total', 'Total'], ['priority', 'Prioritas']].map(([k, l]) =>
    `<th class="${S.settings.sortKey === k ? 'act' : ''}" data-act="sort" data-v="${k}">${esc(l)}${S.settings.sortKey === k ? ' ↓' : ''}</th>`).join('')}
          <th>Jadwal</th></tr></thead>
        <tbody>${sorted.map((o, i) => `<tr style="--i:${i}" data-act="detail" data-code="${o.code}">
          <td class="mono">${esc(o.code)}</td><td>${esc(o.customer)}</td>
          <td><span class="stage-pill s-${o.stage}">${esc(STAGES[o.stage].label)}</span></td>
          <td class="mono">${kg(o.weight)}</td><td class="mono num">${rp(o.total)}</td>
          <td class="mono">${esc(o.priority)}</td><td class="mono fine">${esc(o.slot.date)} ${esc(o.slot.time)}</td></tr>`).join('')}</tbody></table>
    </section>`;
  },
};

function cmpSort(a, b) {
  const k = S.settings.sortKey;
  if (k === 'total' || k === 'weight' || k === 'stage') return b[k] - a[k];
  return String(a[k]).localeCompare(String(b[k]));
}

function exportCSV() {
  const head = ['kode', 'pelanggan', 'tahap', 'berat_kg', 'total', 'prioritas', 'tanggal', 'jam'];
  const rows = S.orders.map((o) => [o.code, o.customer, STAGES[o.stage].label, o.weight, o.total, o.priority, o.slot.date, o.slot.time]);
  const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `busa-pesanan-${todayISO()}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast({ title: 'CSV diunduh', msg: rows.length + ' baris pesanan', tone: 'mint', icon: 'download' });
}

/* ── VIEW: SETELAN ────────────────────────────────────── */

VIEWS.setelan = {
  title: () => (S.portal === 'c' ? 'Profil' : 'Setelan'),
  kicker: () => (S.portal === 'c' ? 'Alamat, notifikasi, tema' : 'Preferensi operasional'),
  render() {
    const u = (S.auth && S.auth.user) || null;
    const roleLabel = u ? ((typeof ROLE_LABEL !== 'undefined' && ROLE_LABEL[u.role]) || u.role) : '';
    const ident = u ? (u.username || u.phone || u.id || '') : '';
    const profilPanel = (isAuthed() && u) ? `
      <div class="panel" data-reveal>
        <header class="p-head"><h3 class="display">Profil</h3><span class="mono note">${esc(roleLabel)}</span></header>
        <div class="who"><i class="av">${esc(initials(u.name))}</i><div><b>${esc(u.name)}</b>
          <p class="mono fine">${esc(ident)}${S.portal === 'c' && S.persona && S.persona.since ? ' · sejak ' + esc(S.persona.since) : ''}</p></div></div>
        <div class="data-acts mt">
          <button class="btn ghost sm" data-act="go" data-route="changePassword" data-portal="${S.portal}">${icon('key')} Ganti password</button>
          <button class="btn danger sm" data-act="logout">${icon('lock')} Keluar</button>
        </div>
      </div>` : '';
    return `
    <section class="set-grid">
      ${profilPanel}
      <div class="panel" data-reveal>
        <header class="p-head"><h3 class="display">Wajah aplikasi</h3><span class="mono note">tersimpan di perangkat</span></header>
        <div class="theme-pick">
          ${[['bone', 'Bone', 'Krem sabun, siang laundromat'], ['night', 'Night', 'Biru arang, neon coin-op']].map(([id, l, d]) => `
            <button class="tp t-${id} ${S.theme === id ? 'on' : ''}" data-act="theme-pick" data-v="${id}">
              <span class="tp-sw"><i></i><i></i><i></i></span><b class="display">${l}</b><p class="mono fine">${d}</p>
              ${S.theme === id ? `<span class="tp-on">${icon('check')}</span>` : ''}</button>`).join('')}
        </div>
      </div>
      <div class="panel" data-reveal>
        <header class="p-head"><h3 class="display">Notifikasi</h3></header>
        ${[['push', 'Getaran siklus', 'Setiap tahap bergeser'], ['sms', 'SMS kurir', 'Saat driver berangkat'], ['promo', 'Promo & stempel', 'Maks. 2 per minggu'], ['protect', 'Proteksi otomatis', 'Tergantung ke order berikutnya']].map(([k, l, d]) => `
          <label class="sw-row"><div><b>${l}</b><p class="mono fine">${d}</p></div>
            <input type="checkbox" hidden data-act="setting" data-k="${k}" ${S.settings[k] ? 'checked' : ''}>
            <span class="sw ${S.settings[k] ? 'on' : ''}"><i></i></span></label>`).join('')}
      </div>
      <div class="panel" data-reveal>
        <header class="p-head"><h3 class="display">Alamat</h3><span class="mono note">${S.addresses.length} tersimpan</span></header>
        <ul class="addr-list">${S.addresses.map((a) => `<li><i class="av">${icon('pin')}</i><div><b>${esc(a.tag)} ${a.def ? '<span class="mono chip tiny">utama</span>' : ''}</b><p class="mono fine">${esc(a.label)}</p></div>
          ${a.def ? '' : `<button class="btn-icon" data-act="addr-def" data-id="${a.id}" title="Jadikan utama">${icon('check')}</button>`}
          <button class="btn-icon dim" data-act="addr-del" data-id="${a.id}" title="Hapus">${icon('x')}</button></li>`).join('')}</ul>
        <button class="btn ghost sm" data-act="addr-add">${icon('plus')} Tambah alamat</button>
      </div>
      <div class="panel" data-reveal>
        <header class="p-head"><h3 class="display">Data & pintasan</h3></header>
        <div class="kbd-list">
          ${[['⌘/Ctrl + K', 'Palet perintah'], ['/ atau F', 'Cari pesanan'], ['N', 'Order baru'], ['S', 'Layar pindai operator'], ['T', 'Ganti tema'], ['Esc', 'Tutup panel']].map(([k, l]) => `<div class="kbd-row"><kbd class="mono">${k}</kbd><span>${l}</span></div>`).join('')}
        </div>
        <div class="data-acts">
          ${isAuthed() ? `<button class="btn ghost sm" data-act="go" data-route="changePassword" data-portal="${S.portal}">${icon('key')} Ganti password</button>` : ''}
          <button class="btn ghost sm" data-act="export">${icon('download')} Ekspor pesanan CSV</button>
          <button class="btn ghost sm" data-act="export-json">${icon('box')} Cadangkan JSON</button>
          <button class="btn danger sm" data-act="reset-all">${icon('alert')} Reset ke data contoh</button>
        </div>
        <p class="mono fine mt">Versi BUSA Ops 1.0 · ${S.orders.length} pesanan · ${S.machines.length} mesin · ${clockStr(S.machines.reduce((a, m) => a + m.left, 0))} siklus tersisa.</p>
      </div>
    </section>`;
  },
};

/* ── OVERLAY: NOTIF, PALETTE, CHAT ────────────────────── */

function paintBell() {
  const un = S.notifs.filter((n) => !n.read).length;
  qs('#bell-dot').hidden = un === 0;
  qs('#bell-dot').textContent = un;
}

function renderNotif() {
  qs('#notif-panel').innerHTML = `<header class="np-head"><b class="display">Pemberitahuan</b>
      <button class="lnk mono" data-act="notif-read">Tandai semua dibaca</button></header>
    <ul class="np-list">${S.notifs.map((n) => `
      <li class="np-i t-${n.tone} ${n.read ? 'read' : 'unread'}"><span class="np-i-i">${icon(n.icon)}</span>
        <div><b>${esc(n.title)}</b><p>${esc(n.msg)}</p><time class="mono">${esc(n.at)}</time></div></li>`).join('')}</ul>`;
}

function toggleNotif() {
  const p = qs('#notif-panel');
  if (p.classList.contains('on')) { p.classList.remove('on'); return; }
  renderNotif();
  p.classList.add('on');
}

let paletteItems = [];
function openPalette() {
  const cmds = [
    ...navFor(S.portal).map((n) => ({ t: 'Ke ' + n.label + ' · ' + PORTALS[S.portal].label, i: n.icon, run: () => go(n.id, S.portal) })),
    { t: 'Buka panel Pelanggan', i: 'user', run: () => switchPortal('c') },
    { t: 'Buka panel Admin', i: 'sliders', run: () => switchPortal('a') },
    { t: 'Buka halaman situs', i: 'store', run: () => go('landing') },
    { t: 'Order baru', i: 'plus', run: () => { S.cart = newCart(); go('order', 'c'); } },
    { t: 'Pindai label lantai', i: 'scan', run: () => go('scan', 'a') },
    { t: 'Ganti tema bone/night', i: 'moon', run: toggleTheme },
    { t: 'Buka bantuan', i: 'mail', run: openChat },
    { t: 'Unduh CSV pesanan', i: 'download', run: exportCSV },
    ...visibleOrders().slice(0, 6).map((o) => ({ t: `${o.code} · ${o.customer}`, i: 'truck', run: () => { trackCode = o.code; go('lacak', S.portal); } })),
  ];
  qs('#modalRoot').innerHTML = `<div class="scrim" data-act="palette-close"></div>
    <div class="pal" role="dialog" aria-label="Palet perintah">
      <div class="pal-in">${icon('search')}<input id="pal-q" placeholder="ketik perintah, layanan, atau kode pesanan…" autocomplete="off"></div>
      <ul id="pal-list"></ul>
      <p class="pal-foot mono">↑↓ pilih · ↵ jalankan · esc tutup</p></div>`;
  qs('#modalRoot').classList.add('on');
  paletteItems = cmds;
  paintPalette('');
  const q = qs('#pal-q');
  q.focus();
  let sel = 0;
  q.addEventListener('input', () => { sel = 0; paintPalette(q.value); });
  q.addEventListener('keydown', (e) => {
    const vis = paletteItems.filter(palMatch);
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % vis.length; paintPalette(q.value, sel); }
    if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + vis.length) % vis.length; paintPalette(q.value, sel); }
    if (e.key === 'Enter') { e.preventDefault(); const it = vis[sel]; if (it) { closePalette(); it.run(); } }
  });
}
function palMatch(p) { const q = (qs('#pal-q') || {}).value || ''; return p.t.toLowerCase().includes(q.toLowerCase()); }
function paintPalette(query, sel) {
  const vis = paletteItems.filter((p) => p.t.toLowerCase().includes(query.toLowerCase()));
  qs('#pal-list').innerHTML = vis.length ? vis.map((p, i) => `<li class="pal-i ${i === (sel || 0) ? 'on' : ''}" data-pi="${i}">${icon(p.i)}<span>${esc(p.t)}</span><kbd class="mono">↵</kbd></li>`).join('')
    : `<li class="pal-i empty">${icon('search')}<span>Tidak ada yang cocok dengan “${esc(query)}”</span></li>`;
  qsa('#pal-list .pal-i').forEach((el) => el.addEventListener('click', () => { const it = vis[+el.dataset.pi]; if (it) { closePalette(); it.run(); } }));
}
function closePalette() { const r = qs('#modalRoot'); r.classList.remove('on'); r.innerHTML = ''; document.body.classList.remove('locked'); }

const CHAT_REPLIES = {
  harga: 'Cuci + Setrika Rp 8.000/kg, minimum 3 kg. Bedcover Rp 40.000/pcs. Cuci kering mulai Rp 35.000/item.',
  jam: 'Shift kami 07.00–21.00. Express 6 jam hanya untuk penjemputan sebelum 12.00.',
  noda: 'Treatment noda Rp 4.000/kg, pakai enzimatik + uap. Noda kunyit dan kopi naik 94% pada linen katun.',
  kurir: 'Antar-jemput gratis di atas Rp 80.000 dalam radius 8 km. Di bawah itu Rp 12.000 sekali jalan.',
};
function openChat() {
  openDrawer(`
    <header class="dr-head"><div class="chat-id"><i class="av bot">${icon('drum')}</i><div><b class="display">Bantuan BUSA</b><p class="mono fine">balasan rata-rata 40 detik</p></div></div>
      <button class="btn-icon" data-act="drawer-close" aria-label="Tutup">${icon('x')}</button></header>
    <div class="chat-log" id="chatlog"></div>
    <div class="chat-quick">${Object.entries({ 'Cek harga': 'harga', 'Jam operasional': 'jam', 'Soal noda': 'noda', 'Kurir': 'kurir' }).map(([l, k]) => `<button class="chip" data-act="chat-q" data-k="${k}">${esc(l)}</button>`).join('')}</div>
    <form class="chat-in"><input id="chatq" placeholder="tulis pertanyaan…" autocomplete="off" aria-label="Pesan"><button class="btn-icon primary" type="submit" aria-label="Kirim">${icon('send')}</button></form>`);
  paintChat();
}
function paintChat() {
  const log = qs('#chatlog'); if (!log) return;
  log.innerHTML = S.chat.map((m, i) => `<div class="msg ${m.from}" style="--i:${i}"><p>${esc(m.text)}</p>${m.q ? `<button class="lnk" data-act="chat-add">Tambahkan ke BUSA-4466</button>` : ''}</div>`).join('');
  log.scrollTop = log.scrollHeight;
}

/* ── ACTIONS ──────────────────────────────────────────── */

function toggleTheme() {
  S.theme = S.theme === 'bone' ? 'night' : 'bone';
  document.body.dataset.theme = S.theme;
  qs('#theme-btn').innerHTML = icon(S.theme === 'bone' ? 'moon' : 'sun');
  save();
  toast({ title: 'Tema ' + (S.theme === 'bone' ? 'Bone' : 'Night'), icon: S.theme === 'bone' ? 'sun' : 'moon', tone: 'lilac', ms: 1800 });
}

function advanceStage(code, quiet) {
  const o = S.orders.find((x) => x.code === code);
  if (!o || o.stage >= 8) return;
  if (typeof API !== 'undefined' && API.on && isAuthed()) {
    API.advance(code).then((data) => {
      const fresh = (data && data.order) || S.orders.find((x) => x.code === code);
      if (!fresh) return;
      if (fresh.stage >= 8) {
        bubbles(16);
        toast({ title: fresh.code + ' selesai', msg: 'Stempel loyalti ' + S.stamps + '/7', tone: 'mint', icon: 'star' });
      } else if (!quiet) {
        toast({ title: fresh.code + ' · ' + STAGES[fresh.stage].label, msg: 'Mesin ' + fresh.machine + ' — estimasi ' + etaFor(fresh.stage, fresh.priority), tone: 'blue', icon: 'drum' });
      }
      save();
      if (qs('#drawerRoot.on')) orderDrawer(fresh);
      else if (S.route === 'antrean') render();
      renderTicker();
      livePatch();
    }).catch((err) => apiToastErr(err, 'Siklus ditolak'));
    return;
  }
  o.stage++;
  if (o.stage === 6 && o.mode === 'delivery') o.courier = ['Yudha P.', 'Sinta R.', 'Bagas W.'][Math.floor(Math.random() * 3)];
  if (o.stage === 7) o.machine = o.machine === '—' ? 'Rak ' + ['A', 'B', 'C'][Math.floor(Math.random() * 3)] + '-' + (10 + Math.floor(Math.random() * 20)) : o.machine;
  if (o.stage === 8) {
    if (S.stamps < 7) S.stamps++; else S.stamps = 0;
    S.notifs.unshift({ id: uid('n'), tone: 'mint', icon: 'star', title: o.code + ' selesai', msg: 'Stempel +1 · ' + o.customer, at: nowClock(), read: false });
    bubbles(16);
    toast({ title: o.code + ' selesai', msg: 'Stempel loyalti bertambah (' + S.stamps + '/7)', tone: 'mint', icon: 'star' });
  } else if (!quiet) {
    toast({ title: o.code + ' · ' + STAGES[o.stage].label, msg: 'Mesin ' + o.machine + ' — estimasi ' + etaFor(o.stage, o.priority), tone: 'blue', icon: 'drum' });
  }
  save();
  if (qs('#drawerRoot.on')) {
    const fresh = S.orders.find((x) => x.code === code);
    if (fresh) orderDrawer(fresh);
  } else if (S.route === 'antrean') {
    render();
  } else {
    renderTicker();
    livePatch();
  }
}

function submitOrder() {
  const c = S.cart, r = calc();
  if (!r.lines.length) { toast({ title: 'Belum ada layanan', msg: 'Centang minimal satu layanan.', tone: 'red', icon: 'alert' }); return; }
  if (kgTotal() > 0 && kgTotal() < 3) { toast({ title: 'Di bawah minimum', msg: 'Cucian per kg minimal 3 kg.', tone: 'red', icon: 'alert' }); return; }
  if (typeof API !== 'undefined' && API.on && isAuthed()) { apiSubmitOrder(c, r); return; }
  const code = 'BUSA-' + S.seq++;
  const items = Object.entries(c.items).filter(([, q]) => q > 0).map(([id, qty]) => ({ id, qty }));
  const o = {
    code, customer: 'Rania Sekar', phone: '0812-7781-4402', stage: 0, weight: Math.round((kgTotal() + unitTotal()) * 10) / 10,
    mode: c.mode === 'pickup' ? 'pickup' : 'delivery', items, addons: Object.keys(c.addons).filter((k) => c.addons[k]),
    total: r.total, priority: c.addons.express ? 'express' : 'reguler',
    slot: { date: c.date, time: c.slot }, courier: c.mode === 'pickup' ? '—' : 'menunggu penugasan',
    machine: '—', notes: c.notes, created: 'Hari ini ' + nowClock(),
  };
  S.orders.unshift(o);
  S.notifs.unshift({ id: uid('n'), tone: 'orange', icon: 'basket', title: 'Order ' + code + ' dibuat', msg: (c.mode === 'pickup' ? 'Dijemput ' : 'Titip toko ') + c.slot + ' · ' + rp(r.total), at: nowClock(), read: false });
  S.cart = newCart();
  S.cart.step = 3;
  S.cart.created = code;
  save();
  render();
  bubbles(22);
  toast({ title: code + ' masuk antrean', msg: 'Total ' + rp(r.total) + ' · ' + (c.pay === 'qris' ? 'QRIS — unggah bukti bayar di detail pesanan' : 'tunai di lokasi'), tone: 'orange', icon: 'check', ms: 5200 });
}

/** Checkout lewat API — server menghitung ulang tagihan dan menyimpan ke DB. */
async function apiSubmitOrder(c, r) {
  const payload = {
    items: Object.entries(c.items).filter(([, q]) => q > 0).map(([id, qty]) => ({ id, qty })),
    addons: Object.keys(c.addons).filter((k) => c.addons[k]),
    mode: c.mode,
    promoCode: c.code ? c.code.toUpperCase() : null,
    protect: c.protect,
    slotDate: c.date,
    slotTime: c.slot,
    notes: c.notes,
    pay: c.pay,
    weight: c.weight,
  };
  try {
    const data = isCustomerAuthed()
      ? await API.submitOrder(payload)
      : await API.submitWalkin(Object.assign({}, payload, { customer: S.persona.name, phone: S.persona.phone }));
    const fresh = data.order || {};
    const code = fresh.code || '';
    apiPatchOrder(fresh);
    S.cart = newCart();
    S.cart.step = 3;
    S.cart.created = code;
    save();
    render();
    bubbles(22);
    toast({ title: code + ' masuk antrean', msg: 'Total ' + rp(fresh.total || r.total) + ' · ' + (c.pay === 'qris' ? 'QRIS — unggah bukti bayar di detail pesanan' : 'tunai di lokasi'), tone: 'orange', icon: 'check', ms: 5200 });
  } catch (err) {
    apiToastErr(err, 'Order ditolak');
  }
}

function todayDateLabel() {
  const d = new Date();
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getMonth()];
  return ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][d.getDay()] + ', ' + d.getDate() + ' ' + m + ' ' + d.getFullYear();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  const np = qs('#notif-panel');
  if (np && np.classList.contains('on') && !e.target.closest('#notif-panel') && !e.target.closest('#bell-btn')) np.classList.remove('on');
  if (!t) return;
  const a = t.dataset.act;

  if (a === 'go') { e.preventDefault(); if (qs('#modalRoot.on')) closePalette(); go(t.dataset.route, t.dataset.portal); return; }
  if (a === 'portal') { switchPortal(t.dataset.v); return; }
  if (a === 'palette') { openPalette(); return; }
  if (a === 'notif') { toggleNotif(); return; }
  if (a === 'chat') { openChat(); return; }
  if (a === 'theme') { toggleTheme(); return; }
  if (a === 'new-order') { S.cart = newCart(); go('order'); return; }
  if (a === 'logout') { doLogout(); return; }
  if (a === 'reconnect') { if (typeof API !== 'undefined' && API.reconnect) API.reconnect(); return; }
  if (a === 'toast-close') { t.closest('.toast').remove(); return; }
  if (a === 'modal-close') { closeModal(); return; }
  if (a === 'drawer-close') { closeDrawer(); return; }
  if (a === 'palette-close') { closePalette(); return; }

  const code = t.dataset.code;
  switch (a) {
    case 'machine': machineModal(S.machines.find((m) => m.id === t.dataset.id)); break;
    case 'machine-toggle': {
      const m = S.machines.find((x) => x.id === t.dataset.id);
      if (typeof API !== 'undefined' && API.on && isAdminAuthed()) {
        const state = m.state === 'idle' ? 'run' : 'idle';
        const patch = state === 'run'
          ? { state, rpm: 7, load: Math.max(20, m.load), left: Math.max(6, m.left || 35) }
          : { state, rpm: 0 };
        API.patchMachine(m.id, patch)
          .then(() => { closeModal(); render(); toast({ title: m.id + (state === 'idle' ? ' dijeda' : ' berjalan'), tone: state === 'idle' ? 'amber' : 'mint', icon: state === 'idle' ? 'pause' : 'play', ms: 2000 }); })
          .catch((err) => apiToastErr(err, 'Mesin tidak bisa diubah'));
        break;
      }
      if (m.state === 'idle') { m.state = 'run'; m.left = Math.max(6, m.left || 35); m.rpm = 7; m.load = Math.max(20, m.load); }
      else { m.state = 'idle'; m.rpm = 0; }
      save(); closeModal(); render();
      toast({ title: m.id + (m.state === 'idle' ? ' dijeda' : ' berjalan'), tone: m.state === 'idle' ? 'amber' : 'mint', icon: m.state === 'idle' ? 'pause' : 'play', ms: 2000 });
      break;
    }
    case 'detail': { const o = S.orders.find((x) => x.code === code); if (o) orderDrawer(o); break; }
    case 'advance': advanceStage(code); break;
    case 'collect': {
      const o = S.orders.find((x) => x.code === code);
      if (!o) break;
      if (typeof API !== 'undefined' && API.on && isAuthed()) {
        API.collect(code)
          .then(() => { closeDrawer(); render(); toast({ title: o.code + ' diserahkan', msg: 'Tanda tangan digital tersimpan', tone: 'mint', icon: 'check' }); })
          .catch((err) => apiToastErr(err, 'Belum bisa diambil'));
        break;
      }
      o.collected = true; closeDrawer();
      toast({ title: o.code + ' diserahkan', msg: 'Tanda tangan digital tersimpan', tone: 'mint', icon: 'check' });
      break;
    }
    case 'label': toast({ title: 'Label dicetak', msg: code + ' · 4 sticker tahan air', tone: 'lilac', icon: 'tag' }); break;
    case 'pay-mark': {
      const o = S.orders.find((x) => x.code === code);
      if (!o) break;
      if (typeof API !== 'undefined' && API.on && isAdminAuthed()) {
        API.pay(code, o.pay)
          .then((data) => {
            const fresh = (data && data.order) || o;
            closeModal(); render();
            if (qs('#drawerRoot.on')) orderDrawer(fresh);
            toast({ title: fresh.code + ' lunas', msg: 'Pembayaran ' + (fresh.pay === 'wallet' ? 'dompet' : fresh.pay) + ' tercatat.', tone: 'mint', icon: 'check' });
          })
          .catch((err) => apiToastErr(err, 'Gagal mencatat pembayaran'));
        break;
      }
      o.payStatus = 'lunas'; save(); closeModal(); render();
      if (qs('#drawerRoot.on')) orderDrawer(o);
      toast({ title: o.code + ' lunas', msg: 'Pembayaran ' + (o.pay === 'wallet' ? 'dompet' : o.pay) + ' tercatat.', tone: 'mint', icon: 'check' });
      break;
    }
    case 'proof-pick': {
      const o = S.orders.find((x) => x.code === code);
      if (!o) break;
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        if (f) submitProof(o.code, f);
      });
      inp.click();
      break;
    }
    case 'proof-view': {
      const o = S.orders.find((x) => x.code === code);
      if (!o) break;
      const show = (src) => openModal(`<p class="mono kicker">Bukti bayar · ${esc(o.code)}</p><h2 class="display lg">${rp(o.total)}</h2>
        <img class="proof-img" src="${src}" alt="Bukti pembayaran ${esc(o.code)}">
        <div class="m-acts"><button class="btn primary" data-act="pay-mark" data-code="${o.code}">${icon('check')} Tandai lunas</button>
        <button class="btn ghost" data-act="modal-close">Tutup</button></div>`);
      const cached = S.proofs[o.code] || o.proof;
      if (cached) { show(cached); break; }
      if (typeof API !== 'undefined' && API.on && isAuthed()) {
        API.loadProof(code)
          .then((src) => { if (src) show(src); else toast({ title: 'Bukti tidak ditemukan', tone: 'amber', icon: 'alert' }); })
          .catch((err) => apiToastErr(err, 'Gagal memuat bukti'));
        break;
      }
      toast({ title: 'Bukti tidak tersedia', msg: 'Mode lokal tidak menyimpan gambar bukti.', tone: 'amber', icon: 'info' });
      break;
    }
    case 'cancel': {
      const o = S.orders.find((x) => x.code === code);
      if (!o) break;
      const refund = o.payStatus === 'lunas'
        ? (o.pay === 'wallet'
          ? 'Saldo ' + rp(o.total) + ' dikembalikan ke dompet pelanggan.'
          : 'Tagihan ditandai dikembalikan — refund diproses di kasir.')
        : 'Pesanan ditandai batal tanpa tagihan.';
      openModal(`<p class="mono kicker">${esc(o.code)} · ${esc(STAGES[o.stage].label)}</p><h2 class="display lg">Batalkan pesanan?</h2>
        <p class="lede sm">${refund}</p>
        <div class="m-acts"><button class="btn danger" data-act="cancel-yes" data-code="${o.code}">${icon('x')} Ya, batalkan</button>
        <button class="btn ghost" data-act="modal-close">Tidak jadi</button></div>`);
      break;
    }
    case 'cancel-yes': {
      const o = S.orders.find((x) => x.code === code);
      if (!o) break;
      if (typeof API !== 'undefined' && API.on && isAuthed()) {
        API.cancel(code)
          .then(() => { closeModal(); closeDrawer(); render(); toast({ title: o.code + ' dibatalkan', msg: o.pay === 'wallet' ? rp(o.total) + ' dikembalikan ke Dompet' : 'Pesanan ditandai batal', tone: 'red', icon: 'x' }); })
          .catch((err) => { closeModal(); apiToastErr(err, 'Tidak bisa dibatalkan'); });
        break;
      }
      S.orders = S.orders.filter((x) => x.code !== code);
      closeModal(); closeDrawer(); render();
      toast({ title: o.code + ' dibatalkan', msg: rp(o.total) + ' dikembalikan ke Dompet', tone: 'red', icon: 'x' });
      break;
    }
    case 'try': trackCode = code; render(); break;
    case 'kan': { e.stopPropagation(); advanceStage(code); break; }
    case 'cust': custDrawer(t.dataset.name); break;
    case 'users-reload': {
      API.loadUsers().then(() => render()).catch((err) => apiToastErr(err, 'Gagal memuat pengguna'));
      break;
    }
    case 'user-new': userModal(null); break;
    case 'user-edit': userModal((S.users || []).find((u) => u.id === t.dataset.id)); break;
    case 'user-create': userCreate(); break;
    case 'user-save': userSave(t.dataset.id); break;
    case 'user-toggle': {
      const u = (S.users || []).find((x) => x.id === t.dataset.id); if (!u) break;
      const next = !u.active;
      API.updateUser(u.id, { active: next })
        .then(() => {
          render();
          toast({ title: u.name + (next ? ' diaktifkan' : ' dinonaktifkan'), msg: next ? 'Bisa masuk kembali.' : 'Tidak bisa masuk lagi.', tone: next ? 'mint' : 'amber', icon: next ? 'play' : 'pause' });
        })
        .catch((err) => apiToastErr(err, 'Gagal mengubah status'));
      break;
    }
    case 'user-del': {
      const u = (S.users || []).find((x) => x.id === t.dataset.id); if (!u) break;
      openModal(`<p class="mono kicker">Aksi permanen</p><h2 class="display lg">Hapus ${esc(u.name)}?</h2>
        <p class="lede sm">Akun tidak bisa masuk lagi. Riwayat order pelanggan tetap tersimpan di laporan.</p>
        <div class="m-acts"><button class="btn danger" data-act="user-del-yes" data-id="${u.id}">${icon('x')} Ya, hapus</button>
        <button class="btn ghost" data-act="modal-close">Batal</button></div>`);
      break;
    }
    case 'user-del-yes': {
      const u = (S.users || []).find((x) => x.id === t.dataset.id);
      API.deleteUser(t.dataset.id)
        .then(() => { closeModal(); render(); toast({ title: 'Akun dihapus', msg: u ? u.name : '', tone: 'red', icon: 'x' }); })
        .catch((err) => apiToastErr(err, 'Gagal menghapus akun'));
      break;
    }
    case 'qris-pick': { const f = qs('#qris-file'); if (f) f.click(); break; }
    case 'qris-download': qrisDownload(); break;
    case 'qris-reset':
      openModal(`<p class="mono kicker">QRIS kustom</p><h2 class="display lg">Hapus QRIS unggahan?</h2>
        <p class="lede sm">Pelanggan kembali melihat gambar contoh sampai Anda mengunggah QRIS baru.</p>
        <div class="m-acts"><button class="btn danger" data-act="qris-reset-yes">${icon('x')} Ya, hapus</button>
        <button class="btn ghost" data-act="modal-close">Batal</button></div>`);
      break;
    case 'qris-reset-yes':
      API.resetQris()
        .then(() => { closeModal(); render(); toast({ title: 'QRIS dihapus', msg: 'Kembali ke gambar contoh.', tone: 'red', icon: 'x' }); })
        .catch((err) => apiToastErr(err, 'Gagal menghapus QRIS'));
      break;
    case 'sub': {
      const tiers = (S.tiers && S.tiers.length) ? S.tiers : SEED.tiers;
      const tier = tiers.find((x) => x.id === t.dataset.v);
      if (!tier) break;
      if (tier.price > 0) {
        toast({ title: 'Aktivasi lewat kasir', msg: tier.name + ' diaktifkan staf setelah pembayaran — hubungi kasir atau tim lewat chat.', tone: 'amber', icon: 'info', ms: 5600 });
        openChat();
        break;
      }
      S.sub = tier.id; save(); render();
      toast({ title: 'Kembali ke ' + tier.name, msg: 'Order berikutnya ditagih per kilogram.', tone: 'muted', icon: 'star' });
      break;
    }
    case 'reorder': {
      const src = S.orders.find((x) => x.code === code);
      if (!src) break;
      S.cart = newCart();
      src.items.forEach((it) => { S.cart.items[it.id] = it.qty; });
      src.addons.forEach((id) => { S.cart.addons[id] = true; });
      S.cart.weight = kgTotal() || src.weight; S.cart.mode = src.mode; S.cart.notes = src.notes; S.cart.step = 1;
      go('order', 'c');
      toast({ title: 'Disalin dari ' + src.code, msg: kg(src.weight) + ' kg siap dikonfirmasi ulang', tone: 'orange', icon: 'copy', ms: 3200 });
      break;
    }
    case 'reslot': {
      const o = S.orders.find((x) => x.code === code); if (!o) break;
      openModal(`<p class="mono kicker">${esc(o.code)}</p><h2 class="display lg">Pindahkan jam jemputan</h2>
        <p class="lede sm">Ubah tanpa biaya selama pesanan belum masuk tahap Rendam.</p>
        <div class="slot-chips">${SLOTS.map((s) => `<button class="schip ${o.slot.time === s ? 'on' : ''}" data-act="reslot-set" data-code="${o.code}" data-v="${s}">${esc(s)}</button>`).join('')}</div>
        <div class="m-acts"><button class="btn ghost" data-act="modal-close">Tutup</button></div>`);
      break;
    }
    case 'reslot-set': {
      const o = S.orders.find((x) => x.code === code); if (!o) break;
      const slotTime = t.dataset.v;
      if (typeof API !== 'undefined' && API.on && isAuthed()) {
        API.reslot(code, slotTime)
          .then((data) => {
            const fresh = (data && data.order) || o;
            closeModal(); render();
            toast({ title: fresh.code + ' dipindah', msg: 'Jemputan ' + slotTime, tone: 'mint', icon: 'calendar' });
          })
          .catch((err) => apiToastErr(err, 'Gagal memindah jadwal'));
        break;
      }
      o.slot.time = slotTime; save(); closeModal(); render();
      toast({ title: o.code + ' digeser', msg: 'Jemputan ' + slotTime, tone: 'mint', icon: 'calendar' });
      break;
    }
    case 'area-check': areaCheck((qs('#arq') || {}).value); break;
    case 'bc-jump': {
      const el = qs('#' + t.dataset.v);
      if (el) el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
      break;
    }
    case 'ld-svc': { LDC.svc = t.dataset.id; paintLDC(); break; }
    case 'ld-slot': {
      LDC.slot = t.dataset.v; paintLDC();
      if (S.route === 'landing' && !t.disabled) {
        setHintLanding('Slot ' + LDC.slot + ' dipilih. Tinggal dua kolom lagi di bawah.');
        const el = qs('#a6'); if (el) el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
      }
      break;
    }
    case 'ld-track': ldTrack(); break;
    case 'ld-track-set': ldTrack(t.dataset.v); break;
    case 'ld-use': ldSubmit(); break;
    case 'scan-mode': { SCAN.mode = t.dataset.v; render(); break; }
    case 'basket-pick': { pickBasket(code); break; }
    case 'gap-pick': {
      if (!PAP.pick) { setHint('Ketuk salah satu keranjang yang menunggu lebih dulu, baru ketuk bagian terang pada baris mesin.'); render(); break; }
      placeAt(t.dataset.m, +t.dataset.s, +t.dataset.e);
      break;
    }
    case 'papan-recompute': {
      const p = buildDayPlan();
      setHint('Jadwal dihitung ulang dari ' + S.orders.length + ' pesanan · ' + p.gaps.length + ' waktu kosong tersisa hari ini.');
      render();
      toast({ title: 'Papan diperbarui', msg: durText(p.gaps.reduce((a, g) => a + g.end - g.start, 0)) + ' ruang drum masih ada hari ini', tone: 'blue', icon: 'calendar', ms: 2600 });
      break;
    }
    case 'scan-advance': recordEvent({ code, action: 'tahap' }); break;
    case 'scan-assign': { if (t.dataset.code) recordEvent({ code: t.dataset.code, action: 'muat', machine: t.dataset.id }); break; }
    case 'scan-focus': {
      SCAN.draft = code; SCAN.mode = code && findOrder(code) && findOrder(code).stage < 2 ? 'muat' : SCAN.mode;
      render();
      const q = qs('#scanq'); if (q) { q.focus(); q.select(); }
      break;
    }
    case 'scan-flush': {
      const r = flushPending();
      toast(r.mode === 'api'
        ? { title: r.sent + ' event dikirim ulang', msg: apiBase() + '/scan', tone: 'mint', icon: 'scan' }
        : { title: 'Mode lokal aktif', msg: 'Server tidak terjangkau — event tersimpan lokal dan terkirim saat tersambung.', tone: 'amber', icon: 'info', ms: 5200 });
      render(); break;
    }
    case 'scan-sim': {
      S.settings.pindaiSaja = !S.settings.pindaiSaja; save(); render();
      toast({ title: S.settings.pindaiSaja ? 'Hanya pindai yang menggeser tahap' : 'Simulasi lantai aktif', msg: S.settings.pindaiSaja ? 'Drum berhenti sendiri; operator harus memindai.' : 'Tahap bergerak otomatis tiap 7 detik.', tone: S.settings.pindaiSaja ? 'blue' : 'amber', icon: S.settings.pindaiSaja ? 'lock' : 'bolt' });
      break;
    }
    case 'svc-toggle': {
      const s = CATALOG.find((x) => x.id === t.dataset.id);
      const next = !svcOn(s);
      if (typeof API !== 'undefined' && API.on && isAdminAuthed()) {
        API.patchService(s.id, { active: next })
          .then(() => {
            render();
            toast({ title: s.name + (next ? ' aktif' : ' disembunyikan'), msg: next ? 'Muncul di portal pelanggan.' : 'Tidak bisa dipesan sampai diaktifkan lagi.', tone: next ? 'mint' : 'amber', icon: next ? 'check' : 'eye', ms: 2800 });
          })
          .catch((err) => apiToastErr(err, 'Katalog gagal diubah'));
        break;
      }
      s.active = next;
      S.svc[s.id] = Object.assign(S.svc[s.id] || {}, { active: s.active });
      save(); render();
      toast({ title: s.name + (s.active ? ' aktif' : ' disembunyikan'), msg: s.active ? 'Muncul di portal pelanggan.' : 'Tidak bisa dipesan sampai diaktifkan lagi.', tone: s.active ? 'mint' : 'amber', icon: s.active ? 'check' : 'eye', ms: 2800 });
      break;
    }
    case 'svc-reset': {
      if (typeof API !== 'undefined' && API.on && isAdminAuthed()) {
        Promise.all([
          ...SVC0.map((d) => API.patchService(d.id, { price: d.price, hours: d.hours, active: true })),
          ...ADDON0.map((d) => API.patchAddon(d.id, { price: d.price, active: true })),
        ]).then(() => {
          S.svc = {}; save(); render();
          toast({ title: 'Katalog dipulihkan', msg: 'Harga, cycle, dan status kembali ke nilai awal', tone: 'lilac', icon: 'copy' });
        }).catch((err) => apiToastErr(err, 'Gagal memulihkan katalog'));
        break;
      }
      SVC0.forEach((d) => {
        const s = CATALOG.find((x) => x.id === d.id);
        if (s) Object.assign(s, { price: d.price, hours: d.hours, active: true });
      });
      ADDON0.forEach((d) => { const a = ADDONS.find((x) => x.id === d.id); if (a) a.price = d.price; });
      S.svc = {}; save(); render();
      toast({ title: 'Katalog dipulihkan', msg: 'Harga, cycle, dan status kembali ke nilai awal', tone: 'lilac', icon: 'copy' });
      break;
    }
    case 'filter': orderFilter = t.dataset.v; render(); break;
    case 'sort': S.settings.sortKey = t.dataset.v; save(); render(); break;
    case 'range': S.settings.range = +t.dataset.v; save(); render(); break;
    case 'export': exportCSV(); break;
    case 'export-json': {
      const url = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
      const lnk = document.createElement('a'); lnk.href = url; lnk.download = 'busa-backup.json'; lnk.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast({ title: 'Cadangan JSON diunduh', tone: 'mint', icon: 'box' });
      break;
    }
    case 'reset-all':
      openModal(`<p class="mono kicker">Aksi ini permanen</p><h2 class="display lg">Reset ke data contoh?</h2>
        <p class="lede">Pesanan, saldo, dan stempel yang Anda buat kembali hilang semuanya.</p>
        <div class="m-acts"><button class="btn danger" data-act="reset-yes">${icon('alert')} Ya, reset</button>
        <button class="btn ghost" data-act="modal-close">Batal</button></div>`);
      break;
    case 'reset-yes': localStorage.removeItem(KEY); closeModal(); location.reload(); break;
    case 'step': S.cart.step = +t.dataset.i; render(); break;
    case 'next': {
      const r = calc();
      if (S.cart.step === 0 && !r.lines.length) { toast({ title: 'Pilih layanan dulu', tone: 'red', icon: 'alert', ms: 2400 }); break; }
      S.cart.step = Math.min(2, S.cart.step + 1); render(); break;
    }
    case 'svc': case 'addon': case 'addr': case 'pay': case 'protect': case 'setting': break;
    case 'qty': {
      const id = t.dataset.id, sv = CATALOG.find((s) => s.id === id);
      const next = Math.max(0, (S.cart.items[id] || 0) + (+t.dataset.d) * (sv.unit === 'kg' ? 0.5 : 1));
      S.cart.items[id] = next; S.cart.weight = kgTotal() || S.cart.weight; render(); break;
    }
    case 'mode': S.cart.mode = t.dataset.v; if (t.dataset.v === 'pickup' && !S.cart.addr) S.cart.addr = S.addresses[0].id; render(); break;
    case 'date': S.cart.date = t.dataset.v; render(); break;
    case 'slot': S.cart.slot = t.dataset.v; render(); break;
    case 'promo-set': S.cart.code = t.dataset.code; if (S.cart.step < 2) S.cart.step = 2; go('order'); toast({ title: 'Kode ' + t.dataset.code + ' dipasang', tone: 'orange', icon: 'tag', ms: 2200 }); break;
    case 'promo-apply': {
      const inp = qs('[data-act="promo-input"]');
      S.cart.code = (inp ? inp.value : '').toUpperCase();
      const p = S.promos.find((x) => x.code === S.cart.code);
      toast(p ? { title: p.label + ' aktif', msg: p.terms, tone: 'mint', icon: 'spark' } : { title: 'Kode tidak dikenal', msg: 'Coba BUSA10, KURIRHEMAT, atau SPREI2', tone: 'red', icon: 'alert' });
      render(); break;
    }
    case 'submit': submitOrder(); break;
    case 'reset-cart': S.cart = newCart(); go('order'); break;
    case 'pick-svc': S.cart = newCart(); S.cart.items[t.dataset.id] = CATALOG.find((s) => s.id === t.dataset.id).unit === 'kg' ? 5 : 1; S.cart.weight = kgTotal() || 5; go('order'); break;
    case 'theme-pick': if (S.theme !== t.dataset.v) toggleTheme(); break;
    case 'notif-read':
      if (typeof API !== 'undefined' && API.on && isCustomerAuthed()) {
        API.notifsRead().then(() => { renderNotif(); paintBell(); }).catch((err) => apiToastErr(err, 'Gagal menandai'));
        break;
      }
      S.notifs.forEach((n) => { n.read = true; }); save(); renderNotif(); paintBell(); break;
    case 'copy':
      (navigator.clipboard ? navigator.clipboard.writeText(t.dataset.v) : Promise.reject()).then(() => toast({ title: 'Disalin', msg: t.dataset.v, tone: 'lilac', icon: 'copy', ms: 2000 }))
        .catch(() => toast({ title: 'Salin manual', msg: t.dataset.v, tone: 'amber', icon: 'copy' }));
      break;
    case 'addr-add':
      openModal(`<p class="mono kicker">Alamat baru</p><h2 class="display lg">Tambah alamat</h2>
        <label class="field"><p class="mono lbl">Label</p><input id="atag" class="in" value="Kantor" placeholder="Rumah / Kantor"></label>
        <label class="field"><p class="mono lbl">Alamat lengkap</p><textarea id="aaddr" class="ta" placeholder="Jl. …, kode pos"></textarea></label>
        <div class="m-acts"><button class="btn primary" data-act="addr-save">${icon('plus')} Simpan</button>
        <button class="btn ghost" data-act="modal-close">Batal</button></div>`);
      break;
    case 'addr-save': {
      const tag = (qs('#atag').value || 'Baru').trim(), ad = (qs('#aaddr').value || '').trim();
      if (!ad) { toast({ title: 'Alamat kosong', tone: 'red', icon: 'alert' }); break; }
      if (typeof API !== 'undefined' && API.on && isCustomerAuthed()) {
        API.addAddress(tag, ad)
          .then(() => { closeModal(); render(); toast({ title: 'Alamat tersimpan', msg: tag, tone: 'mint', icon: 'pin' }); })
          .catch((err) => apiToastErr(err, 'Alamat gagal disimpan'));
        break;
      }
      S.addresses.push({ id: uid('a'), tag, label: ad, def: false });
      save(); closeModal(); render();
      toast({ title: 'Alamat tersimpan', msg: tag, tone: 'mint', icon: 'pin' });
      break;
    }
    case 'addr-def':
      if (typeof API !== 'undefined' && API.on && isCustomerAuthed()) {
        API.defaultAddress(t.dataset.id).then(() => render()).catch((err) => apiToastErr(err, 'Gagal menjadikan utama'));
        break;
      }
      S.addresses.forEach((x) => { x.def = x.id === t.dataset.id; }); save(); render(); break;
    case 'addr-del': {
      const was = S.addresses.find((x) => x.id === t.dataset.id);
      if (typeof API !== 'undefined' && API.on && isCustomerAuthed()) {
        API.delAddress(t.dataset.id)
          .then(() => { render(); toast({ title: 'Alamat dihapus', msg: was ? was.tag : '', tone: 'red', icon: 'x' }); })
          .catch((err) => apiToastErr(err, 'Gagal menghapus alamat'));
        break;
      }
      S.addresses = S.addresses.filter((x) => x.id !== t.dataset.id);
      if (was && was.def && S.addresses[0]) S.addresses[0].def = true;
      save(); render(); toast({ title: 'Alamat dihapus', msg: was ? was.tag : '', tone: 'red', icon: 'x' });
      break;
    }
    case 'chat-q': {
      const k = t.dataset.k;
      if (typeof API !== 'undefined' && API.on && isCustomerAuthed()) {
        API.chat(t.textContent).then(() => paintChat()).catch((err) => apiToastErr(err, 'Pesan gagal terkirim'));
        break;
      }
      S.chat.push({ from: 'me', text: t.textContent });
      S.chat.push({ from: 'bot', text: CHAT_REPLIES[k] });
      save(); paintChat(); break;
    }
    case 'chat-add':
      S.cart = newCart(); S.cart.items.bedcover = 2; S.cart.step = 1; closeDrawer(); go('order');
      toast({ title: 'Ditambahkan ke keranjang', msg: '2 bedcover · treatment noda siap dipilih', tone: 'orange', icon: 'basket' });
      break;
  }
});

document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'scanq') { SCAN.draft = e.target.value; patchScanHint(); }
  const t = e.target.closest('[data-act]'); if (!t) return;
  if (t.dataset.act === 'query') { orderQuery = t.value; const p = t.value; render(); const el = qs('[data-act="query"]'); if (el) { el.value = p; el.focus(); el.setSelectionRange(p.length, p.length); } }
  if (t.dataset.act === 'cust-q') { custQuery = t.value; const p = t.value; render(); const el = qs('[data-act="cust-q"]'); if (el) { el.value = p; el.focus(); el.setSelectionRange(p.length, p.length); } }
  if (t.dataset.act === 'notes') S.cart.notes = t.value;
  if (t.dataset.act === 'promo-input') S.cart.code = t.value.toUpperCase();
  if (t.id === 'estkg') paintEst();
});

document.addEventListener('change', (e) => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const on = !!t.checked;
  switch (t.dataset.act) {
    case 'svc': {
      const id = t.dataset.id, sv = CATALOG.find((s) => s.id === id);
      S.cart.items[id] = on ? (sv.unit === 'kg' ? 3 : 1) : 0;
      S.cart.weight = kgTotal() || S.cart.weight;
      save(); render(); break;
    }
    case 'addon': S.cart.addons[t.dataset.id] = on; render(); break;
    case 'addr': S.cart.addr = t.dataset.id; render(); break;
    case 'pay': S.cart.pay = t.dataset.v; render(); break;
    case 'protect': S.cart.protect = on; render(); break;
    case 'setting': S.settings[t.dataset.k] = on; save(); render(); break;
    case 'm-field': {
      const m = S.machines.find((x) => x.id === t.dataset.id); if (!m) break;
      const k = t.dataset.k, v = t.value;
      if (typeof API !== 'undefined' && API.on && isAdminAuthed()) {
        const patch = {};
        if (k === 'state') patch.state = v;
        else if (k === 'stage') patch.stage = clamp(+v, 0, STAGES.length - 1);
        else if (k === 'load') patch.load = clamp(Math.round(+v), 0, 100);
        else if (k === 'temp') patch.temp = clamp(+v, 15, 140);
        else if (k === 'rpm') patch.rpm = clamp(Math.round(+v), 0, 14);
        else if (k === 'left') patch.left = clamp(Math.round(+v), 0, 1440);
        if (v === 'idle') patch.rpm = 0;
        API.patchMachine(m.id, patch)
          .then((data) => {
            render();
            const fresh = (data && data.machine) || m;
            toast({ title: fresh.id + ' diperbarui', msg: STAGES[fresh.stage].label + ' · ' + fresh.load + '% · ' + Math.round(fresh.temp) + '°C · ' + clockStr(fresh.left), tone: 'blue', icon: 'gear', ms: 2200 });
          })
          .catch((err) => { apiToastErr(err, 'Mesin gagal diperbarui'); render(); });
        break;
      }
      if (k === 'state') m.state = v;
      else if (k === 'stage') m.stage = clamp(+v, 0, STAGES.length - 1);
      else if (k === 'load') m.load = clamp(Math.round(+v), 0, 100);
      else if (k === 'temp') m.temp = clamp(+v, 20, 140);
      else if (k === 'rpm') m.rpm = clamp(Math.round(+v), 0, 14);
      else if (k === 'left') m.left = clamp(Math.round(+v), 0, 240);
      if (m.state === 'idle') m.rpm = 0;
      save(); render();
      toast({ title: m.id + ' diperbarui', msg: STAGES[m.stage].label + ' · ' + m.load + '% · ' + Math.round(m.temp) + '°C · ' + clockStr(m.left), tone: 'blue', icon: 'gear', ms: 2200 });
      break;
    }
    case 'svc-field': {
      const s = CATALOG.find((x) => x.id === t.dataset.id); if (!s) break;
      const val = clamp(Math.round(+t.value), t.dataset.k === 'price' ? 0 : 1, t.dataset.k === 'price' ? 900000 : 168);
      if (typeof API !== 'undefined' && API.on && isAdminAuthed()) {
        API.patchService(s.id, { [t.dataset.k]: val })
          .then(() => {
            render();
            toast({ title: s.name + ' · ' + t.dataset.k, msg: t.dataset.k === 'price' ? rp(s.price) + ' / ' + s.unit : s.hours + ' jam', tone: 'orange', icon: 'tag', ms: 2200 });
          })
          .catch((err) => { apiToastErr(err, 'Harga gagal disimpan'); render(); });
        break;
      }
      s[t.dataset.k] = val;
      S.svc[s.id] = Object.assign(S.svc[s.id] || {}, { [t.dataset.k]: s[t.dataset.k] });
      save(); render();
      toast({ title: s.name + ' · ' + t.dataset.k, msg: t.dataset.k === 'price' ? rp(s.price) + ' / ' + s.unit : s.hours + ' jam', tone: 'orange', icon: 'tag', ms: 2200 });
      break;
    }
    case 'addon-field': {
      const a = ADDONS.find((x) => x.id === t.dataset.id); if (!a) break;
      const val = clamp(Math.round(+t.value), 0, 500000);
      if (typeof API !== 'undefined' && API.on && isAdminAuthed()) {
        API.patchAddon(a.id, { price: val })
          .then(() => {
            render();
            toast({ title: a.name, msg: rp(a.price) + (a.kind === 'kg' ? ' / kg' : ' / paket'), tone: 'orange', icon: a.icon, ms: 2200 });
          })
          .catch((err) => { apiToastErr(err, 'Harga tambahan gagal disimpan'); render(); });
        break;
      }
      a.price = val;
      save(); render();
      toast({ title: a.name, msg: rp(a.price) + (a.kind === 'kg' ? ' / kg' : ' / paket'), tone: 'orange', icon: a.icon, ms: 2200 });
      break;
    }
  }
});

document.addEventListener('submit', async (e) => {
  if (e.target.matches('[data-act="login-customer-form"]')) {
    e.preventDefault();
    const login = (qs('[data-act="login-c-id"]') || {}).value || '';
    const password = (qs('[data-act="login-c-pw"]') || {}).value || '';
    const errEl = qs('#login-c-err');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    try {
      const hashAtSubmit = location.hash;
      const data = await doLogin(login, password);
      if (data.user.role !== 'customer') { clearAuth(); if (errEl) { errEl.hidden = false; errEl.textContent = 'Akun ini bukan pelanggan. Gunakan portal admin.'; } return; }
      toast({ title: 'Selamat datang, ' + data.user.name, msg: 'Anda masuk sebagai pelanggan', tone: 'mint', icon: 'user', ms: 3000 });
      /* Bila pengguna sudah menavigasi sendiri selama menunggu server, hormati tujuannya. */
      if (location.hash === hashAtSubmit) go('beranda', 'c');
    } catch (err) { if (errEl) { errEl.hidden = false; errEl.textContent = err.message; } }
    return;
  }
  if (e.target.matches('[data-act="login-admin-form"]')) {
    e.preventDefault();
    const login = (qs('[data-act="login-a-id"]') || {}).value || '';
    const password = (qs('[data-act="login-a-pw"]') || {}).value || '';
    const errEl = qs('#login-a-err');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    try {
      const hashAtSubmit = location.hash;
      const data = await doLogin(login, password);
      if (data.user.role !== 'admin' && data.user.role !== 'staff') { clearAuth(); if (errEl) { errEl.hidden = false; errEl.textContent = 'Akun ini bukan admin/staf. Gunakan portal pelanggan.'; } return; }
      toast({ title: 'Selamat datang, ' + data.user.name, msg: 'Anda masuk sebagai ' + data.user.role, tone: 'blue', icon: 'sliders', ms: 3000 });
      /* Bila pengguna sudah menavigasi sendiri selama menunggu server, hormati tujuannya. */
      if (location.hash === hashAtSubmit) go('floor', 'a');
    } catch (err) { if (errEl) { errEl.hidden = false; errEl.textContent = err.message; } }
    return;
  }
  if (e.target.matches('[data-act="register-form"]')) {
    e.preventDefault();
    const name = (qs('[data-act="reg-name"]') || {}).value || '';
    const phone = (qs('[data-act="reg-phone"]') || {}).value || '';
    const password = (qs('[data-act="reg-pw"]') || {}).value || '';
    const errEl = qs('#reg-err');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    try {
      const res = await fetch(apiOrigin() + '/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Pendaftaran gagal.');
      const hashAtSubmit = location.hash;
      S.auth = { token: data.token, user: data.user, loggedIn: true };
      saveAuth();
      await API.bootstrap();
      toast({ title: 'Akun berhasil dibuat', msg: 'Selamat datang, ' + data.user.name, tone: 'mint', icon: 'check', ms: 3000 });
      /* Bila pengguna sudah menavigasi sendiri selama menunggu server, hormati tujuannya. */
      if (location.hash === hashAtSubmit) go('beranda', 'c');
    } catch (err) { if (errEl) { errEl.hidden = false; errEl.textContent = err.message; } }
    return;
  }
  if (e.target.matches('[data-act="forgot-form"]')) {
    e.preventDefault();
    const login = (qs('[data-act="forgot-id"]') || {}).value || '';
    const errEl = qs('#forgot-err');
    const okEl = qs('#forgot-ok');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    if (okEl) { okEl.hidden = true; okEl.textContent = ''; }
    try {
      const res = await fetch(apiOrigin() + '/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal membuat token reset.');
      if (okEl) { okEl.hidden = false; okEl.textContent = 'Token reset: ' + data.resetToken + ' (salin dan gunakan di halaman reset)'; }
    } catch (err) { if (errEl) { errEl.hidden = false; errEl.textContent = err.message; } }
    return;
  }
  if (e.target.matches('[data-act="reset-form"]')) {
    e.preventDefault();
    const token = (qs('[data-act="reset-token"]') || {}).value || '';
    const newPassword = (qs('[data-act="reset-pw"]') || {}).value || '';
    const errEl = qs('#reset-err');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    try {
      const res = await fetch(apiOrigin() + '/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Reset gagal.');
      toast({ title: 'Password berhasil direset', msg: 'Silakan masuk dengan password baru', tone: 'mint', icon: 'check', ms: 3000 });
      go('loginC');
    } catch (err) { if (errEl) { errEl.hidden = false; errEl.textContent = err.message; } }
    return;
  }
  if (e.target.matches('[data-act="change-pw-form"]')) {
    e.preventDefault();
    const currentPassword = (qs('[data-act="cpw-old"]') || {}).value || '';
    const newPassword = (qs('[data-act="cpw-new"]') || {}).value || '';
    const errEl = qs('#cpw-err');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    try {
      const res = await fetch(apiOrigin() + '/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.auth.token },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal mengganti password.');
      toast({ title: 'Password berhasil diganti', msg: 'Gunakan password baru untuk masuk berikutnya', tone: 'mint', icon: 'check', ms: 3000 });
      doLogout();
    } catch (err) { if (errEl) { errEl.hidden = false; errEl.textContent = err.message; } }
    return;
  }
  if (e.target.matches('.quick-form')) { e.preventDefault(); ldTrack(); return; }
  if (e.target.matches('.scanner')) { e.preventDefault(); scanSubmit(); return; }
  if (e.target.matches('.signup')) { e.preventDefault(); ldSubmit(); return; }
  if (e.target.matches('[data-act="track-form"]')) { e.preventDefault(); trackCode = ((qs('[data-act="track-input"]') || {}).value || '').trim(); render(); }
  if (e.target.matches('.chat-in')) {
    e.preventDefault();
    const inp = qs('#chatq'); const v = (inp.value || '').trim(); if (!v) return;
    inp.value = '';
    if (typeof API !== 'undefined' && API.on && isCustomerAuthed()) {
      API.chat(v).then(() => paintChat()).catch((err) => apiToastErr(err, 'Pesan gagal terkirim'));
      return;
    }
    S.chat.push({ from: 'me', text: v });
    const hit = Object.entries(CHAT_REPLIES).find(([, k]) => v.toLowerCase().includes(k)) || null;
    setTimeout(() => {
      S.chat.push({ from: 'bot', text: hit ? CHAT_REPLIES[hit[1]] : 'Saya catat. Staff lantai akan balas di sini — rata-rata 40 detik. Sambil menunggu, Anda bisa lihat posisi cucian di tab Lacak.' });
      save(); paintChat();
    }, 700);
    save(); paintChat();
  }
});

document.addEventListener('keydown', (e) => {
  const typing = /input|textarea|select/i.test((e.target.tagName || ''));
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (e.key === 'Escape') { if (qs('#modalRoot.on')) { closeModal(); closePalette(); } if (qs('#drawerRoot.on')) closeDrawer(); qs('#notif-panel').classList.remove('on'); return; }
  if (typing) return;
  if (e.key === '/' || e.key.toLowerCase() === 'f') { e.preventDefault(); openPalette(); }
  if (e.key.toLowerCase() === 'n') { e.preventDefault(); S.cart = newCart(); go('order'); }
  if (e.key.toLowerCase() === 's') { e.preventDefault(); go('scan', 'a'); }
  if (e.key.toLowerCase() === 't') toggleTheme();
});

function tick() {
  if (typeof API !== 'undefined' && API.on) { renderTicker(); livePatch(); return; }
  S.machines.forEach((m) => {
    if (m.state === 'idle') return;
    const held = S.orders.find((o) => o.code === m.ticket);
    if (m.left > 0) m.left = Math.max(0, m.left - 1);
    m.temp = clamp(m.temp + (Math.random() * 2 - 1), 26, 132);
    if (m.left === 0 && !S.settings.pindaiSaja) {
      if (held && held.scanned) { m.state = 'vent'; return; }
      m.stage = (m.stage + 1) % STAGES.length;
      m.left = 12 + Math.floor(Math.random() * 40);
      m.rpm = 2 + Math.floor(Math.random() * 10);
      m.load = clamp(m.load + Math.round(Math.random() * 20 - 10), 0, 98);
    }
  });
  const active = visibleOrders().filter((o) => o.stage > 0 && o.stage < 8 && !o.scanned);
  if (S.portal === 'a' && !S.settings.pindaiSaja && active.length && Math.random() < 0.34) advanceStage(active[Math.floor(Math.random() * active.length)].code, true);
  save();
  renderTicker();
  livePatch();
  paintBell();
}

function livePatch() {
  const set = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
  const setW = (el, v) => { if (el) el.style.setProperty('--w', v); };

  qsa('[data-live="tile"]').forEach((tile) => {
    const m = S.machines.find((x) => x.id === tile.dataset.id);
    if (!m) return;
    const tone = m.state === 'idle' ? 'muted' : m.state === 'hot' ? 'orange' : m.state === 'vent' ? 'amber' : 'blue';
    tile.classList.remove('run', 'hot', 'vent', 'idle');
    tile.classList.add(m.state);
    tile.classList.remove('t-blue', 't-orange', 't-amber', 't-muted');
    tile.classList.add('t-' + tone);
    set(qs('[data-live="state"]', tile), m.state === 'run' ? 'berjalan' : m.state === 'hot' ? 'panas' : m.state === 'vent' ? 'venting' : 'siaga');
    const pill = qs('[data-live="pill"]', tile);
    if (pill) { pill.className = 'stage-pill s-' + m.stage; set(pill, STAGES[m.stage].label); }
    set(qs('[data-live="left"]', tile), '−' + clockStr(m.left));
    setW(qs('[data-live="loadbar"]', tile), m.load + '%');
    set(qs('[data-live="load"]', tile), m.load + '%');
    setW(qs('[data-live="heatbar"]', tile), clamp(m.temp / 140 * 100, 2, 100) + '%');
    set(qs('[data-live="temp"]', tile), Math.round(m.temp) + '°');
  });

  qsa('[data-live]').forEach((n) => {
    const id = n.dataset.id;
    if (!id) return;
    if (n.dataset.live === 'left') { const m = S.machines.find((x) => x.id === id); if (m) n.textContent = '−' + clockStr(m.left); }
    if (n.dataset.live === 'stage') { const m = S.machines.find((x) => x.id === id); if (m) n.textContent = STAGES[m.stage].label; }
    if (n.dataset.live === 'temp') { const m = S.machines.find((x) => x.id === id); if (m) n.textContent = Math.round(m.temp) + '°C'; }
    if (n.dataset.live === 'order') { const o = S.orders.find((x) => x.code === id); if (o) { n.className = 'stage-pill s-' + o.stage; n.textContent = STAGES[o.stage].label; } }
    if (n.dataset.live === 'prog') { const o = S.orders.find((x) => x.code === id); if (o) n.style.setProperty('--w', Math.round(o.stage / (STAGES.length - 1) * 100) + '%'); }
    if (n.dataset.live === 'step') { const o = S.orders.find((x) => x.code === id); if (o) n.textContent = (o.stage + 1) + '/' + STAGES.length; }
    if (n.dataset.live === 'eta') { const o = S.orders.find((x) => x.code === id); if (o) n.textContent = etaFor(o.stage, o.priority); }
  });
}

function startClock() {
  const c = qs('#clock');
  const f = () => { const d = new Date(); c.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  f(); setInterval(f, 1000);
}

function applySvc() {
  Object.keys(S.svc || {}).forEach((id) => {
    const s = CATALOG.find((c) => c.id === id);
    if (s) Object.assign(s, S.svc[id]);
  });
}

function boot() {
  load();
  loadAuth();
  applySvc();
  /* Lapis kedua: data lama/rusak tidak boleh mematikan render — isi ulang
     bidang yang hilang/rusak dengan nilai aman, dan kembalikan seed bila
     kosong. */
  const padCode = (n) => String(n).padStart(4, '0');
  if (!Array.isArray(S.orders)) S.orders = SEED.orders.map((o) => ({ ...o }));
  S.orders = S.orders.filter((o) => o && typeof o === 'object').map((o, i) => Object.assign({
    code: 'BUSA-' + padCode(1000 + i),
    customer: 'Pelanggan',
    stage: 0,
    total: 0,
    weight: 1,
    items: [],
    machine: '—',
    priority: 'reguler',
    mode: 'pickup',
    slot: { date: todayISO(), time: SLOTS[2] },
    created: 'Hari ini',
    courier: '—',
    notes: '',
    stageAt: Date.now(),
    collected: false,
    scanned: true,
    pay: 'cash',
    addons: {},
    protect: false,
  }, o));
  if (!S.orders.length) S.orders = SEED.orders.map((o) => ({ ...o }));

  if (!Array.isArray(S.machines)) S.machines = SEED.machines.map((m) => ({ ...m }));
  S.machines = S.machines.filter((m) => m && typeof m === 'object').map((m, i) => Object.assign({
    id: 'M-0' + ((i % 8) + 1),
    model: 'Front Load 8 kg',
    state: 'idle',
    stage: 0,
    left: 0,
    temp: 30,
    rpm: 0,
    load: 0,
    kind: 'wash',
    cap: 8,
    ticket: '—',
  }, m));
  if (!S.machines.length) S.machines = SEED.machines.map((m) => ({ ...m }));

  const base = nowMs();
  S.orders.forEach((o, i) => { if (!o.stageAt) o.stageAt = base - (i + 1) * 4 * 60000; });
  if (!Array.isArray(S.events)) S.events = [];
  document.body.dataset.theme = S.theme;
  qs('#theme-btn').innerHTML = icon(S.theme === 'bone' ? 'moon' : 'sun');
  const r = parseHash();
  let view = VIEWS[r.view] ? r.view : 'landing';
  let portal = VIEWS[r.view] ? r.portal : 'landing';
  const publicViews = ['loginC', 'loginA', 'register', 'forgot', 'resetPassword'];
  if (!publicViews.includes(view)) {
    if (portal === 'c' && !isCustomerAuthed()) { view = 'loginC'; portal = 'c'; }
    if (portal === 'a' && !isAdminAuthed()) { view = 'loginA'; portal = 'a'; }
    if (view === 'changePassword' && !isAuthed()) { view = 'loginC'; portal = 'c'; }
  }
  S.portal = portal;
  S.route = view;
  if (window.history && window.history.replaceState) window.history.replaceState(null, '', routeHash(S.portal, S.route));
  qs('#ticker-track').addEventListener('mouseenter', (e) => e.currentTarget.classList.add('pause'));
  qs('#ticker-track').addEventListener('mouseleave', (e) => e.currentTarget.classList.remove('pause'));
  render();
  startClock();
  setInterval(tick, 7000);
  if (typeof API !== 'undefined') API.init();
  if (typeof API !== 'undefined' && API.loadLive) {
    API.loadLive();
    /* Halaman situs: segarkan papan publik berkala (login atau tidak). */
    setInterval(() => { if (S.portal === 'landing') API.loadLive(); }, 30000);
  }
  setTimeout(() => {
    if (!REDUCED) bubbles(8);
    if (S.portal === 'a' && isAdminAuthed()) toast({ title: 'Lantai siap', msg: S.machines.filter((m) => m.state !== 'idle').length + ' mesin berjalan · ' + S.orders.length + ' pesanan aktif', tone: 'blue', icon: 'drum', ms: 5000 });
  }, 900);
}

window.addEventListener('hashchange', () => {
  const r = parseHash();
  const view = VIEWS[r.view] ? r.view : 'landing';
  const portal = VIEWS[r.view] ? r.portal : 'landing';
  if (portal !== S.portal || view !== S.route) { S.portal = portal; S.route = view; render(); }
});
document.addEventListener('DOMContentLoaded', boot);
