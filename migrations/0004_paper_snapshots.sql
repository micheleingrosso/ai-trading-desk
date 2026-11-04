-- V1.2.1: non-destructive Paper account snapshots, no trading or order tables.
-- This only tracks the WHOLE Alpaca Paper account; it is NOT a performance attribution of the bot.
CREATE TABLE IF NOT EXISTS paper_account_snapshots (
 id TEXT PRIMARY KEY NOT NULL,
 snapshot_at TEXT NOT NULL,
 equity REAL NOT NULL,
 cash REAL NOT NULL,
 buying_power REAL NOT NULL,
 cash_no_leverage REAL NOT NULL,
 previous_equity REAL,
 status TEXT NOT NULL,
 blocked INTEGER NOT NULL DEFAULT 0,
 source TEXT NOT NULL DEFAULT 'ALPACA_PAPER'
);
CREATE INDEX IF NOT EXISTS idx_paper_snapshots_ts ON paper_account_snapshots(snapshot_at DESC);
