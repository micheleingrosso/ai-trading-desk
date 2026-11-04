# AI Trading Desk 1.2 — Entry • Exit • Budget • Risk • Skeptic

Questa è la prosecuzione **non distruttiva** dell'app già online in V1.1. Non usare chiavi API reali nel codice e non collegare un broker di negoziazione.

**Istruzioni: [AGGIORNAMENTO_1.2.md](AGGIORNAMENTO_1.2.md)**

## Aggiunte in 1.2

- Analisi **Entry** e **Exit**: livelli puramente indicativi per candidati long (close 5Min, stop, target 2R), senza quotazioni eseguibili.
- **Budget** e **Risk** matematici, indipendenti dall'AI: massimo $500 esposti a titolo e $25 di perdita teorica allo stop su capitale illustrativo da $10.000.
- **Skeptic** come modulo Workers AI opzionale (binding `AI`); può dare solo `WAIT` o `SKIP` e non ha alcuna funzione di approvazione.
- Database storico `trade_proposals` e `proposal_audit`, migrazione additiva `0003_proposals.sql`.
- Nuova sezione **Proposte 1.2** con livelli, obiezioni e possibilità di archiviare una scheda (non un ordine).
- Blocco su dati vecchi, indicatori mancanti, RSI fuori soglia, esposizione eccedente, segnali duplicati o limite giornaliero superato.

## Sicurezza e limiti

La versione non invia ordini, né veri né virtuali. L'API Alpaca resta limitata a dati e clock. La V1.3 introdurrà in futuro il portafoglio **Paper Trading**. L'archiviazione di una scheda non autorizza e non crea alcuna operazione.

Il mercato IEX rappresenta soltanto una parte degli scambi USA; pattern di volume e prezzi possono differire dal mercato consolidato. Non è una strategia validata né una raccomandazione finanziaria.

## File principali

- `worker-single-file.js`: Worker completo pronto per editor Cloudflare.
- `migrations/0003_proposals.sql`: **solo nuova migrazione** da eseguire su D1 V1.1.
- `src/proposals.js`: funzioni pure di Risk/Entry/Exit/Budget e modulo Skeptic.
- `src/index.js`: integrazione delle proposte nella scansione e API di archiviazione.
- `src/ui.js`: sezione Proposte 1.2.
- `test/*.test.js`: test con D1 e Alpaca simulati.

Per eseguire la suite: `npm test && npm run check` (Node.js 22+). Questi test non sostituiscono un collaudo remoto su Cloudflare.
