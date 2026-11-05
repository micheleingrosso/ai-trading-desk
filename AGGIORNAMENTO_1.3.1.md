# AI Trading Desk 1.3.1 — Aggiornamento sicuro da 1.3

**Questa versione non è ancora installata sul tuo account.** È stata verificata con test locali e API simulate, non con il tuo Alpaca Paper o un deploy reale su Cloudflare.

## Importante: interrompi prima le nuove aperture

1. Dalla dashboard esistente, premi **Pausa nuovi ordini**; conferma che lo stato sia **IN PAUSA**.
2. Controlla su **Alpaca Paper** le posizioni e gli ordini aperti. Non cancellare per errore i bracket di protezione: il deploy non chiude né cancella gli ordini esistenti.
3. Salva una copia di `worker-single-file.js` 1.3 o del codice attualmente online e crea un backup del database D1.
4. Non modificare credenziali Alpaca o Telegram; non devi creare un altro Worker, un altro database o nuovi account.

## 1. Aggiorna il database D1

Cloudflare → D1 → `trading-desk-db` → Console. Esegui **tutto** `migrations/0006_scaling_diagnostics.sql`.

La migrazione crea cinque tabelle aggiuntive:

- `market_bars_cache`: cache 5m/15m con chiavi uniche e senza duplicati.
- `market_bootstrap`: evita di scaricare all'infinito lo storico incompleto di un titolo poco liquido.
- `scanner_diagnostics`: motivo del filtro per ogni ticker.
- `source_health`: ultimo controllo notizie completato correttamente.
- `release_guard`: ulteriore blocco dell'esecuzione dopo un aggiornamento.

Le 15 preesistenti e i relativi record vengono conservati. La migrazione esegue intenzionalmente `enabled=0` nel `paper_runtime` e `validated=0` nel `release_guard`: nessun nuovo ordine automatico potrà partire senza due passaggi manuali successivi. Il conto Paper, i bracket già presenti su Alpaca e le notifiche di riconciliazione non sono cancellati.

Verifica in D1:

```sql
SELECT enabled,paused_reason FROM paper_runtime WHERE id=1;
SELECT validated FROM release_guard WHERE id=1;
SELECT name FROM sqlite_master WHERE name IN (
  'market_bars_cache','market_bootstrap','scanner_diagnostics','source_health','release_guard'
) ORDER BY name;
```

Risultato richiesto: `enabled=0`, `validated=0`, cinque nomi di tabelle.

## 2. Pubblica il nuovo codice

Cloudflare → Workers & Pages → `ai-trading-desk` → **Edit code**. Sostituisci **integralmente** il vecchio JavaScript con `worker-single-file.js` dalla cartella 1.3.1 e scegli **Deploy**.

Mantieni il binding D1 `DB`, il binding Workers AI `AI` e tutti i segreti già configurati. **Non sovrascrivere la configurazione `wrangler.jsonc` del tuo account:** lo zip contiene solo un esempio con `database_id` fittizio.

Per pubblicazione con Wrangler dal progetto sorgente, usa il tuo `database_id` reale e i tuoi binding; il file standalone è per l'editor Cloudflare.

## 3. Cambia il Cron Trigger

Nella pagina del Worker → Settings → Triggers/Cron Triggers:

- **Rimuovi** l'eventuale cron precedente `*/5 * * * 1-5` e gli altri cron duplicati.
- **Imposta** un solo cron: `* * * * 1-5` (ogni minuto da lunedì a venerdì, in UTC).

La scansione è suddivisa in **5 tranche stabili**: ogni minuto un sottoinsieme, ogni simbolo circa ogni 5 minuti. La riconciliazione degli ordini/Telegram è eseguita a ogni minuto durante la seduta; fuori seduta la frequenza è ridotta (in genere 15 minuti, oltre alla finestra di chiusura). I Cron Trigger non garantiscono l'esecuzione allo scoccare esatto del minuto.

## 4. Collaudo a trading in pausa

- Verifica che compaia **Auto Paper IN PAUSA**.
- Verifica patrimonio e saldo Alpaca Paper, e fai **Test Telegram**.
- Premi **Aggiorna esecuzioni** e controlla che i dati già presenti siano riconciliati (non viene aperta nessuna nuova posizione).
- Controlla **Diagnostica segnali** e **Scanner tecnico** dopo l'apertura mercato.
- Controlla **Log scansioni**: dovrebbero apparire tranche più piccole, con durata in millisecondi.
- Per i titoli al primo caricamento può apparire `Storico in preparazione`, `NOT_READY` o `DATA_ERROR`: serve una inizializzazione graduale e **non deve autorizzare ordini**.
- Se Alpaca News non funziona o non è stato controllato con successo negli ultimi 20 minuti, **nessun nuovo ordine** viene proposto all'esecutore automatico. Il monitoraggio di ordini già presenti prosegue.
- Su Cloudflare → Observability/Logs controlla CPU, durata, errori e invocazioni; sulle prime sessioni con 30–50 titoli il piano Free può non essere sufficiente.

## 5. Riattivazione Paper (solo dopo collaudo e verifica delle posizioni)

Non procedere se ci sono errori, storico incompleto, ordini sconosciuti o se le notifiche non funzionano.

Prima, esplicitamente dalla **Console D1**:

```sql
UPDATE release_guard
SET validated=1,approved_at=CURRENT_TIMESTAMP
WHERE id=1 AND validated=0;
```

Poi dalla dashboard vai su **Auto Paper 1.3.1** → **Abilita AUTO PAPER**, scrivi `PAPER` nel prompt e conferma. Il segreto Cloudflare `PAPER_AUTOTRADE_ARM=PAPER_ONLY` deve rimanere configurato. Solo i due passaggi insieme e tutti i controlli di rischio permettono nuovi ingressi su Alpaca **Paper**.

**La migrazione e il codice da soli NON riattivano l'automazione.** Non disabilitare mai i controlli per forzare un ordine.

## Strategie e limiti

- Le condizioni degli ordini rimangono breakout20/bull flag + RSI, volume relativo, trend, rischio e Skeptic AI; il nuovo ORB15 è **solo segnale informativo**. Non provoca acquisti da solo.
- Nessun nuovo ingresso durante i primi 15 minuti circa di seduta (cutoff prudenziale 09:46 ET), o se le ultime notizie disponibili non superano il controllo di freschezza.
- Resta il limite 5% di equity per posizione, rischio 0,25% allo stop, tre posizioni/ordini al massimo, tre nuovi ordini giornalieri e blocco giornaliero -1%.
- Una posizione può **restare overnight**: il sistema non include ancora una chiusura obbligatoria a fine giornata. Verifica le posizioni e la protezione bracket su Alpaca Paper.
- Il feed IEX ha copertura parziale del mercato USA: i volumi non sono quelli consolidati.

## Rollback

Se qualcosa non funziona, lascia AUTO PAPER **IN PAUSA**. Recupera il precedente codice Worker 1.3 e il backup D1. Non eliminare le nuove tabelle per tentare un rollback. Verifica le posizioni e gli ordini direttamente su Alpaca Paper. Prima di qualsiasi eventuale riattivazione del vecchio codice, controlla `paper_runtime.enabled=0` e lo stato delle esecuzioni, poiché il Worker 1.3 non conosce il nuovo `release_guard`.
