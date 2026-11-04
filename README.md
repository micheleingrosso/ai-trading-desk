# AI Trading Desk — Scout 1.0

**Prototipo operativo di monitoraggio informativo, per uso personale.** La V1.0 non è un broker, non genera ordini e non fa paper trading effettivo: serve a raccogliere dati, rilevare anomalie, tenerne uno storico e verificare che la base tecnica funzioni.

## Include

- Worker Cloudflare con API privata e dashboard responsive.
- Database Cloudflare D1, migrazione SQL e watchlist iniziale (10 titoli).
- Scanner automatico **ogni 15 minuti nei feriali**; evita richieste di mercato quando l'API clock di Alpaca indica borsa chiusa (inclusi festivi/chiusure).
- Alpaca Market Data API, feed `iex` gratuito. Interroga barre **15Min** degli ultimi 21 giorni per ciascun titolo, solo per la ricerca di anomalie.
- Scout: segnala un movimento di almeno **±3% in un'ora** oppure un volume dell'ultima barra 15Min almeno **2× la mediana della stessa fascia oraria di fino a 5 giornate precedenti**.
- Protezioni: almeno 3 giornate di riferimento per i volumi; soglie minime di volume per attenuare i falsi positivi; ignora barre non completate, dati vecchi e intervalli fuori orario regolare; massimo 5 nuovi segnali al giorno; cooldown 60 minuti per titolo; lock per evitare esecuzioni sovrapposte.
- Storico scansioni, timestamp, fonte e reason di ogni evento. Watchlist modificabile (max 20 attivi).
- Login privato con cookie HttpOnly, sessione firmata HMAC-SHA256 di 8 ore e controllo dell'origine per le azioni mutative.
- Nessun accesso alle API di invio ordini Alpaca. **Il saldo di $10.000 è soltanto un riferimento grafico; non è un portafoglio simulato.**

## Prerequisiti

1. Account **Cloudflare**, senza bisogno di carta di credito se resti nei limiti gratuiti.
2. Account **Alpaca Paper Only** (verifica la disponibilità per il tuo Paese) e coppia di credenziali API per il feed dati. Usa solo credenziali paper, mai credenziali reali.
3. **Node.js 20.18 o successivo**, `npm`, terminale e accesso alla dashboard Cloudflare.
4. Crea una password unica lunga **almeno 14 caratteri**, più una chiave casuale lunga **almeno 32 caratteri** per firmare le sessioni.

Le chiavi API non vanno incollate in chat né nel codice e **non vanno committate**. Il file `.dev.vars` è escluso da Git.

## Pubblicazione in Cloudflare — istruzioni passo per passo

Scarica ed estrai lo ZIP, apri un terminale nella cartella `ai-trading-desk-v1`.

```bash
npm install
npx wrangler login
npx wrangler d1 create trading-desk-db
```

L'ultimo comando stampa un UUID. **Copia il valore esatto di `database_id`** e sostituisci nel file `wrangler.jsonc` il placeholder:

```json
"database_id": "00000000-0000-0000-0000-000000000000"
```

Poi applica il database **remoto**:

```bash
npx wrangler d1 migrations apply trading-desk-db --remote
```

Pubblica il Worker:

```bash
npx wrangler deploy
```

Imposta **quattro segreti** nel progetto: ciascun comando apre un prompt dove incollare il valore, che non viene scritto nel repository.

```bash
npx wrangler secret put ALPACA_KEY_ID
npx wrangler secret put ALPACA_SECRET_KEY
npx wrangler secret put DASHBOARD_PASSWORD
npx wrangler secret put SESSION_SECRET
```

Per generare un secret casuale di firma da terminale (macOS/Linux):

```bash
openssl rand -hex 32
```

La firma deve essere **diversa dalla password di login**. Una volta creati i segreti, apri l'indirizzo `https://ai-trading-desk.<tuo-subdominio>.workers.dev` mostrato da Wrangler. Il link preciso è stampato dal deploy. Inserisci esclusivamente **la password della dashboard** nella pagina di login, non la chiave Alpaca.

### Sviluppo locale

Copia `.dev.vars.example` in `.dev.vars` e sostituisci i placeholder solo sul tuo computer, poi:

```bash
npm install
npx wrangler d1 migrations apply trading-desk-db --local
npx wrangler dev
```

Apri l'indirizzo locale mostrato da Wrangler (normalmente `http://localhost:8787`). Per il database locale Wrangler usa storage separato da D1 remoto.

### Verifica dopo il deploy

1. Apri la dashboard e verifica il login.
2. La tabella mostra 10 titoli preconfigurati; all'inizio prezzi e segnali possono essere vuoti.
3. Premi **Esegui scansione** durante l'orario regolare di mercato USA. Fuori orario la scansione viene annotata come **skipped**.
4. Controlla la sezione **Storico scansioni**. Una scansione `success` non implica che debba esserci un'anomalia.
5. Nella dashboard Cloudflare > Worker puoi consultare le invocazioni e i log. Le credenziali non vanno pubblicate.
6. Verifica l'uso effettivo del piano Cloudflare: i limiti gratuiti (in particolare il CPU time per invocazione) possono richiedere riduzione dei ticker o passaggio a Workers Paid.

## Architettura

```
                   ogni 15 minuti (UTC, feriali)
                           │
                     Worker scheduled
                           │
              Alpaca Paper /v2/clock
                           │ aperto
                 max 20 ticker attivi
                           │
              Alpaca /v2/stocks/{symbol}/bars
                   timeframe=15Min feed=iex
                           │
                   validazione / freshness
                           │
                  Scout (algoritmo puro)
                    │            │
                  D1 bars     D1 signals
                    └─────┬──────┘
                          │
           Login dashboard + API read-only (+ watchlist / manual scan)
```

### Struttura del codice

```
src/index.js          HTTP routes, scan scheduler, Alpaca API, SQL
src/scout.js          calcolo e regole pure di analisi
src/auth.js           autenticazione/sessioni
src/ui.js             HTML, CSS e JS della dashboard
migrations/0001_init.sql
wrangler.jsonc
.dev.vars.example
test/*.test.js
```

### API implementate

- `GET /login`, `POST /login`, `POST /logout`
- `GET /api/overview` (dashboard)
- `POST /api/scan` (manuale, autenticato)
- `POST /api/watchlist` (aggiunge o riattiva ticker)
- `DELETE /api/watchlist/{SYMBOL}` (disattiva ticker, mantiene lo storico)

### Costi indicativi

La base può rientrare nei livelli gratuiti di Alpaca e Cloudflare, **senza garanzia**: il costo effettivo dipende da quota CPU/requests, tariffazione e disponibilità dei dati nel tuo account. **Questa versione non utilizza ancora LLM**, quindi non ci sono costi di token AI. Non esistono costi di trading, perché gli ordini sono tecnicamente assenti.

## Limitazioni importanti

- Il feed **IEX non è il mercato consolidato USA**; la copertura di volumi è parziale. Un segnale di volume non rappresenta necessariamente l'intero mercato e non costituisce un'opportunità finanziaria dimostrata.
- Le barre sono aggregate su 15 minuti; per i prezzi e i volumi sono considerate solo barre completate (più 60 secondi di assestamento). Non è un sistema di trading ad alta frequenza.
- Il confronto sui volumi tiene conto dell'orario New York e dell'ora legale. Ci possono essere sessioni con intervalli mancanti: in quel caso Scout può rifiutare di calcolare un indicatore.
- Il test non prova che una strategia sia profittevole. La V1 non misura costi, slippage, rendimenti, drawdown o risultati reali.
- La watchlist non verifica automaticamente che un ticker corrisponda a un asset attualmente tradato: ticker errati o con dati mancanti non genereranno segnali e potranno causare errori in scan.
- La protezione con password della V1 è basilare per uso personale; per una pubblicazione stabile è consigliata l'aggiunta di **Cloudflare Access**, rate limiting sul login, alert sugli errori e un dominio personalizzato. Non inserire segreti o dati sensibili nella watchlist.
- Rispettare sempre le condizioni di uso e redistribuzione dei dati del provider. Uso soltanto personale; non esporre le API o i dati raccolti pubblicamente.
- Il Worker può incontrare errori di rete, quote o limiti CPU. Ogni scansione registra il proprio esito: non assumere che `skipped` o `error` sia un segnale di mercato.
- Non attivare broker reali, non usare denaro reale né inferire che un segnale `flagged` significhi comprare/vendere.

## Test

```bash
npm test
npm run check
```

I test coprono fusi orari New York, soglie Scout, freshness delle barre, dati insufficienti, autenticazione, watchlist e scansioni con risposte API simulate. **Non sostituiscono un test di integrazione su Cloudflare con credenziali reali**.

## Roadmap successiva (non presente in V1)

1. Confronto feed IEX vs storico SIP differito, migliore sistema di data quality.
2. News con fonti e timestamp, AI Skeptic e spiegazioni esplicabili.
3. Chart e Sizer con parametri di rischio indipendenti dall'AI.
4. Portafoglio virtuale reale con registro ordini simulati, P&L e controlli di esecuzione.
5. Backtest e valutazione out-of-sample, solo dopo validazione dei dati.

## Riferimenti ufficiali

- Alpaca — Market Data API: https://docs.alpaca.markets/us/docs/about-market-data-api
- Alpaca — historical stock bars: https://docs.alpaca.markets/us/reference/stockbars
- Cloudflare — Wrangler config: https://developers.cloudflare.com/workers/wrangler/configuration/
- Cloudflare — D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/

**Avvertenza:** prototipo educativo/informativo, non consulenza finanziaria. Nessun rendimento è promesso.
