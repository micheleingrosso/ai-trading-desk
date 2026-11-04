PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS watchlist (
    symbol TEXT PRIMARY KEY NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS price_bars (
    symbol TEXT NOT NULL,
    ts TEXT NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume INTEGER NOT NULL,
    feed TEXT NOT NULL DEFAULT 'iex',
    PRIMARY KEY(symbol, ts)
);
CREATE INDEX IF NOT EXISTS idx_price_bars_time ON price_bars(ts DESC);

CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY NOT NULL,
    symbol TEXT NOT NULL,
    bar_ts TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    price REAL NOT NULL,
    pct_1h REAL,
    volume_ratio REAL,
    volume INTEGER NOT NULL,
    baseline_volume REAL,
    reason TEXT NOT NULL,
    feed TEXT NOT NULL DEFAULT 'iex',
    created_at TEXT NOT NULL,
    UNIQUE(symbol,bar_ts)
);
CREATE INDEX IF NOT EXISTS idx_signals_created ON signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_trading_day ON signals(trade_date);

CREATE TABLE IF NOT EXISTS scan_runs (
    id TEXT PRIMARY KEY NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL CHECK(status IN ('running', 'success', 'partial', 'skipped', 'error')),
    source TEXT NOT NULL CHECK(source IN ('cron','manual')),
    symbols_checked INTEGER NOT NULL DEFAULT 0,
    alerts_created INTEGER NOT NULL DEFAULT 0,
    detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_scan_runs_date ON scan_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS scan_lock (
    name TEXT PRIMARY KEY NOT NULL,
    owner TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO watchlist(symbol,label,enabled) VALUES
 ('AAPL','Apple',1),
 ('MSFT','Microsoft',1),
 ('NVDA','NVIDIA',1),
 ('AMZN','Amazon',1),
 ('GOOGL','Alphabet',1),
 ('META','Meta',1),
 ('TSLA','Tesla',1),
 ('AMD','AMD',1),
 ('JPM','JPMorgan Chase',1),
 ('SPY','S&P 500 ETF',1);
