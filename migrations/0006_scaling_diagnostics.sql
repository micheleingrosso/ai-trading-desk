-- AI Trading Desk 1.3.1: additive schema, non-destructive market caches.
CREATE TABLE IF NOT EXISTS market_bars_cache (
  symbol TEXT NOT NULL, timeframe TEXT NOT NULL CHECK(timeframe IN ('5Min','15Min')),
  ts TEXT NOT NULL, open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL,
  close REAL NOT NULL, volume INTEGER NOT NULL, PRIMARY KEY(symbol,timeframe,ts)
);
CREATE INDEX IF NOT EXISTS idx_market_bars_cache_time ON market_bars_cache(timeframe,ts DESC);
CREATE TABLE IF NOT EXISTS market_bootstrap (
  symbol TEXT PRIMARY KEY, last_attempt_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS scanner_diagnostics (
  symbol TEXT PRIMARY KEY, bar_ts TEXT, status TEXT NOT NULL, reason TEXT NOT NULL,
  rsi14 REAL, volume_ratio REAL, orb_high REAL, orb_confirmed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS source_health (
 source TEXT PRIMARY KEY, last_success_at TEXT, last_error TEXT
);
-- New release explicitly returns to DISABLED, even if 1.3 was previously active.
-- The new release gate cannot be armed accidentally by a retained secret.
CREATE TABLE IF NOT EXISTS release_guard (
  id INTEGER PRIMARY KEY CHECK(id=1), validated INTEGER NOT NULL DEFAULT 0 CHECK(validated IN (0,1)),
  approved_at TEXT
);
INSERT OR IGNORE INTO release_guard(id,validated) VALUES(1,0);
UPDATE release_guard SET validated=0,approved_at=NULL WHERE id=1;
UPDATE paper_runtime SET enabled=0,paused_reason='Upgrade 1.3.1: verificare scanner, Telegram e Alpaca Paper prima di riabilitare',
 changed_at=CURRENT_TIMESTAMP,changed_by='migration_0006' WHERE id=1;
