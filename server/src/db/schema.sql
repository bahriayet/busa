-- BUSA Laundry Ops — skema PostgreSQL (Neon).
--
-- `order_events` adalah sumber kebenaran: append-only, bernomor urut, dan
-- setiap perubahan tahap cucian harus lewat satu baris di sana. Tabel `orders`
-- dan `machines` adalah proyeksi yang diperbarui dalam transaksi yang sama.
-- Idempoten: aman dijalankan berulang kali.
--
-- Kolom waktu (ms sejak epoch) memakai BIGINT karena melewati batas INTEGER.
-- Kolom boolean dipertahankan INTEGER 0/1 agar pemetaan domain tidak berubah.

CREATE TABLE IF NOT EXISTS schema_meta (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  role         TEXT NOT NULL CHECK (role IN ('admin','staff','customer')),
  name         TEXT NOT NULL,
  phone        TEXT UNIQUE,
  phone_digits TEXT UNIQUE,
  username     TEXT UNIQUE,
  pass_salt    TEXT NOT NULL,
  pass_hash    TEXT NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1,
  created_ms   BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id         TEXT PRIMARY KEY,
  user_id    TEXT UNIQUE,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  tier       TEXT NOT NULL DEFAULT 'basic',
  tier_ms    BIGINT,
  renews_ms  BIGINT,
  stamps     INTEGER NOT NULL DEFAULT 0,
  balance    INTEGER NOT NULL DEFAULT 0,
  is_walkin  INTEGER NOT NULL DEFAULT 0,
  created_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

CREATE TABLE IF NOT EXISTS addresses (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  tag         TEXT NOT NULL,
  label       TEXT NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_addresses_cust ON addresses(customer_id);

CREATE TABLE IF NOT EXISTS services (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  unit          TEXT NOT NULL CHECK (unit IN ('kg','pcs','pasang')),
  price         INTEGER NOT NULL CHECK (price >= 0),
  hours         INTEGER NOT NULL CHECK (hours >= 1),
  icon          TEXT NOT NULL DEFAULT 'shirt',
  tone          TEXT NOT NULL DEFAULT 'blue',
  descr         TEXT NOT NULL DEFAULT '',
  includes_json TEXT NOT NULL DEFAULT '[]',
  active        INTEGER NOT NULL DEFAULT 1,
  sort          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS addons (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  price  INTEGER NOT NULL CHECK (price >= 0),
  kind   TEXT NOT NULL CHECK (kind IN ('flat','kg')),
  icon   TEXT NOT NULL DEFAULT 'spark',
  note   TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  sort   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS machines (
  id       TEXT PRIMARY KEY,
  model    TEXT NOT NULL,
  cap      INTEGER NOT NULL CHECK (cap > 0),
  kind     TEXT NOT NULL CHECK (kind IN ('wash','dry','steam','dryclean')),
  stage    INTEGER NOT NULL DEFAULT 0,
  rpm      INTEGER NOT NULL DEFAULT 0,
  temp     DOUBLE PRECISION NOT NULL DEFAULT 26,
  load_pct INTEGER NOT NULL DEFAULT 0,
  left_min DOUBLE PRECISION NOT NULL DEFAULT 0,
  ticket   TEXT,
  state    TEXT NOT NULL DEFAULT 'idle' CHECK (state IN ('run','hot','vent','idle')),
  sort     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  code          TEXT PRIMARY KEY,
  customer_id   TEXT,
  customer      TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  stage         INTEGER NOT NULL DEFAULT 0,
  weight        DOUBLE PRECISION NOT NULL DEFAULT 0,
  mode          TEXT NOT NULL DEFAULT 'pickup' CHECK (mode IN ('pickup','delivery','drop')),
  items_json    TEXT NOT NULL DEFAULT '[]',
  addons_json   TEXT NOT NULL DEFAULT '[]',
  subtotal      INTEGER NOT NULL DEFAULT 0,
  ship          INTEGER NOT NULL DEFAULT 0,
  disc          INTEGER NOT NULL DEFAULT 0,
  protect_fee   INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL DEFAULT 0,
  promo_code    TEXT,
  pay           TEXT NOT NULL DEFAULT 'cash' CHECK (pay IN ('wallet','qris','cash')),
  pay_status    TEXT NOT NULL DEFAULT 'belum' CHECK (pay_status IN ('lunas','belum','sebagian','dikembalikan')),
  priority      TEXT NOT NULL DEFAULT 'reguler' CHECK (priority IN ('reguler','express')),
  slot_date     TEXT NOT NULL DEFAULT '',
  slot_time     TEXT NOT NULL DEFAULT '',
  courier       TEXT NOT NULL DEFAULT '—',
  machine       TEXT NOT NULL DEFAULT '—',
  rack          TEXT,
  notes         TEXT NOT NULL DEFAULT '',
  collected     INTEGER NOT NULL DEFAULT 0,
  cancelled     INTEGER NOT NULL DEFAULT 0,
  scanned       INTEGER NOT NULL DEFAULT 0,
  created_ms    BIGINT NOT NULL,
  created_label TEXT NOT NULL DEFAULT '',
  stage_at_ms   BIGINT,
  source        TEXT NOT NULL DEFAULT 'seed' CHECK (source IN ('seed','api','lokal'))
);
CREATE INDEX IF NOT EXISTS idx_orders_stage ON orders(stage);
CREATE INDEX IF NOT EXISTS idx_orders_cust ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_ms DESC);

-- Log event lantai. Append-only: tidak ada UPDATE kecuali kolom idempotensi.
-- `seq` diisi eksplisit oleh counter aplikasi, bukan identity PostgreSQL.
CREATE TABLE IF NOT EXISTS order_events (
  seq        BIGINT PRIMARY KEY,
  id         TEXT NOT NULL UNIQUE,
  client_id  TEXT UNIQUE,
  order_code TEXT NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('terima','muat','tahap','lepas','qc','selesai')),
  machine    TEXT,
  stage_from INTEGER NOT NULL,
  stage_to   INTEGER NOT NULL,
  actor      TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  client_ms  BIGINT,
  at_ms      BIGINT NOT NULL,
  clock      TEXT NOT NULL DEFAULT '',
  origin     TEXT NOT NULL DEFAULT 'api'
);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_code, seq DESC);
CREATE INDEX IF NOT EXISTS idx_events_at ON order_events(at_ms DESC);

CREATE TABLE IF NOT EXISTS wallet_tx (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('pay','topup','cashback','refund','sub')),
  label       TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  at_ms       BIGINT NOT NULL,
  at_label    TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'sukses',
  order_code  TEXT,
  source      TEXT NOT NULL DEFAULT 'seed'
);
CREATE INDEX IF NOT EXISTS idx_tx_cust ON wallet_tx(customer_id, at_ms DESC);

-- `terms` adalah kalimat yang dibaca pelanggan. Kolom min_*/requires_*/excludes_*
-- adalah bentuk mesin dari kalimat itu, ditegakkan oleh mesin pricing.
CREATE TABLE IF NOT EXISTS promos (
  code             TEXT PRIMARY KEY,
  kind             TEXT NOT NULL CHECK (kind IN ('pct','flat')),
  value            INTEGER NOT NULL,
  cap              INTEGER NOT NULL DEFAULT 0,
  label            TEXT NOT NULL,
  terms            TEXT NOT NULL DEFAULT '',
  active           INTEGER NOT NULL DEFAULT 1,
  min_kg           DOUBLE PRECISION NOT NULL DEFAULT 0,
  min_sub          INTEGER NOT NULL DEFAULT 0,
  courier_only     INTEGER NOT NULL DEFAULT 0,
  requires_service TEXT NOT NULL DEFAULT '',
  excludes_addon   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS staff (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  role   TEXT NOT NULL DEFAULT '',
  done   INTEGER NOT NULL DEFAULT 0,
  rating DOUBLE PRECISION NOT NULL DEFAULT 5,
  tag    TEXT NOT NULL DEFAULT '',
  sort   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS areas (
  kode      TEXT PRIMARY KEY,
  kec       TEXT NOT NULL,
  eta       TEXT NOT NULL DEFAULT '',
  slot_cap  INTEGER NOT NULL DEFAULT 4,
  radius_km DOUBLE PRECISION NOT NULL DEFAULT 8
);

CREATE TABLE IF NOT EXISTS tiers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  price      INTEGER NOT NULL DEFAULT 0,
  unit       TEXT NOT NULL DEFAULT '',
  tone       TEXT NOT NULL DEFAULT 'blue',
  best       TEXT NOT NULL DEFAULT '',
  perks_json TEXT NOT NULL DEFAULT '[]',
  kg_quota   INTEGER NOT NULL DEFAULT 0,
  sort       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  customer_id TEXT,
  tone        TEXT NOT NULL DEFAULT 'blue',
  icon        TEXT NOT NULL DEFAULT 'drum',
  title       TEXT NOT NULL,
  msg         TEXT NOT NULL DEFAULT '',
  at_ms       BIGINT NOT NULL,
  at_label    TEXT NOT NULL DEFAULT '',
  is_read     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notif_cust ON notifications(customer_id, at_ms DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          TEXT PRIMARY KEY,
  customer_id TEXT,
  sender      TEXT NOT NULL CHECK (sender IN ('bot','me','staff')),
  body        TEXT NOT NULL,
  at_ms       BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_cust ON chat_messages(customer_id, at_ms DESC);

CREATE TABLE IF NOT EXISTS daily_revenue (
  day          TEXT PRIMARY KEY,
  gross        BIGINT NOT NULL DEFAULT 0,
  orders_count INTEGER NOT NULL DEFAULT 0,
  source       TEXT NOT NULL DEFAULT 'seed' CHECK (source IN ('seed','live'))
);

CREATE TABLE IF NOT EXISTS content (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- Token yang sudah di-blacklist (logout). Dihapus otomatis saat expired.
CREATE TABLE IF NOT EXISTS token_blacklist (
  jti        TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blacklist_expires ON token_blacklist(expires_at);

-- Token reset password. Berlaku 30 menit, dihapus setelah dipakai.
CREATE TABLE IF NOT EXISTS password_resets (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_ms BIGINT NOT NULL,
  expires_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pwresets_user ON password_resets(user_id);
