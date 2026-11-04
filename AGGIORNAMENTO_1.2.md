# Aggiornamento AI Trading Desk 1.2 — dalla versione 1.1

**Non creare un nuovo Worker e non cancellare il database.** La V1.2 è un aggiornamento della versione V1.1 già online su Cloudflare. È un progetto personale di studio, **senza ordini reali o virtuali**.

## 0. Prima di iniziare

- La V1.1 deve essere già installata, compresa la migrazione `0002_technical_news.sql`.
- Esporta o salva una copia di sicurezza del database D1 `trading-desk-db` e conserva il codice della V1.1 prima di sostituirlo.
- Non pubblicare in chat/API/commit i segreti `ALPACA_SECRET_KEY`, `DASHBOARD_PASSWORD`, `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN`.

## 1. Migrazione D1 — necessaria

Su Cloudflare vai in **D1 SQL Database → trading-desk-db → Console**.

1. Apri il file `migrations/0003_proposals.sql` contenuto nello ZIP.
2. Copia il contenuto nella console e avvialo.
3. Controlla che il risultato sia positivo.
4. Esegui questa query di verifica:

```sql
SELECT name FROM sqlite_master
WHERE type = 'table' AND name IN ('trade_proposals','proposal_audit')
ORDER BY name;
```

Devono comparire `proposal_audit` e `trade_proposals`. Le query `CREATE TABLE IF NOT EXISTS` **non cancellano** le vecchie tabelle e sono ri-eseguibili. Non rieseguire `0001`/`0002` solo perché si installa la 1.2.

## 2. Aggiorna lo stesso Cloudflare Worker

Se usi l'editor web, vai su **Workers & Pages → ai-trading-desk → Edit code** e sostituisci **l'intero contenuto del file JavaScript** con `worker-single-file.js`, poi clicca **Deploy**. Non incollare i moduli `src` individualmente nell'editor del Worker; il file unico è già completo.

Mantieni **tutti i binding e i segreti attuali**:

- D1 binding `DB` → il tuo database esistente `trading-desk-db`.
- `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY`.
- `DASHBOARD_PASSWORD`, `SESSION_SECRET`.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` solo se già configurati (facoltativi).

Aprendo la dashboard dovrebbe apparire la nuova sezione **Proposte 1.2**. Se manca, il Worker non sta servendo il codice aggiornato.

## 3. Abilita Skeptic AI (facoltativo, ma necessario per la valutazione AI)

La V1.2 funziona anche **senza AI**: in questo caso mostra `SKEPTIC: SOLO REGOLE` e tutti i candidati restano `WAIT`. Nessuna valutazione del modello è stata effettuata.

Per attivare le valutazioni AI sul Worker già pubblicato:

1. Vai nella dashboard del Worker **Settings → Bindings**.
2. Scegli **Add binding → Workers AI** (la dicitura può variare).
3. Imposta il nome del binding **`AI`** (in maiuscolo).
4. Salva/deploy se richiesto e ricarica la dashboard.

Ora lo stato mostrerà `SKEPTIC: WORKERS AI ATTIVO`. Il modello utilizzato è `@cf/meta/llama-3.1-8b-instruct-fp8`, controlla tariffe e disponibilità sul tuo account. Le richieste consumano il plafond Workers AI; si tratta di un servizio a consumo con quota gratuita limitata. **Il modello può soltanto decidere WAIT/SKIP**, mai approvare un ordine.

Con Wrangler, aggiungi `"ai": { "binding": "AI" }` alla tua configurazione reale **se vuoi attivare l'AI**. Conserva il tuo UUID D1 esistente; `wrangler.jsonc` nello ZIP contiene un placeholder e non deve sovrascrivere la configurazione di produzione.

## 4. Verifica in dashboard

Quando la borsa USA è aperta e le API Alpaca rispondono:

1. Premi **Esegui scansione**.
2. Controlla **Stato monitoraggio → Esito** e **Log scansioni**.
3. Apri **Scanner tecnico**, verifica le barre aggiornate.
4. Apri **Proposte 1.2**. **Zero proposte è normale**: richiediamo breakout o bull flag, trend, RSI e volumi validi, oltre a dati recenti.
5. Se una proposta è presente, controlla ingresso teorico, stop, target, quantità, rischio ipotizzato e obiezioni dello Skeptic.
6. Puoi premere **Archivia scheda**: archivia soltanto il record informativo. Non vende, non acquista, non apre posizioni.
7. In alto **Ordini/Posizioni deve sempre restare `0 / 0`**.

## 5. Parametri in codice (non modificabili dalla dashboard V1.2)

- Capitale illustrativo: **$10.000** (nessun saldo effettivo).
- Massimo capitale per proposta: **5%**, cioè $500.
- Massima perdita teorica a stop: **0,25% del riferimento**, cioè $25; gli stop **non garantiscono** la perdita massima in un mercato reale.
- Stop indicativo: **1,5%** dall'ingresso teorico (limite 2%).
- Target indicativo: **2R** prima di costi e slippage.
- RSI: **45–72**, volume relativo **≥1,4×**, trend rialzista e pattern tecnico.
- Nessuna proposta con barra di 5 minuti troppo vecchia (massimo 12 minuti dal completamento).
- Massimo **3 schede WAIT/SKIP** contemporanee, **5 schede nuove al giorno**, **1 scheda per titolo al giorno**.

Questi valori sono **ipotesi di test**, non parametri ottimali né garanzia di una strategia con vantaggio statistico.

## 6. Cosa *non* è incluso

- Nessun invio di ordini ad Alpaca, né reali né in Paper Trading.
- Nessuna funzione di esecuzione automatica, nessun calcolo di profitto/perdita e nessun portafoglio movimentato.
- Nessuna quotazione consolidata US SIP; i prezzi arrivano soltanto da **IEX**, con copertura parziale.
- Nessuna notifica Telegram delle proposte 1.2 (gli avvisi Telegram preesistenti V1.1 per eventi tecnici restano invariati).
- Nessun backtest o validazione della redditività.

## 7. Sviluppo locale (facoltativo)

Dalla cartella del progetto:

```bash
npm install
npm test
npm run check
npm run dev
```

Il codice è già pronto per Wrangler, ma prima del deploy serve impostare **il tuo database_id reale** nel `wrangler.jsonc` (o riusare quello già configurato), e creare i segreti nel tuo account. Non usare il placeholder dello ZIP su un'istanza di produzione.

Per la migrazione da browser, esegui solo `0003_proposals.sql`; se gestisci le migrazioni con Wrangler, controlla lo stato tramite `wrangler d1 migrations list` prima di applicare file già eseguiti manualmente.

## Se compare un errore

- **Errore applicativo al caricamento**: verifica la migrazione 0003 e il binding D1 `DB`, poi **Worker → Observability → Logs**.
- **Scanner tecnico vuoto**: verifica se l'ultima scansione è `SKIPPED`, se il mercato è aperto e se gli indicatori 5Min sono disponibili.
- **Zero proposte**: normale se non c'è breakout valido; il sistema non inventa segnali.
- **Skeptic: SOLO REGOLE**: manca il binding Workers AI `AI`.
- **Proposte con `WAIT`**: deliberato; non esiste un pulsante BUY né ordini automatici.

**Nota sui test:** verificati algoritmi e integrazione locale con API Alpaca e D1 simulati. Il deploy effettivo e la risposta delle API reali devono essere ancora collaudati nel tuo account Cloudflare.
