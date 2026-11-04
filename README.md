# AI Trading Desk 1.3 — AUTO PAPER, Telegram e risultato delle operazioni

**Progetto per uso personale e didattico.** Questa release introduce un esecutore di ordini esclusivamente sul conto **Alpaca Paper Trading**. Non contiene alcun collegamento a un endpoint di trading reale.

> **Stato dopo l'installazione:** AUTO PAPER **DISABILITATO**. Nessun ordine parte automaticamente fino a quando (1) viene configurato il segreto dedicato `PAPER_AUTOTRADE_ARM=PAPER_ONLY` e (2) l'utente abilita manualmente l'automazione dalla dashboard, dopo aver verificato Telegram e Workers AI.

## Novità della 1.3

- **Bracket orders PAPER**: acquisto con ordine limit, stop-loss condizionato e take-profit, tutti sul dominio fisso `https://paper-api.alpaca.markets/v2`.
- **Protezione dal retry**: ogni richiesta ha un `client_order_id` univoco e viene prenotata in D1 prima di qualsiasi POST. Se Alpaca non risponde o la risposta è ambigua, l'esecutore si ferma e riconcilia tramite il client ID, senza reinviare automaticamente.
- **Verifiche prima degli ingressi:** account attivo, orario borsa, dati tecnici recenti, approvazione `PASS` di Skeptic AI, limiti matematici, liquidità senza leva, esclusione di posizioni esterne non riconosciute.
- **Limiti:** massimo 5% dell'equity per singola posizione, perdita teorica 0,25% dell'equity al prezzo limite, massimo 3 posizioni o ingressi aperti, massimo 3 ordini nuovi al giorno, stop nuovi ingressi a -1% di equity dal primo snapshot del giorno. Nessun nuovo ingresso negli ultimi 30 minuti di seduta.
- **Notifiche Telegram:** ordine inviato, ingresso realmente eseguito, uscita realmente eseguita, eventi di sicurezza, stato on/off, rapporto giornaliero. Riportano prezzi reali dei fill PAPER, profitto/perdita lordi e confronto con l'obiettivo previsto. Un messaggio può arrivare fino a 5 minuti dopo il fill (o più se cron/API falliscono).
- **Dashboard:** stato automazione, pulsanti Abilita/Pausa, invio messaggio di prova, riconciliazione manuale, ordini, fill, P/L realizzato e registro consegna Telegram.
- **Cron 5 minuti:** ogni 15 minuti Scout può generare nuove opportunità; ogni 5 minuti il modulo di esecuzione sincronizza gli ordini PAPER e le notifiche.
- **Pulsante «Esegui scansione»:** esegue solo monitoraggio e riconciliazione; **non invia ordini**, anche quando AUTO PAPER è abilitato. I nuovi ordini possono essere generati solo dal cron in modalità automatica.

## Installazione con editor Cloudflare (come la 1.2.1)

Leggere **AGGIORNAMENTO_1.3.md**. In sintesi:

1. Salva una copia della versione 1.2.1 del Worker e fai un backup D1.
2. Applica **solo** `migrations/0005_paper_execution.sql` alla console D1 del database esistente `trading-desk-db`. Non ripetere le migrazioni precedenti, già applicate.
3. Incolla **tutto** `worker-single-file.js` nell'editor del Worker esistente `ai-trading-desk` e fai Deploy. Non ricreare il Worker né il database.
4. In Workers > **Bindings** conserva `DB` e aggiungi, se non c'è, **Workers AI** con nome `AI` (necessario per l'automazione; senza AI resterà bloccata).
5. In **Settings > Variables and Secrets** conserva le quattro credenziali esistenti e configura i Telegram `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`. Non inviarli in chat o a terzi.
6. Configura **Cron Trigger** `*/5 * * * 1-5` (UTC). Rimuovi eventualmente il vecchio `*/15 * * * 1-5` per evitare sovrapposizioni. Questo passaggio è necessario anche se hai aggiornato il codice tramite editor web.
7. Apri la dashboard, verifica che `AUTO PAPER` sia *in pausa*, premi `Test Telegram`, e poi `Aggiorna esecuzioni`. Conferma che la watchlist e il conto PAPER continuino a funzionare.
8. Solo quando tutto è verificato, aggiungi un **nuovo secret** Cloudflare `PAPER_AUTOTRADE_ARM` con valore esatto `PAPER_ONLY`, poi torna alla dashboard, digita `PAPER` nel prompt ed abilita AUTO PAPER.

**IMPORTANTE:** i segreti Alpaca devono essere quelli **Paper Trading**. Nessun account Live è supportato. La gestione del conto Live richiederebbe un progetto, audit e abilitazione separati non inclusi.

## Funzionamento in pratica

| Momento | Operazione |
|---|---|
| Ogni 15 minuti, mercato aperto | Analisi delle barre IEX, News, pattern e Skeptic; se tutte le regole passano e AUTO PAPER è attivo, al massimo un nuovo bracket Paper per scansione |
| Ogni 5 minuti nei giorni feriali | Legge lo stato dei nostri ordini da Alpaca e invia Telegram sui fill confermati |
| Dopo la chiusura USA | Invia un breve riepilogo quotidiano, con l'eventuale P/L lordo delle operazioni aperte oggi e già chiuse |
| Errori/risposte ambigue | Disabilita nuovi ingressi, notifica l'evento e lascia intatti gli ordini protettivi già presenti su Alpaca |

## Avvertenze e limitazioni da conoscere

- **Non è una strategia con redditività dimostrata.** Le metriche di RSI, breakout e bull flag sono filtri euristici; Skeptic AI può sbagliare. I 46 test locali usano **API e mercato simulati** e non sostituiscono test reali del Worker o una validazione statistica.
- **IEX è un feed parziale**. Prezzi/volumi non descrivono tutto il mercato USA e non forniscono di per sé una quotazione eseguibile. L'ordine limite riduce, ma non annulla, il rischio di variazioni prezzo o fill mancati.
- **Ordini GTC**: lo stop e il take-profit restano sul broker Paper anche se il Worker smette di funzionare; posizioni aperte possono **restare aperte overnight**, quindi questa release **non implementa una chiusura obbligatoria a fine giornata**. Un ingresso limite non eseguito viene cancellato dopo circa 20 minuti, se Alpaca risponde.
- **Ingressi parziali:** il bracket può non essere ancora pienamente protetto. Il sistema rileva il fill parziale, blocca nuovi ingressi e richiede verifica sul conto Alpaca. Non tentare di risolvere manualmente dall'app senza controllare prima l'ordine.
- **Modifiche manuali al conto**: se apri, chiudi o modifichi ordini/posizioni direttamente su Alpaca, potrebbero esserci discrepanze con il database; il motore sospende nuove operazioni. Per la valutazione dell'efficacia è preferibile un conto Paper dedicato al bot.
- **Telegram non garantisce esattamente una consegna:** il sistema usa un outbox ritentabile, ma una risposta persa dopo il recapito può produrre un messaggio duplicato. Non usare le notifiche come unica fonte di verità.
- **P/L lordo Paper**: il sistema ricava il valore dai fill comunicati da Alpaca; non equivale a rendimento live netto, e non include tutti i possibili costi o effetti di mercato. La variazione dell'equity del conto include eventuali interventi esterni.
- **Il P/L giornaliero** del riepilogo riguarda le operazioni aperte nel giorno indicato e già chiuse. Il P/L cumulato e quello relativo a posizioni rimaste aperte sono visualizzati separatamente.
- **Risorse:** 20 simboli richiedono molti fetch e calcoli. Cloudflare Workers Paid potrebbe essere necessario (CPU, subrequests), così come una quota Workers AI adatta. Senza cron, il bot **non** è autonomo.
- **Aggiornamenti futuri:** metti in pausa AUTO PAPER prima di sostituire il Worker. Il flag di abilitazione è **persistente nel database** e non viene azzerato automaticamente a ogni nuovo deploy.

## Sviluppo locale

- Node.js 22+.
- `npm install`
- `npm test`
- `npm run check`
- `npm run build:single` (ricostruisce il Worker singolo dopo modifiche).
- Per deploy via Wrangler, usare il tuo `wrangler.jsonc` esistente e mantenere il **vero** `database_id` del binding D1; quello nel pacchetto è un segnaposto e **non deve** sostituire la configurazione live del tuo Worker.

Tabelle introdotte: `paper_runtime`, `paper_execution_lock`, `paper_trades`, `paper_trade_events`. Migrazione non distruttiva 0005. Licenza del repository day-trader-skill non implica che il codice di questo progetto sia stato copiato integralmente: gli algoritmi sono implementati in JavaScript in modo autonomo.
