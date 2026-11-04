# AI Trading Desk 1.2.1 — capitale Alpaca Paper sincronizzato

Aggiornamento **non distruttivo** della 1.2, che elimina il valore statico da 10.000 $.

- `GET https://paper-api.alpaca.markets/v2/account` legge direttamente equity, cash e buying_power tramite le credenziali Paper.
- La dashboard mostra equity, liquidità, disponibilità senza leva, massimali e variazione rispetto al primo snapshot.
- Le proposte informative usano **il 5% dell'equity** come limite nozionale e **lo 0,25% dell'equity** come perdita teorica allo stop, senza oltrepassare il cash effettivo.
- Le scansioni registrano snapshot in D1 per un primo storico dell'intero conto. La variazione del conto **non** equivale alla performance della strategia: questa sarà attribuibile al bot solo quando verranno registrati e riconciliati i suoi ordini Paper nella 1.3.
- Il sistema non legge/scrive endpoint di ordini in questa versione: **nessuna esecuzione automatica**, né reale né paper.
- Se Alpaca non risponde, non verrà mostrato un saldo fittizio né creata una proposta con budget inventato.

## Installazione

1. Backup D1.
2. Esegui solo `migrations/0004_paper_snapshots.sql` nella console D1 `trading-desk-db`. Le migrazioni 0001/0002/0003 devono già essere state applicate.
3. Workers & Pages → `ai-trading-desk` → Edit code: sostituisci tutto con `worker-single-file.js` e fai Deploy.
4. Mantieni binding `DB` e tutti i segreti preesistenti: `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY`, `DASHBOARD_PASSWORD`, `SESSION_SECRET`. Le chiavi devono essere **Alpaca Paper**, non Live.
5. Apri la dashboard. Il saldo del conto Paper si aggiornerà via API. Esegui una scansione (anche a mercato chiuso) per scrivere il primo snapshot nel database.
6. La dashboard mostrerà la variazione dal primo snapshot solo dopo che ne è stato salvato almeno uno.

## Limitazioni e sicurezza

- Endpoint Alpaca Paper di sola lettura; nessun ordine.
- `buying_power` è mostrato per trasparenza, ma non è usato come budget: potrebbe includere leva.
- L'equity corrente può cambiare anche per posizioni aperte manualmente o reset del conto. Non attribuire tali variazioni al bot.
- Notizie/prezzi IEX parziali; performance paper non predice necessariamente risultati live.
- Per test locali: `npm test` (Node 22 o successivo) e `npm run check`.
