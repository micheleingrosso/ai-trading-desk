# AI Trading Desk 1.1 — Scout Advanced + News + Alerts

**Aggiornamento per una installazione V1.0.1 già funzionante.** Non bisogna creare un nuovo Worker o un nuovo database. La guida operativa da seguire è **[AGGIORNAMENTO_1.1.md](AGGIORNAMENTO_1.1.md)**.

## Cosa fa

- Mantiene le funzionalità 1.0.1: login HMAC, watchlist fino a 20 titoli, scansioni 15Min, anomalie Scout, storico D1, calendario Alpaca, cron 15 minuti, dashboard.
- Aggiunge calcolo 5Min di RSI14 (Wilder), EMA20, SMA50, trend descrittivo, breakout del massimo delle 20 barre precedenti con filtro volume e possibile bull flag (euristica).
- Archivia fino a 6 **nuovi eventi tecnici** per giorno di mercato, con cooldown 60 minuti per simbolo/tipo. Non genera eventi da barre non completate, dati non correnti o indicatori insufficienti.
- Importa e deduplica articoli di notizie forniti da Alpaca, mostrando titolo, fonte, link originale, ticker e data. Non aggira paywall e non interpreta le notizie con un LLM.
- Può notificare eventi tecnici con un solo messaggio tramite bot Telegram (se sono stati impostati i due segreti facoltativi).
- Dashboard 1.1 con sezioni Scanner tecnico, Eventi tecnici e Notizie; dati di autenticazione, watchlist e log preesistenti conservati.

## Limiti

Questa **non** è una strategia di trading validata. Non compie ordini, non ha un broker executor e non crea un portafoglio virtuale realmente movimentato. I $10.000 mostrati nella UI sono illustrativi. Non garantisce profitto o qualità di segnale. Il feed Alpaca IEX è parziale. Alcune notizie potrebbero non essere incluse nel piano Alpaca in uso.

## Installazione

Leggi `AGGIORNAMENTO_1.1.md` prima di intervenire sul Worker online. Per chi gestisce Cloudflare dal browser, sono inclusi:

- `migrations/0002_technical_news.sql` — SQL non distruttivo da copiare nella Console D1.
- `worker-single-file.js` — Worker completo da incollare in **Edit code → Deploy**.
- `src/` — sorgenti modulari per Wrangler.
- `test/` — test automatizzati eseguibili con `npm test`.

Per Wrangler è incluso `wrangler.jsonc` con `database_id` placeholder: sostituiscilo **con il tuo UUID D1 esistente**, oppure copia il file della vecchia installazione. In nessun caso sostituire valori reali con il placeholder.

## Moduli

`scout.js` (anomalie 15Min), `technical.js` (indicatori/pattern 5Min), `news.js` (normalizzazione e filtro notizie), `alerts.js` (Telegram facoltativo), `auth.js` (sessione), `index.js` (API e scansione), `ui.js` (dashboard).

## Test

`npm test` e `npm run check`. Test con API e database simulate, non test con credenziali reali su Cloudflare. L'installazione remota richiede la tua verifica.

Riferimento di idee: [day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill). Questa versione non incorpora automaticamente gli script Python del repository: realizza equivalenti JavaScript specifici per Cloudflare, mantenendo un perimetro di **sola osservazione**.
