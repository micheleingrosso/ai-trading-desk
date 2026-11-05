# AI Trading Desk 1.3.1 — Scalabilità, diagnostica e ORB informativo

Progetto didattico e personale di osservazione e **trading automatizzato esclusivamente su Alpaca Paper Trading**. Il Worker **non contiene endpoint di esecuzione su Alpaca Live**. Questo codice NON è stato pubblicato sull'account dell'utente. 

## Le novità

1. **Scansione scaglionata** in 5 tranche (cron ogni 1 minuto), massimo 50 titoli nella watchlist. Ogni simbolo viene analizzato indicativamente una volta ogni 5 minuti; la scansione manuale controlla al massimo i primi 10 titoli ed è sempre senza ordini.
2. **Alpaca multi-symbol batches** per le barre 5m e 15m, limite 4 simboli per richiesta, gestione esplicita di `next_page_token` e fail-closed su paginazione incompleta o risposta API inattesa.
3. **Cache D1 incrementale**: storico iniziale per massimo 4 titoli alla volta, poi si salvano principalmente candele nuove e completate; cooldown 30 minuti per bootstrap incompleto. Gli ordini non partono su titoli senza storico affidabile.
4. **Controlli più frequenti**: nuove opportunità ogni 5 minuti circa; riconciliazione esecuzioni/notifiche ogni minuto durante il mercato, più sporadica durante la notte. L'ora di New York è gestita con `America/New_York`.
5. **Notizie ogni 15 minuti**, con stato di freschezza: se Alpaca News è indisponibile o l'ultimo controllo riuscito è troppo vecchio (oltre 20 minuti), nuovi ingressi automatici bloccati. Notifiche e posizioni già aperte continuano a essere monitorate.
6. **Diagnostica per ticker** con motivo del filtro (`NO_PATTERN`, `FILTERED`, `NOT_READY`, `DATA_ERROR`, `SETUP_READY`) e indicatori RSI/volume; durata scansione nello storico. `SETUP_READY` non equivale a un ordine autorizzato: servono ancora notizie, Skeptic, broker e regole di rischio.
7. **ORB 15 minuti**: concetto adattato dal metodo `trader-entry` di [Jakeschincariol/day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill). Segnale sulla *prima candela completata* sopra l'opening range 9:30–9:45 ET. **Solo informativo**, non è inserito fra i trigger che aprono posizioni.
8. **Capacità informativa adeguata alla watchlist**: fino a 15 eventi Scout/die, 20 eventi tecnici/die e 10 schede teoriche/die; i limiti di ordini Paper restano invariati (3 nuovi al giorno). Il conteggio delle schede pendenti è limitato alla giornata corrente, non allo storico intero.
9. **Controlli conservativi**: niente ingressi nei primi 15 minuti di seduta, gate per nuova release e forced pause dopo migrazione. Limiti finanziari Paper esistenti invariati.
10. **Manutenzione settimanale** della sola cache di mercato (5m oltre 21 giorni e 15m oltre 60); trade, fill, contabilità e audit non vengono cancellati.

## Skill del repository GitHub

Non abbiamo importato indiscriminatamente gli undici pacchetti Python di Claude. Abbiamo usato **il concetto di Opening Range Breakout di `trader-entry`** con una implementazione JS propria, esclusivamente informativa. Il progetto preserva e ottimizza le sue funzioni già esistenti corrispondenti a `trader-scanner`, `trader-news`, `trader-budget`, `trader-risk`, `trader-broker` e `trader-alerts`. Restano da valutare separatamente `trader-timemachine`, `trader-analyst` e `trader-pelosi`; non sono implementati nella 1.3.1.

## Sicurezza e limiti

- Paper only. Nessuna chiave live, leva volontaria o short-selling.
- Ordini bracket GTC ancora gestiti dal broker Paper. Se il Worker ha un problema, gli stop presenti presso Alpaca non vengono cancellati dal deploy, ma stop e target **non garantiscono** un prezzo di esecuzione.
- Nessuna pretesa di profitti: rischio statistico non validato. Un test Paper non dimostra efficacia reale.
- 50 simboli è un **limite software, non una promessa di performance**. Su Workers Free il limite CPU è restrittivo; raccomandiamo osservare Metrics e considerare Workers Paid prima di aumentare oltre 10–20 simboli.
- La raccolta IEX può essere incompleta; nessuna decisione su dati stantii.
- Il codice non impone ancora liquidazione forzata a fine sessione, quindi posizioni Paper potrebbero restare aperte overnight.

## Installazione

Leggi prima **AGGIORNAMENTO_1.3.1.md**. Ordine obbligatorio:

1. Metti in pausa Auto Paper.
2. Backup del Worker esistente e D1.
3. Applica migrazione `migrations/0006_scaling_diagnostics.sql`.
4. Sostituisci il codice con `worker-single-file.js` nell'editor Worker, oppure esegui un deploy Wrangler mantenendo configurazione e database ID reali.
5. Imposta esattamente **un** Cron Trigger: `* * * * 1-5`.
6. Collauda la dashboard, le notizie, lo scanner, Telegram, gli ordini esistenti e il monitoraggio.
7. **Solo dopo il collaudo:** valida manualmente la release in D1 e riabilita l'automazione dalla dashboard.

## Struttura file

- `src/market-data.js`: API storiche aggregate, cache, paginazione, tranche.
- `src/diagnostics.js`: spiegazione dei filtri.
- `src/technical.js`: RSI, EMA, SMA, breakout, bull flag e ORB15 informativo.
- `src/paper-executor.js`: motore precedente Paper, con gate aggiornamento e limitazioni prudenziali.
- `src/index.js`: Worker, cron, sincronizzazione, web API e dashboard.
- `src/ui.js`: dashboard e nuovo pannello diagnostico.
- `migrations/0006_scaling_diagnostics.sql`: migrazione additiva, pausa forzata.
- `worker-single-file.js`: codice completo, autogenerato, pronto per editor Cloudflare.
- `test/`: test locali Node.js con API simulate e database in-memory.

## Test locale

Richiede Node.js 22+.

```bash
npm test
npm run check
npm run build:single
```

I test non effettuano ordini reali o su account di terzi. Le simulazioni broker non sostituiscono una prova su Alpaca Paper e la misurazione di CPU/latency in Cloudflare.
