-- V1.2 non-destructive: informational proposals only (no orders, no money).
CREATE TABLE IF NOT EXISTS trade_proposals (
 id TEXT PRIMARY KEY NOT NULL,
 symbol TEXT NOT NULL,
 bar_ts TEXT NOT NULL,
 trade_date TEXT NOT NULL,
 source_event TEXT NOT NULL,
 entry_price REAL NOT NULL,
 stop_price REAL NOT NULL,
 target_price REAL NOT NULL,
 shares INTEGER NOT NULL,
 notional REAL NOT NULL,
 loss_at_stop REAL NOT NULL,
 reward_risk REAL NOT NULL,
 rationale TEXT NOT NULL,
 cautions_json TEXT NOT NULL,
 technical_json TEXT NOT NULL,
 skeptic_mode TEXT NOT NULL,
 skeptic_verdict TEXT NOT NULL,
 skeptic_reasons_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'WAIT',
 created_at TEXT NOT NULL,
 reviewed_at TEXT,
 review_note TEXT,
 UNIQUE(symbol,bar_ts,source_event)
);
CREATE INDEX IF NOT EXISTS idx_trade_proposals_date ON trade_proposals(trade_date,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_proposals_status ON trade_proposals(status,created_at DESC);
CREATE TABLE IF NOT EXISTS proposal_audit (
 id TEXT PRIMARY KEY NOT NULL,
 proposal_id TEXT NOT NULL,
 action TEXT NOT NULL,
 detail TEXT NOT NULL,
 created_at TEXT NOT NULL,
 FOREIGN KEY(proposal_id) REFERENCES trade_proposals(id)
);
CREATE INDEX IF NOT EXISTS idx_proposal_audit_proposal ON proposal_audit(proposal_id,created_at DESC);
