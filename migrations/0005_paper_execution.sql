-- V1.3: Alpaca PAPER-only automation; all existing 0001-0004 tables remain unchanged.
-- Disabled by default; only explicitly armed in the Cloudflare secret + dashboard.
CREATE TABLE IF NOT EXISTS paper_runtime (
 id INTEGER PRIMARY KEY CHECK (id=1),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 paused_reason TEXT NOT NULL DEFAULT 'Disattivato fino al collaudo',
 day_key TEXT,
 day_start_equity REAL,
 changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 changed_by TEXT NOT NULL DEFAULT 'migration'
);
INSERT OR IGNORE INTO paper_runtime (id,enabled) VALUES (1,0);
CREATE TABLE IF NOT EXISTS paper_execution_lock (
 name TEXT PRIMARY KEY,
 owner TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS paper_trades (
 id TEXT PRIMARY KEY NOT NULL,
 symbol TEXT NOT NULL,
 bar_ts TEXT NOT NULL,
 trade_date TEXT NOT NULL,
 source_event TEXT NOT NULL,
 proposal_id TEXT,
 client_order_id TEXT NOT NULL UNIQUE,
 alpaca_order_id TEXT UNIQUE,
 order_status TEXT NOT NULL DEFAULT 'RESERVED',
 qty INTEGER NOT NULL CHECK(qty>0),
 limit_price REAL NOT NULL CHECK(limit_price>0),
 stop_price REAL NOT NULL CHECK(stop_price>0),
 target_price REAL NOT NULL CHECK(target_price>0),
 expected_risk REAL NOT NULL,
 expected_gain REAL NOT NULL,
 skeptic_reasons_json TEXT NOT NULL,
 rationale TEXT NOT NULL,
 entry_filled_qty REAL NOT NULL DEFAULT 0,
 entry_avg_price REAL,
 exit_filled_qty REAL NOT NULL DEFAULT 0,
 exit_total_value REAL NOT NULL DEFAULT 0,
 exit_avg_price REAL,
 realized_pnl REAL NOT NULL DEFAULT 0,
 last_sync_at TEXT,
 submitted_at TEXT,
 closed_at TEXT,
 error_detail TEXT,
 created_at TEXT NOT NULL,
 UNIQUE(symbol,bar_ts,source_event)
);
CREATE INDEX IF NOT EXISTS idx_paper_trade_date ON paper_trades(trade_date, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paper_trade_status ON paper_trades(order_status, created_at DESC);
CREATE TABLE IF NOT EXISTS paper_trade_events (
 id TEXT PRIMARY KEY NOT NULL,
 trade_id TEXT,
 event_key TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL,
 message TEXT NOT NULL,
 delivery_state TEXT NOT NULL DEFAULT 'PENDING',
 attempts INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER,
 created_at TEXT NOT NULL,
 sent_at TEXT,
 last_error TEXT,
 FOREIGN KEY(trade_id) REFERENCES paper_trades(id)
);
CREATE INDEX IF NOT EXISTS idx_paper_events_pending ON paper_trade_events(delivery_state,created_at);
