-- Non-destructive update from V1.0.1. Existing tables and data are untouched.
CREATE TABLE IF NOT EXISTS technical_snapshots (
  symbol TEXT PRIMARY KEY NOT NULL,
  bar_ts TEXT NOT NULL,
  close REAL NOT NULL,
  volume INTEGER NOT NULL,
  rsi14 REAL,
  ema20 REAL,
  sma50 REAL,
  high20 REAL,
  volume_ratio20 REAL,
  trend TEXT NOT NULL,
  breakout INTEGER NOT NULL DEFAULT 0,
  bull_flag_candidate INTEGER NOT NULL DEFAULT 0,
  feed TEXT NOT NULL DEFAULT 'iex',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS technical_events (
  id TEXT PRIMARY KEY NOT NULL,
  symbol TEXT NOT NULL,
  bar_ts TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  kind TEXT NOT NULL,
  description TEXT NOT NULL,
  price REAL NOT NULL,
  rsi14 REAL,
  volume_ratio20 REAL,
  created_at TEXT NOT NULL,
  UNIQUE(symbol,bar_ts,kind)
);
CREATE INDEX IF NOT EXISTS idx_technical_events_created ON technical_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_technical_events_day ON technical_events(trade_date);
CREATE TABLE IF NOT EXISTS news_items (
  article_id TEXT PRIMARY KEY NOT NULL,
  headline TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT NOT NULL,
  published_at TEXT NOT NULL,
  symbols_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_news_items_published ON news_items(published_at DESC);
