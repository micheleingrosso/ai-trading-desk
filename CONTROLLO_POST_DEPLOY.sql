-- Eseguire su trading-desk-db dopo la migrazione e il deploy.
SELECT enabled, paused_reason, changed_at FROM paper_runtime WHERE id=1;
SELECT validated,approved_at FROM release_guard WHERE id=1;
SELECT COUNT(*) AS titoli_attivi FROM watchlist WHERE enabled=1;
SELECT COUNT(*) AS barre_cached FROM market_bars_cache;
SELECT symbol,status,reason,updated_at FROM scanner_diagnostics ORDER BY symbol LIMIT 50;
SELECT source,last_success_at,last_error FROM source_health;
SELECT status,source,symbols_checked,detail,started_at,finished_at FROM scan_runs ORDER BY started_at DESC LIMIT 8;
SELECT order_status,COUNT(*) n FROM paper_trades GROUP BY order_status;
SELECT delivery_state,COUNT(*) n FROM paper_trade_events GROUP BY delivery_state;
