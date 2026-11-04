# GUIDA RAPIDA — AGGIORNAMENTO AI TRADING DESK DA 1.2.1 A 1.3

### Prima di iniziare

L'aggiornamento **non azzera watchlist, storico o saldo Paper**. Fai comunque **backup D1 e del Worker 1.2.1**. Non modificare le chiavi Alpaca. Impiega esclusivamente il conto **Paper Trading**.

### 1. Aggiorna il database

Cloudflare → D1 → `trading-desk-db` → Console. Apri `migrations/0005_paper_execution.sql`, copia tutto, incolla nella console ed esegui.

Controlla poi con:

```sql
SELECT enabled, paused_reason FROM paper_runtime WHERE id=1;
SELECT name FROM sqlite_master WHERE name IN ('paper_trades','paper_trade_events','paper_runtime','paper_execution_lock') ORDER BY name;
```

Risultato iniziale: **enabled = 0** e quattro tabelle nuove. Non cancellare le altre tabelle. Se manca la migrazione, la dashboard 1.3 restituirà un errore: esegui prima l'SQL.

### 2. Aggiorna il Worker già esistente

Cloudflare → Workers & Pages → `ai-trading-desk` → **Edit code**. Seleziona tutto il codice 1.2.1, sostituiscilo con **`worker-single-file.js`** e premi **Deploy**.

Mantieni i binding e i segreti: `DB`, `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY`, `DASHBOARD_PASSWORD`, `SESSION_SECRET`. I nomi vanno scritti esattamente così.

### 3. Configura Workers AI

Cloudflare Worker → Settings → Bindings → Add → **Workers AI**. Nome binding: **`AI`**. Se era già collegato nella 1.2, non aggiungerlo di nuovo.

Senza questo binding, l'AI non può autorizzare segnali: **nuovi ordini automatici bloccati**.

### 4. Configura Telegram

Se lo avevi già fatto nella 1.1, conserva le impostazioni. Altrimenti crea un bot tramite **@BotFather** su Telegram, avvia una chat privata con il bot e trova l'ID della chat usando le API Telegram o gli strumenti del tuo account. In Cloudflare → Settings → Variables and Secrets aggiungi come **Secret**:

- `TELEGRAM_BOT_TOKEN`: token del bot.
- `TELEGRAM_CHAT_ID`: ID numerico della chat (o ID della destinazione autorizzata).

Non condividere il token né inserirlo nel codice Worker.

Apri la dashboard e clicca **Test Telegram**. Deve arrivarti un messaggio di prova. Se non arriva, lascia AUTO PAPER spento e controlla i log Worker e le impostazioni di Telegram.

### 5. Configura i controlli automatici

Worker → Settings / Triggers → Cron Triggers. Sostituisci il vecchio trigger `*/15 * * * 1-5` con:

```text
*/5 * * * 1-5
```

Cron opera in **UTC**. Il motore legge il calendario Alpaca per sapere se il mercato è aperto; lo scanner lavora ogni 15 minuti e la riconciliazione di fill e Telegram ogni 5 minuti. Cambiare solamente il codice con l'editor **non** aggiorna sempre la schedulazione già pubblicata: controllala esplicitamente.

### 6. Collaudo a sistema disattivato

1. In dashboard deve apparire **PAPER IN PAUSA**.
2. Conto Alpaca Paper: patrimonio (es. 100.000 $), cash e watchlist visibili.
3. Premi **Test Telegram**: il messaggio deve arrivare.
4. Premi **Aggiorna esecuzioni**: esito `OK`, nessun ordine nuovo.
5. Premi **Esegui scansione**: esegue una scansione **informativa** e non genera nuovi ordini, anche se AUTO PAPER è poi attivo.
6. In D1 verifica `SELECT COUNT(*) FROM paper_trades;` → inizialmente 0.

### 7. Abilitazione AUTOMATICA SOLO PAPER (quando il collaudo è concluso)

Dopo aver verificato tutto, nel Worker aggiungi un nuovo **Secret**:

```text
Nome: PAPER_AUTOTRADE_ARM
Valore: PAPER_ONLY
```

Il segreto da solo **non** abilita gli ordini. Torna in dashboard → Auto Paper 1.3 → **Abilita AUTO PAPER**, digita `PAPER` nel prompt e conferma l'avviso. Ora il cron potrà inviare ordini **solo Alpaca Paper** qualora esistano segnali che passano tutti i controlli.

Per bloccare nuovi ordini premi **Pausa nuovi ordini**. La pausa **non chiude le posizioni** né cancella le protezioni stop/take-profit esistenti. Controlla i dettagli in Alpaca Paper.

### 8. Le notifiche che riceverai

- 📋 Ordine Paper inviato (prima del fill, potrebbe non eseguirsi).
- 🟢 Apertura confermata (prezzo medio effettivo, quantità, stop, target, profitto potenziale, perdita teorica).
- 🔵 Chiusura confermata o parziale (prezzi effettivi, P/L lordo realizzato, confronto con obiettivo).
- ⛔ Pausa di sicurezza e problemi di sincronizzazione.
- 📅 Riepilogo alla fine della seduta USA.

Le notifiche non sono istantanee: polling cron ogni cinque minuti e nessuna garanzia in caso di errori Cloudflare, Alpaca o Telegram.

### Se qualcosa non va

Apri **Workers → Observability → Logs**. Controlla le tabelle D1 `paper_trades`, `paper_trade_events`, `paper_runtime`. **Non** provare a forzare gli ordini eliminando record D1: se un POST è stato accettato da Alpaca, potresti creare posizioni duplicate. Disabilita AUTO PAPER e controlla gli ordini direttamente su Alpaca Paper prima di riprendere.
