# Aggiornamento a 1.2.1 — capitale Alpaca Paper

1. Fai un backup del database D1.
2. Se sei ancora alla versione 1.1, esegui **prima** `migrations/0003_proposals.sql`, poi `migrations/0004_paper_snapshots.sql`. Se hai già applicato la migrazione 1.2, esegui soltanto `0004_paper_snapshots.sql`.
3. Nella dashboard Cloudflare Workers apri il Worker esistente, Edit code, incolla **tutto** il file `worker-single-file.js`, Deploy.
4. Non creare nuove API key e non cambiare `DB` o i segreti già impostati.
5. Apri la dashboard: *Patrimonio Alpaca Paper* deve mostrare il valore letto dal conto (non 10k).
6. Esegui la scansione per registrare il primo snapshot. Anche se la borsa è chiusa, lo snapshot Paper viene salvato.
7. Se la sincronizzazione non funziona, consulta Worker → Observability → Logs; il dimensionamento delle proposte si blocca automaticamente.

**Attenzione:** V1.2.1 sincronizza il capitale ma NON invia ordini. La modalità auto-paper e i Telegram per fill reali del simulatore richiedono ancora la V1.3.
