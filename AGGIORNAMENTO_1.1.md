# AGGIORNAMENTO 1.1 — AI Trading Desk

## Prima di procedere

Il tuo Worker `ai-trading-desk` e il database `trading-desk-db` **esistono già**. NON creare un altro Worker, NON cancellare il database e NON sostituire la configurazione dei quattro segreti già impostati. Questa versione mantiene il nome del binding `DB`.

**NOVITÀ**: scanner tecnico sulle barre 5Min (RSI14, EMA20, SMA50, breakout 20 barre, possibile bull flag euristica), archivio notizie Alpaca, notifiche Telegram facoltative, due nuove sezioni nella dashboard. **Resta observation-only**: nessun ordine, nessun paper trading attivo, nessuna raccomandazione generata da un LLM. L'analisi semantica AI è una fase successiva.

### Percorso A — Aggiornamento direttamente da Cloudflare (più semplice)

1. **Backup database**: prima di applicare modifiche, esporta il database dalla dashboard D1 o tramite Wrangler (vedi sotto).
2. In Cloudflare, entra in **D1 SQL Database → trading-desk-db → Console**.
3. Apri `migrations/0002_technical_news.sql`, copia **TUTTO** il contenuto ed eseguilo nella Console. Le istruzioni sono solo `CREATE TABLE IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS`: non cancellano dati e si possono ripetere.
4. Controlla la creazione delle nuove tabelle:

```sql
SELECT name FROM sqlite_master
WHERE type='table' AND name IN ('technical_snapshots','technical_events','news_items')
ORDER BY name;
```

Devono apparire tutte e tre. Watchlist e storico devono essere ancora presenti.

5. In **Workers & Pages → ai-trading-desk → Edit code** apri il codice del Worker.
6. Sostituisci **tutto il codice del Worker** con il contenuto di `worker-single-file.js` (nella cartella principale dello ZIP). È un bundle ESM con tutto il codice incluso; NON incollare i singoli file `src/` nella dashboard e NON sostituire il tuo `wrangler.jsonc`.
7. Premi **Deploy**. I segreti e il binding D1 già configurati rimangono impostati sullo stesso Worker.
8. Apri il tuo link `workers.dev`, effettua il login: vedrai le sezioni **Scanner tecnico** e **Notizie** sotto la watchlist.
9. A mercato USA aperto, premi **Esegui scansione**. Il log indica quanti titoli sono stati analizzati e quanti hanno indicatori 5m pronti. Se News non è accessibile sul tuo piano, lo scanner rimane funzionante e il log lo segnala.

### Percorso B — Aggiornamento con Wrangler

1. Estrai lo ZIP, apri un terminale nella cartella `ai-trading-desk-v1.1`.
2. Nel file `wrangler.jsonc` sostituisci il placeholder `database_id` con il **tuo UUID D1 reale**. Meglio ancora: copia `wrangler.jsonc` della tua installazione 1.0.1 già funzionante nella nuova cartella, mantenendo la stessa identità Worker e il binding `DB`.
3. Con le credenziali Cloudflare disponibili:

```bash
npm install
npx wrangler login
npx wrangler d1 export trading-desk-db --remote --output backup-pre-v1.1.sql
npx wrangler d1 migrations apply trading-desk-db --remote
npm test
npm run check
npx wrangler deploy
```

**NOTA**: se in passato hai creato le tabelle 1.0.1 manualmente nella Console D1, la migration `0001_init.sql` usa `IF NOT EXISTS` e `INSERT OR IGNORE`, quindi non cancella i dati esistenti. La `0002` è anch'essa non distruttiva. Non eseguire applicazioni di migrazione in parallelo con l'inserimento di dati da altri processi.

### Notifiche Telegram (facoltative)

Non sono necessarie per il funzionamento del Worker. Per ricevere una notifica sintetica quando vengono registrati *nuovi* eventi tecnici, crea un bot con `@BotFather`, avvia una chat con il bot e recupera il chat ID. Poi imposta sullo **stesso Worker** due nuovi segreti:

- `TELEGRAM_BOT_TOKEN` — token segreto del bot
- `TELEGRAM_CHAT_ID` — identificativo chat autorizzata

Da Wrangler: `npx wrangler secret put TELEGRAM_BOT_TOKEN` e `npx wrangler secret put TELEGRAM_CHAT_ID`.
Non incollare il token in chat o in file pubblici. Non è previsto ricevere comandi di negoziazione da Telegram.

### Controlli post-deploy

- Login con la password già esistente.
- Watchlist iniziale sempre presente (i 10 titoli non devono sparire).
- Tre tabelle D1 nuove, vecchio storico ancora presente.
- `Scanner tecnico`: RSI14 / EMA20 / SMA50 quando disponibili; barre 5m incomplete o vecchie vengono scartate.
- `Notizie`: titoli/link/fonti senza interpretazione AI; se Alpaca non fornisce news per il tuo account, nel log comparirà `News non disponibili`.
- `Log scansioni`: stato `success`, `partial`, `skipped` o `error`, a seconda dell'esito.
- `0 / 0` ordini/posizioni; nessuna API reale del broker usata.

### Diagnostica rapida

| Sintomo | Possibile causa | Soluzione |
|---|---|---|
| `Errore applicativo` dopo deploy | Nuova migration 0002 non applicata | Esegui SQL e controlla le 3 tabelle |
| `SKIPPED` / borsa chiusa | Sessione regolare non aperta | Attendi la prossima apertura USA |
| `0/10 indicatori 5m pronti` | Barre incomplete, dati IEX scarsi, non abbastanza storia | Controlla log e prova dopo l'apertura; non forzare segnali |
| News non disponibili | Account senza accesso o endpoint temporaneamente non raggiungibile | Verifica log; scanner resta utilizzabile |
| Telegram non configurato | Mancano segreti facoltativi | Configurali solo se desideri notifiche |
| `partial` | Alcuni ticker non recuperati o API parziali | Verifica log Worker e risposta Alpaca |

### Limiti reali

- Il feed `iex` comprende solo gli scambi IEX, **non** il mercato azionario USA completo. Indicatori e soprattutto volumi possono differire dalla vista consolidata.
- Ogni scansione interroga 15Min e 5Min per titolo (fino a 20) più clock e news: fino a ~42 richieste esterne; con Telegram ~43. Sul piano Workers Free, Cloudflare limita a 50 richieste **esterne** e a soli 10 ms di **CPU** per invocazione. La versione 1.1 potrebbe superare la quota CPU durante le scansioni con molti titoli: in caso di errori CPU, valuta Workers Paid (da 5 USD/mese) oppure riduci la watchlist attiva. Le chiamate D1 rientrano nel distinto limite delle richieste interne.
- Una possibile *bull flag* è solo un **candidato euristico**. Non è una configurazione accertata, né una strategia con vantaggio dimostrato.
- Lo storico news archivia titoli e URL, non contenuti a pagamento, e non usa modelli linguistici.
- La dashboard è per uso privato. Le credenziali Alpaca devono essere solo **Paper Only**. Questa versione non invia mai ordini, neppure simulati.

## Test locali

```bash
npm test
npm run check
```

Documentazione ufficiale: https://docs.alpaca.markets/us/reference/stockbars · https://docs.alpaca.markets/us/v1.1/reference/news-3 · https://developers.cloudflare.com/d1/reference/migrations/
