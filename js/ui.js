const ICONS = {
  drum: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.2"/><path d="M12 3v1.7M12 19.3V21M3 12h1.7M19.3 12H21M5.6 5.6l1.2 1.2M17.2 17.2l1.2 1.2M18.4 5.6l-1.2 1.2M6.8 17.2l-1.2 1.2"/>',
  shirt: '<path d="M8.5 3 4 5.5 5.6 9 8 7.9V21h8V7.9L20.4 9 22 5.5 17.5 3l-2.6 2h-3.8z"/><path d="M12 5.5V9"/>',
  drop: '<path d="M12 3.2c3.2 4 5.6 6.5 5.6 9.6a5.6 5.6 0 1 1-11.2 0c0-3.1 2.4-5.6 5.6-9.6z"/><path d="M9.4 14.6a2.7 2.7 0 0 0 2.6 2.2"/>',
  water: '<path d="M3 13.5c2 0 2.6-2 4.6-2s2.6 2 4.6 2 2.6-2 4.6-2 2.6 2 4.6 2"/><path d="M3 18c2 0 2.6-2 4.6-2s2.6 2 4.6 2 2.6-2 4.6-2 2.6 2 4.6 2"/><path d="M6.5 9.5C8 7.4 9.8 6.2 12 6.2s4 1.2 5.5 3.3"/>',
  wind: '<path d="M3 8h9.5a2.5 2.5 0 1 0-2.5-2.6"/><path d="M3 12.5h13.2a2.7 2.7 0 1 1-2.7 2.8"/><path d="M3 17h7.2"/>',
  iron: '<path d="M4 15.5c0-4.3 3.2-7.5 8.4-7.5H19c1.4 0 2 .9 2 2v5.5z"/><path d="M3 19.5h18"/><path d="M8.5 8 10 4.6"/>',
  suit: '<path d="M8 3l4 4 4-4 3.4 3.2L17 9.4V21H7V9.4L3.6 6.2z"/><path d="M12 7v13"/>',
  shoe: '<path d="M3 17.2h18v3.2H3z"/><path d="M3 17.2l2.6-6.4 4 1.6L13 9.2l4 3.2 4 .6v4.2"/><path d="M6.6 13.6l1.4 1.4M10 13l1.4 1.4"/>',
  blanket: '<path d="M4 6.5c2.7 0 2.7 2 5.3 2s2.7-2 5.4-2 2.6 2 5.3 2"/><path d="M4 11.5c2.7 0 2.7 2 5.3 2s2.7-2 5.4-2 2.6 2 5.3 2"/><path d="M4 16.5c2.7 0 2.7 2 5.3 2s2.7-2 5.4-2 2.6 2 5.3 2"/>',
  bolt: '<path d="M13.4 3 11.8 9H19l-8.6 12 1.6-6.2H5.6z"/>',
  spark: '<path d="M11 3.4l1.7 4.8 4.8 1.7-4.8 1.7L11 16.4l-1.7-4.8L4.5 9.9l4.8-1.7z"/><path d="M18.6 14.6l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  leaf: '<path d="M5 19.5C5 10.5 11.8 5 20 5c0 8.2-5.2 14.5-14 14.5"/><path d="M5.5 19c3-3.2 6.2-5.2 9.5-6.4"/>',
  box: '<path d="M4 8.2l8-4.2 8 4.2v8.6l-8 4.2-8-4.2z"/><path d="M4 8.2l8 4.2 8-4.2M12 12.4v8.8"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>',
  tag: '<path d="M12.4 3H5.6A2.6 2.6 0 0 0 3 5.6v6.8l11.2 11.2 9-9z"/><circle cx="8" cy="8" r="1.6"/>',
  check: '<path d="M4.4 12.6 9.2 17.4 19.8 6.6"/>',
  star: '<path d="M12 3.4l2.7 5.8 6.3.8-4.6 4.4 1.2 6.2L12 17.6l-5.6 3.1 1.2-6.2L3 10.1l6.3-.8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.6"/><path d="M15.8 15.8 20.4 20.4"/>',
  x: '<path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8"/>',
  clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7v5.4l4 2.3"/>',
  truck: '<path d="M2.4 6.6h10.8v9.8H2.4z"/><path d="M13.2 9.8h4.4l3 3.4v3.2h-7.4"/><circle cx="6.6" cy="18.6" r="2"/><circle cx="17" cy="18.6" r="2"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2.6"/><path d="M3 10.4h18"/><circle cx="17.2" cy="15" r="1.4"/>',
  chart: '<path d="M4.4 20.4V10M10 20.4V4M15.6 20.4v-7M21.4 20.4H2.6"/>',
  gear: '<circle cx="12" cy="12" r="3.3"/><path d="M12 2.6l1.3 2.7 3-.7.7 3 2.7 1.3-1.5 2.6 1.5 2.6-2.7 1.3-.7 3-3-.7L12 21.4l-1.3-2.7-3 .7-.7-3-2.7-1.3L2.8 13.2l-1.5-2.6 2.7-1.3.7-3 3 .7z"/>',
  user: '<circle cx="12" cy="8.4" r="3.9"/><path d="M4.4 20.6c1.4-4 4-5.8 7.6-5.8s6.2 1.8 7.6 5.8"/>',
  bell: '<path d="M6 16V10a6 6 0 1 1 12 0v6l2 2.6H4z"/><path d="M9.8 21a2.4 2.4 0 0 0 4.4 0"/>',
  chev: '<path d="M9 5.5 15.5 12 9 18.5"/>',
  arrow: '<path d="M4 12h15M13.2 6.2 19 12l-5.8 5.8"/>',
  flame: '<path d="M12 3c2 4 5.6 5.6 5.6 9.6a5.6 5.6 0 1 1-11.2 0C6.4 9.2 9 8.2 9 5c1.6 1 2.4 2.5 3 4"/>',
  basket: '<path d="M3 9.4h18l-2 11.2H5z"/><path d="M8 9.4 10 4.4M16 9.4 14 4.4"/><path d="M9.2 13.4v4M14.8 13.4v4"/>',
  alert: '<path d="M12 4 21 20H3z"/><path d="M12 10v4.6M12 17.6v.01"/>',
  copy: '<rect x="9" y="9" width="11.4" height="11.4" rx="2"/><path d="M15 5.6A2.6 2.6 0 0 0 12.4 3H5.6A2.6 2.6 0 0 0 3 5.6v6.8"/>',
  moon: '<path d="M20 14.6A8.6 8.6 0 1 1 9.4 4a7.2 7.2 0 0 0 10.6 10.6z"/>',
  sun: '<circle cx="12" cy="12" r="4.6"/><path d="M12 2.6v2.3M12 19.1v2.3M2.6 12h2.3M19.1 12h2.3M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7"/>',
  filter: '<path d="M3 5.4h18l-7 8.4v6.2l-4-2.2v-4z"/>',
  download: '<path d="M12 4v11M7.4 11 12 15.6 16.6 11"/><path d="M4 20.4h16"/>',
  upload: '<path d="M12 16V5M7.4 9.6 12 5l4.6 4.6"/><path d="M4 20.4h16"/>',
  phone: '<path d="M5 3.6h3.6l1.6 4-2.1 1.4c1 2.6 3.5 5 6 6l1.5-2.1 4 1.6v3.6c0 1.4-1 2.4-2.4 2.3C10 19.9 4.1 14 3.7 6 3.6 4.6 4.6 3.6 5 3.6z"/>',
  pin: '<path d="M12 21.2c4.1-5.4 6.2-8.4 6.2-11A6.2 6.2 0 1 0 5.8 10.2c0 2.6 2.1 5.6 6.2 11z"/><circle cx="12" cy="10.2" r="2.3"/>',
  mail: '<rect x="3" y="5.4" width="18" height="13.2" rx="2.2"/><path d="M3.9 7 12 13l8.1-6"/>',
  send: '<path d="M3.6 12 20.4 4l-6 16-3.6-6.6z"/><path d="M10.8 13.4 20.4 4"/>',
  calendar: '<rect x="3.4" y="5.4" width="17.2" height="15.2" rx="2.2"/><path d="M3.4 10.2h17.2M8 3.4v4M16 3.4v4"/>',
  pause: '<path d="M9 5.4v13.2M15 5.4v13.2"/>',
  play: '<path d="M7 4.6 19 12 7 19.4z"/>',
  hash: '<path d="M9.4 3.4 7.8 20.6M16.6 3.4 15 20.6M3.4 9.2h17.2M2.8 14.8H20"/>',
  ruler: '<path d="M3 15 15 3l6 6L9 21z"/><path d="M7 11l2 2M10 8l2 2M13 5l2 2"/>',
  scent: '<path d="M9 21h6l.8-6.4H8.2z"/><path d="M12 14.6V9M12 9c-2 0-3-1.4-3-3M12 9c2 0 3-1.4 3-3M12 6V3"/>',
  hanger: '<path d="M12 3.6a2.2 2.2 0 0 1 2.2 2.2c0 1.6-2.2 2-2.2 3.4"/><path d="M12 9.2 3.4 15.4c-1 .8-.5 2.2.7 2.2h15.8c1.2 0 1.7-1.4.7-2.2z"/>',
  store: '<path d="M4 9.5h16V20H4z"/><path d="M3 9.5 5 4h14l2 5.5"/><path d="M9 20v-6h6v6"/>',
  shield: '<path d="M12 3.2 20 6v6.2c0 4-3.2 6.9-8 8.6-4.8-1.7-8-4.6-8-8.6V6z"/><path d="M8.8 12.2 11.4 15l4-5"/>',
  info: '<circle cx="12" cy="12" r="8.8"/><path d="M12 11v6M12 7.6v.01"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15.5" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  eye: '<path d="M2.6 12S6 5.6 12 5.6 21.4 12 21.4 12 18 18.4 12 18.4 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="3"/>',
  scan: '<path d="M4 8V5.6A1.6 1.6 0 0 1 5.6 4H8M16 4h2.4A1.6 1.6 0 0 1 20 5.6V8M20 16v2.4a1.6 1.6 0 0 1-1.6 1.6H16M8 20H5.6A1.6 1.6 0 0 1 4 18.4V16"/><path d="M4 12h16"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7"/><path d="M12 14v3"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20.4 4.2v4.4h-4.4"/>',
  ring: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
  key: '<circle cx="8" cy="15" r="4.5"/><path d="M10.8 12.2 21 3"/><path d="M18 6l3 3"/><path d="M15 3l3 3"/>',
};

function icon(name, cls) {
  const d = ICONS[name] || ICONS.drum;
  return `<svg class="ico ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const kg = (n) => (Math.round(n * 10) / 10).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const pad = (n) => String(n).padStart(2, '0');
const clockStr = (min) => `${pad(Math.floor(min / 60))}:${pad(Math.round(min % 60))}`;
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowClock = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function initials(name) {
  return String(name || '?').split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

const qs = (s, r) => (r || document).querySelector(s);
const qsa = (s, r) => Array.from((r || document).querySelectorAll(s));

function drumMarkup(opt) {
  const o = opt || {};
  const rags = Array.from({ length: o.rags || 7 }).map((_, i) => {
    const a = (i * 360) / (o.rags || 7) + (i % 3) * 11;
    const rad = 22 + ((i * 27) % 26);
    const sz = 9 + ((i * 13) % 12);
    return `<i class="rag r${i % 4}" style="--a:${a}deg;--r:${rad}%;--s:${sz}px"></i>`;
  }).join('');
  return `<div class="drum ${o.state || 'run'}" style="--rpm:${o.rpm || 6}s;--sz:${o.size || 100}px;--heat:${o.heat || 0}" data-drum>
    <div class="drum-body">
      <div class="drum-hole"></div>
      <div class="drum-tumble">${rags}</div>
      <div class="drum-glass"></div>
    </div>
    <span class="drum-led"></span>
    ${o.screws === false ? '' : '<b class="screw s1"></b><b class="screw s2"></b><b class="screw s3"></b><b class="screw s4"></b>'}
  </div>`;
}

function barsSVG(data, opt) {
  const o = opt || {};
  const w = o.w || 620, h = o.h || 170, gap = o.gap || 7;
  const max = Math.max(...data.map((d) => d.v)) || 1;
  const bw = (w - gap * (data.length - 1)) / data.length;
  const bars = data.map((d, i) => {
    const bh = Math.max(6, (d.v / max) * (h - 26));
    return `<g class="bar-g" style="--i:${i}">
      <rect class="bar" x="${(i * (bw + gap)).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2"><title>${esc(d.d)} · ${rp(d.v * 1000)}</title></rect>
      <text class="bar-lbl" x="${(i * (bw + gap) + bw / 2).toFixed(1)}" y="${h - 4}" text-anchor="middle">${esc(d.d)}</text>
    </g>`;
  }).join('');
  return `<svg class="chart bars" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Grafik pendapatan 14 hari">${bars}</svg>`;
}

function areaSVG(data) {
  const w = 520, h = 120, max = Math.max(...data.map((d) => d.v)) || 1;
  const pts = data.map((d, i) => [(i * w) / (data.length - 1), h - 8 - (d.v / max) * (h - 26)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const dots = pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1)
    .map((p) => `<circle class="pt" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6"/>`).join('');
  return `<svg class="chart area" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path class="area-fill" d="${area}"/><path class="area-line" d="${line}"/>${dots}</svg>`;
}

function donutSVG(mix) {
  const r = 54, c = 2 * Math.PI * r;
  let off = 0;
  const segs = mix.map((m, i) => {
    const len = (m.pct / 100) * c;
    const s = `<circle class="dseg t-${m.tone}" cx="70" cy="70" r="${r}" stroke-dasharray="${len.toFixed(1)} ${(c - len).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" style="--i:${i}"><title>${esc(m.label)} ${m.pct}%</title></circle>`;
    off += len;
    return s;
  }).join('');
  return `<svg class="chart donut" viewBox="0 0 140 140" role="img" aria-label="Komposisi layanan">${segs}
    <text class="donut-c" x="70" y="66" text-anchor="middle">6</text><text class="donut-s" x="70" y="82" text-anchor="middle">mesin aktif</text></svg>`;
}

function gaugeSVG(pct, tone) {
  const r = 30, c = 2 * Math.PI * r;
  return `<svg class="chart gauge t-${tone || 'blue'}" viewBox="0 0 80 80" aria-hidden="true">
    <circle class="g-bg" cx="40" cy="40" r="${r}"/>
    <circle class="g-val" cx="40" cy="40" r="${r}" stroke-dasharray="${((pct / 100) * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 40 40)"/>
    <text x="40" y="45" text-anchor="middle">${Math.round(pct)}%</text></svg>`;
}

function timelineMarkup(stage, code) {
  return `<ol class="tl">` + STAGES.map((s, i) => {
    const st = i < stage ? 'done' : i === stage ? 'now' : 'todo';
    return `<li class="tl-i ${st}" style="--i:${i}">
      <span class="tl-dot">${icon(st === 'now' ? 'drum' : s.icon)}</span>
      <div class="tl-txt"><b>${i + 1}. ${esc(s.label)}</b><p>${esc(s.note)}</p></div>
      ${st === 'now' ? `<span class="tl-live" data-scramble="${esc(code)}">${esc(code)}</span>` : ''}
    </li>`;
  }).join('') + `</ol>`;
}

let toastN = 0;
function toast(opt) {
  const o = opt || {};
  const wrap = qs('#toasts');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast t-${o.tone || 'blue'} ${o.kind || ''}`;
  el.innerHTML = `<span class="toast-i">${icon(o.icon || 'check')}</span>
    <div><b>${esc(o.title || '')}</b>${o.msg ? `<p>${esc(o.msg)}</p>` : ''}</div>
    <button class="toast-x" data-act="toast-close" aria-label="Tutup">${icon('x')}</button>`;
  wrap.appendChild(el);
  const id = ++toastN;
  el.dataset.id = id;
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 460);
  }, o.ms || 4200);
}

function openModal(html, opt) {
  const o = opt || {};
  const root = qs('#modalRoot');
  root.innerHTML = `<div class="scrim" data-act="modal-close"></div>
    <div class="modal ${o.wide ? 'wide' : ''}" role="dialog" aria-modal="true"><button class="modal-x" data-act="modal-close" aria-label="Tutup">${icon('x')}</button>${html}</div>`;
  root.classList.add('on');
  document.body.classList.add('locked');
  const focus = qs('input,select,textarea,button:not(.modal-x)', root);
  if (focus && !REDUCED) setTimeout(() => focus.focus(), 60);
}
function closeModal() {
  const root = qs('#modalRoot');
  root.classList.remove('on');
  root.innerHTML = '';
  if (!qs('#drawerRoot.on')) document.body.classList.remove('locked');
}

function openDrawer(html, opt) {
  const o = opt || {};
  const root = qs('#drawerRoot');
  root.innerHTML = `<div class="scrim" data-act="drawer-close"></div>
    <aside class="drawer ${o.wide ? 'wide' : ''}">${html}</aside>`;
  root.classList.add('on');
  document.body.classList.add('locked');
}
function closeDrawer() {
  const root = qs('#drawerRoot');
  root.classList.remove('on');
  root.innerHTML = '';
  if (!qs('#modalRoot.on')) document.body.classList.remove('locked');
}

function bubbles(n) {
  if (REDUCED) return;
  const layer = qs('#suds');
  if (!layer) return;
  for (let i = 0; i < (n || 14); i++) {
    const b = document.createElement('span');
    const sz = 6 + Math.random() * 22;
    b.style.cssText = `left:${Math.random() * 100}%;width:${sz}px;height:${sz}px;--dur:${(2.4 + Math.random() * 3.4).toFixed(2)}s;--drift:${(Math.random() * 160 - 80).toFixed(0)}px;--dl:${(Math.random() * 700).toFixed(0)}ms`;
    b.className = 'sud';
    layer.appendChild(b);
    setTimeout(() => b.remove(), 6600);
  }
}

const SCR_CHARS = '▚▞▓░#@%&*ABCDEFGHKMNRSTVXZ0123456789';
function scrambleTo(node, text, ms) {
  if (REDUCED) { node.textContent = text; return; }
  const total = ms || 700;
  const start = performance.now();
  const len = text.length;
  function tick(now) {
    const p = clamp((now - start) / total, 0, 1);
    const done = Math.floor(p * len);
    let out = '';
    for (let i = 0; i < len; i++) {
      if (i < done || text[i] === ' ' || text[i] === '-') out += text[i];
      else out += SCR_CHARS[(Math.random() * SCR_CHARS.length) | 0];
    }
    node.textContent = out;
    if (p < 1) requestAnimationFrame(tick);
    else node.textContent = text;
  }
  requestAnimationFrame(tick);
}

let io = null;
function initReveal(root) {
  const scope = root || document;
  const items = qsa('[data-reveal]:not(.in)', scope);
  if (REDUCED || !('IntersectionObserver' in window)) {
    items.forEach((i) => i.classList.add('in'));
    qsa('[data-scramble]', scope).forEach((n) => scrambleTo(n, n.dataset.scramble, 1));
    return;
  }
  if (!io) io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      const sc = e.target.matches('[data-scramble]') ? e.target : qs('[data-scramble]', e.target);
      if (sc && !sc.dataset.done) { sc.dataset.done = '1'; scrambleTo(sc, sc.dataset.scramble, 620); }
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  items.forEach((el, i) => { if (!el.style.getPropertyValue('--i')) el.style.setProperty('--i', i % 14); io.observe(el); });
}
