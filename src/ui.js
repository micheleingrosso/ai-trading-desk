export const loginHtml = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Accesso · AI Trading Desk</title><link rel="stylesheet" href="/assets/app.css"></head>
<body class="login-page"><main class="login-card"><div class="brand"><span class="brand-icon">A<span class="brand-dot">●</span></span><span>AI TRADING <strong>DESK</strong></span></div><span class="eyebrow">AMBIENTE PRIVATO</span><h1>Benvenuto nel tuo trading desk.</h1><p class="muted">Scout monitora le anomalie di mercato. Accesso privato al simulatore Alpaca Paper. Il trading reale è tecnicamente escluso.</p><!--login-error--><form method="post" action="/login"><label for="password">Password della dashboard</label><input id="password" name="password" type="password" autocomplete="current-password" required placeholder="La tua password privata"><button class="btn primary" type="submit">Accedi alla dashboard <span>↗</span></button></form><div class="note"><strong>Solo Paper Trading.</strong> Non inserire chiavi API o credenziali del broker in questa pagina.</div></main></body></html>`;

export const dashboardHtml = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AI Trading Desk · 1.3.1</title><link rel="stylesheet" href="/assets/app.css"><script src="/assets/app.js" defer></script></head><body>
<div class="layout"><aside class="sidebar"><div class="brand"><span class="brand-icon">A<span class="brand-dot">●</span></span><span>AI TRADING <strong>DESK</strong></span></div><div class="sidebar-kicker">WORKSPACE / 01</div><nav aria-label="Navigazione principale"><a class="nav-item current" href="/"><span class="nav-sym">▦</span> Panoramica</a><a class="nav-item" href="#watch-section"><span class="nav-sym">◈</span> Watchlist</a><a class="nav-item" href="#signals-section"><span class="nav-sym">⌁</span> Anomalie Scout</a><a class="nav-item" href="#technical-section"><span class="nav-sym">⌁</span> Scanner tecnico</a><a class="nav-item" href="#diagnostics-section"><span class="nav-sym">◈</span> Diagnostica segnali</a><a class="nav-item" href="#execution-section"><span class="nav-sym">◉</span> Auto Paper 1.3.1</a><a class="nav-item" href="#proposals-section"><span class="nav-sym">◇</span> Proposte 1.2</a><a class="nav-item" href="#news-section"><span class="nav-sym">◉</span> Notizie</a><a class="nav-item" href="#log-section"><span class="nav-sym">▤</span> Log scansioni</a></nav><div class="side-bottom"><div class="safe-box"><span class="safe-dot"></span><div><strong>Safe mode attiva</strong><small id="sidebar-mode">Trading Paper in pausa</small></div></div><form method="post" action="/logout"><button type="submit" class="logout">Esci dall'account ↗</button></form></div></aside>
<main class="content"><header class="topbar"><div><div class="eyebrow">CONTROL ROOM <span class="kicker-sep">/</span> MARKET SCOUT</div><h1>Trading overview<span class="tiny-period">.</span></h1><p class="subtitle">Analisi di mercato e simulazione Alpaca Paper. Nessun denaro reale.</p></div><div class="header-actions"><div class="badge-outline" id="mode-badge"><span class="pulse"></span> PAPER IN PAUSA</div><button class="btn primary" id="scan-button">↻ Esegui scansione</button></div></header>
<div class="status-line"><span id="live-state">Caricamento dati…</span><span id="asof"></span></div>
<section class="stats" aria-label="Statistiche"><article class="stat"><span class="stat-label">PATRIMONIO ALPACA PAPER</span><strong id="virtual-balance">—</strong><small id="paper-sync-state">Sincronizzazione Alpaca in corso</small><div class="stat-line lblue"></div></article><article class="stat"><span class="stat-label">TITOLI MONITORATI</span><strong id="enabled-count">—</strong><small>Fino a 50 nella watchlist</small><div class="stat-line lcyan"></div></article><article class="stat"><span class="stat-label">ANOMALIE REGISTRATE</span><strong id="signals-count">—</strong><small>Segnali ≠ raccomandazioni</small><div class="stat-line lpurple"></div></article><article class="stat"><span class="stat-label">ORDINI / POSIZIONI</span><strong id="order-position-count">0 / 0</strong><small>Storico ordini Paper / posizioni gestite</small><div class="stat-line lgreen"></div></article></section>
<section class="panel wide" id="paper-account-section"><div class="panel-head"><div><span class="eyebrow">PAPER ACCOUNT / ALPACA</span><h2>Patrimonio e limiti del simulatore</h2></div><span class="soft-tag">ALPACA PAPER · NESSUN LIVE</span></div>
<div class="paper-overview-grid">
<div><small>Liquidità cash</small><strong id="paper-cash">—</strong></div>
<div><small>Buying power (può includere leva)</small><strong id="paper-buying-power">—</strong></div>
<div><small>Liquidità senza leva</small><strong id="paper-usable-cash">—</strong></div>
<div><small>Massimo per proposta 5%</small><strong id="paper-max-notional">—</strong></div>
<div><small>Rischio teorico 0,25%</small><strong id="paper-max-risk">—</strong></div>
<div><small>Variazione conto dal primo snapshot</small><strong id="paper-change">—</strong></div>
</div><p class="mini-info" id="paper-account-info">Dati direttamente da Alpaca Paper. Variazione del conto ≠ performance attribuibile al bot: le operazioni del bot sono registrate separatamente.</p></section>
<section class="grid-main"><div class="panel" id="watch-section"><div class="panel-head"><div><span class="eyebrow">LIVE MONITOR</span><h2>Watchlist</h2></div><div class="panel-actions"><span class="soft-tag">FEED: IEX</span></div></div><div class="table-scroll"><table><thead><tr><th>TITOLO</th><th>ULTIMO CLOSE</th><th>VOLUME 15M</th><th>DATA BARRA</th><th>AZIONI</th></tr></thead><tbody id="watch-body"><tr><td colspan="5" class="empty">Caricamento watchlist…</td></tr></tbody></table></div><form class="watch-form" id="watch-form"><label for="symbol-input">Aggiungi un titolo alla watchlist</label><div class="form-row"><input id="symbol-input" maxlength="10" placeholder="Ticker, es. ORCL" autocomplete="off" required><button type="submit" class="btn light">+ Aggiungi</button></div></form></div>
<div class="right-stack"><section class="panel compact"><div class="panel-head"><div><span class="eyebrow">SYSTEM HEALTH</span><h2>Stato monitoraggio</h2></div><span class="health-light" id="health-light"></span></div><div class="health-grid"><span>Ultimo controllo</span><strong id="last-run-at">—</strong><span>Esito</span><strong id="last-run-status">—</strong><span>Simboli controllati</span><strong id="last-run-count">—</strong><span>Nuove anomalie</span><strong id="last-run-alerts">—</strong></div><p class="mini-info" id="last-run-detail">In attesa del primo controllo.</p></section><section class="panel compact"><div class="panel-head"><div><span class="eyebrow">SCOUT / RULES</span><h2>Soglie attive</h2></div></div><div class="rule"><div><strong>±3%</strong><small>Movimento 1 ora</small></div><span>oppure</span><div><strong>2.0×</strong><small>Volume fascia oraria</small></div></div><p class="mini-info">Confronto sulla mediana dello stesso intervallo di 15 minuti degli ultimi 5 giorni disponibili. Feed IEX parziale; almeno 3 giorni validi per il controllo volumi.</p></section></div></section>
<section class="panel wide" id="technical-section"><div class="panel-head"><div><span class="eyebrow">TECHNICAL SCANNER / 5 MIN</span><h2>Indicatori e pattern</h2></div><span class="soft-tag">RSI14 · EMA20 · SMA50 · BREAKOUT</span></div><p class="mini-info intro-note">Analisi algoritmica di barre IEX completate. I pattern sono ipotesi descrittive, non segnali operativi; dati mancanti o vecchi non generano eventi.</p><div class="table-scroll"><table><thead><tr><th>TITOLO</th><th>RSI 14</th><th>EMA 20</th><th>SMA 50</th><th>TREND</th><th>PATTERN</th><th>ULTIMA BARRA</th></tr></thead><tbody id="technical-body"><tr><td colspan="7" class="empty">Caricamento indicatori…</td></tr></tbody></table></div><div class="panel-head subhead"><div><span class="eyebrow">EVENT HISTORY</span><h2>Eventi tecnici registrati</h2></div><span class="soft-tag">MAX 6 / GIORNO</span></div><div id="technical-events" class="signal-list"><p class="empty">Nessun evento tecnico.</p></div></section>
<section class="panel wide" id="execution-section"><div class="panel-head"><div><span class="eyebrow">EXECUTOR / ALPACA PAPER V1.3.1</span><h2>Trading automatico in simulazione</h2></div><span class="soft-tag" id="auto-paper-state">DISATTIVATO</span></div>
<p class="mini-info intro-note">Questa funzione utilizza ESCLUSIVAMENTE l’endpoint Alpaca Paper. Nuovi ingressi solo con doppia abilitazione, dati correnti, validazione AI e regole di rischio. Max 5% patrimonio per posizione, perdita teorica 0,25% e stop giornaliero a -1%. La pausa blocca nuovi ingressi, NON cancella gli stop già inviati. Il P/L è lordo e le notifiche Telegram possono arrivare con alcuni minuti di ritardo.</p>
<div class="paper-overview-grid">
<div><small>Stato esecutore</small><strong id="exec-state">IN PAUSA</strong></div>
<div><small>P/L realizzato del bot</small><strong id="exec-pnl">—</strong></div>
<div><small>Operazioni storiche</small><strong id="exec-count">0</strong></div>
<div><small>Operazioni attive / in attesa</small><strong id="exec-active">0</strong></div>
<div><small>Telegram ordini</small><strong id="exec-telegram">—</strong></div>
<div><small>Controllo doppia abilitazione</small><strong id="exec-arm">—</strong></div>
</div>
<p class="mini-info" id="exec-reason">Il trading è inizialmente disabilitato. Configura Telegram, Workers AI e il segreto di abilitazione Paper prima di accendere l’automazione.</p>
<div class="paper-actions"><button type="button" class="btn light" id="paper-telegram-test">✉ Test Telegram</button><button type="button" class="btn light" id="paper-reconcile">↻ Aggiorna esecuzioni</button><button type="button" class="btn light" id="paper-enable">Abilita AUTO PAPER</button><button type="button" class="btn mini-button-danger" id="paper-pause">⏸ Pausa nuovi ordini</button></div>
<div class="panel-head subhead"><div><span class="eyebrow">ORDER HISTORY</span><h2>Operazioni Paper</h2></div><span class="soft-tag">Solo fill confermati da Alpaca</span></div>
<div class="table-scroll"><table><thead><tr><th>DATA</th><th>TITOLO</th><th>STATO</th><th>QTÀ</th><th>INGRESSO REALE</th><th>USCITA REALE</th><th>P/L LORDO</th><th>ATTESO</th></tr></thead><tbody id="paper-trades-body"><tr><td class="empty" colspan="8">Nessun ordine Paper.</td></tr></tbody></table></div>
<div class="panel-head subhead"><div><span class="eyebrow">TELEGRAM AUDIT</span><h2>Ultime notifiche</h2></div></div>
<div class="signal-list" id="paper-events"><p class="empty">Nessun evento di esecuzione.</p></div>
</section>
<section class="panel wide" id="diagnostics-section"><div class="panel-head"><div><span class="eyebrow">SCAN / MOTIVI</span><h2>Perché il bot non apre?</h2></div><span class="soft-tag">Diagnostica 1.3.1</span></div><p class="mini-info">Filtri tecnici preliminari. Un setup idoneo non significa che Alpaca o Skeptic autorizzino l'ordine. ORB15 è informativo e NON attiva acquisti.</p><div class="table-scroll"><table><thead><tr><th>TITOLO</th><th>ESITO</th><th>MOTIVO</th><th>RSI</th><th>VOLUME</th><th>ORB15</th><th>BARRA</th></tr></thead><tbody id="diagnostics-body"><tr><td class="empty" colspan="7">Diagnostica disponibile dopo le scansioni.</td></tr></tbody></table></div></section>
<section class="panel wide" id="proposals-section"><div class="panel-head"><div><span class="eyebrow">ENTRY / EXIT / RISK / SKEPTIC</span><h2>Proposte informative</h2></div><span class="soft-tag" id="skeptic-status">SKEPTIC: SOLO REGOLE</span></div><p class="mini-info intro-note">Livelli teorici sul close delle barre 5m IEX, non quotazioni eseguibili. Massimo 5% del patrimonio Alpaca Paper per proposta e perdita teorica allo stop ≤0,25%. Nessuna leva finanziaria; il dimensionamento non supera la liquidità disponibile. Queste schede restano informative, «Archivia» non invia ordini. Gli ordini Paper automatici sono registrati nella sezione Auto Paper 1.3.</p><div id="proposals-list" class="proposal-list"><p class="empty">Nessuna proposta disponibile. Servono dati correnti, un pattern convalidato e i controlli di rischio superati.</p></div></section>
<section class="panel wide" id="news-section"><div class="panel-head"><div><span class="eyebrow">NEWS FEED / ALPACA</span><h2>Notizie monitorate</h2></div><span class="soft-tag" id="telegram-status">TELEGRAM: NON CONFIGURATO</span></div><p class="mini-info intro-note">Titoli e fonti originali di notizie pertinenti alla watchlist. Nessun modello AI le interpreta ancora: l'analisi semantica arriverà in una fase successiva.</p><div class="news-grid" id="news-list"><p class="empty">Non ci sono notizie salvate.</p></div></section>
<section class="panel wide" id="signals-section"><div class="panel-head"><div><span class="eyebrow">OPPORTUNITY RADAR</span><h2>Anomalie rilevate</h2></div><span class="soft-tag">ULTIMI 30 EVENTI</span></div><div class="signal-list" id="signals-list"><p class="empty">Non ci sono ancora anomalie registrate.</p></div></section>
<section class="panel wide" id="log-section"><div class="panel-head"><div><span class="eyebrow">SYSTEM AUDIT</span><h2>Storico scansioni</h2></div></div><div class="table-scroll"><table><thead><tr><th>DATA / ORA</th><th>ORIGINE</th><th>STATO</th><th>TITOLI</th><th>NUOVE ANOMALIE</th><th>DURATA</th></tr></thead><tbody id="logs-body"><tr><td colspan="6" class="empty">Nessuna scansione disponibile.</td></tr></tbody></table></div></section>
<footer>AI TRADING DESK · SCOUT 1.2.1 <span>•</span> Analisi informativa. Saldi sincronizzati da Alpaca Paper, nessun ordine inviato e performance del bot non ancora misurabile.</footer></main></div><div id="toast" class="toast" role="status" aria-live="polite"></div></body></html>`;

export const appCss = `
.paper-overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.paper-overview-grid>div{background:#101e30;border:1px solid #2a415a;border-radius:10px;padding:15px;display:flex;flex-direction:column;gap:8px}.paper-overview-grid small{font-size:10px;color:#8aa0b8}.paper-overview-grid strong{font-size:20px;font-variant-numeric:tabular-nums;color:#dcecf9}@media(max-width:750px){.paper-overview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:430px){.paper-overview-grid{grid-template-columns:1fr}}
.proposal-list{display:grid;gap:13px}.proposal-card{border:1px solid #2a4258;background:#112138;padding:18px;border-radius:12px}.proposal-top,.proposal-bottom{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.proposal-kpis{display:grid;grid-template-columns:repeat(5,minmax(90px,1fr));gap:10px;margin:15px 0}.proposal-kpis div{background:#0b1929;padding:12px;border-radius:8px}.proposal-kpis small{font-size:10px;display:block;color:#91a5b9}.proposal-kpis strong{display:block;margin-top:5px}.proposal-risks{margin:8px 0;color:#abc0d1;line-height:1.7;padding-left:21px}.proposal-muted{color:#95aac4;font-size:12px;line-height:1.6}.mini-button-danger{color:#e0b2b8}.proposal-card .mini-button{margin-top:6px}@media(max-width:800px){.proposal-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}

:root{color-scheme:dark;--bg:#0b1220;--sidebar:#0d1728;--panel:#121e31;--panel2:#142237;--border:#26354a;--txt:#eaf0fc;--muted:#94a2b9;--sky:#6de2e4;--violet:#b497ff;--green:#8eeab7;--red:#fb999e;--warning:#efc58d}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--txt);font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px}button,input{font:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:wait}a{color:inherit;text-decoration:none}.layout{display:grid;grid-template-columns:255px minmax(0,1fr);min-height:100vh}.sidebar{background:var(--sidebar);border-right:1px solid var(--border);padding:31px 18px;display:flex;flex-direction:column;gap:35px;position:sticky;top:0;height:100vh}.brand{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;letter-spacing:1px;white-space:nowrap}.brand strong{color:var(--sky);font-weight:750}.brand-icon{display:grid;place-items:center;width:35px;height:35px;border-radius:10px;background:#19394a;color:var(--sky);font-size:20px;font-weight:900;letter-spacing:-1px;position:relative}.brand-dot{position:absolute;bottom:3px;right:4px;font-size:8px}.sidebar-kicker,.eyebrow{font-size:10px;font-weight:800;letter-spacing:2.2px;color:var(--sky)}.sidebar-kicker{margin-top:22px;color:#627792}nav{display:grid;gap:8px;margin-top:-18px}.nav-item{padding:13px 14px;border-radius:10px;color:#9aa9c0;display:flex;align-items:center;gap:11px}.nav-item:hover,.nav-item.current{background:#172c41;color:#e4f9ff}.nav-item.current{box-shadow:inset 3px 0 0 var(--sky)}.nav-sym{font-size:17px;color:#7ac9d0;width:18px}.side-bottom{margin-top:auto;display:grid;gap:16px}.safe-box{border:1px solid #284b48;background:#112e30;border-radius:13px;padding:14px;display:flex;align-items:center;gap:10px}.safe-box strong{display:block;font-size:12px}.safe-box small{display:block;color:#86b6ad;margin-top:4px}.safe-dot{width:9px;height:9px;border-radius:50%;background:var(--green);box-shadow:0 0 0 5px #17483b}.logout{background:none;border:none;color:#8b9eb8;cursor:pointer}.content{padding:40px clamp(18px,3vw,46px) 20px;min-width:0;max-width:1750px;width:100%;margin:0 auto}.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:24px}.kicker-sep{color:#627792;padding:0 8px}.topbar h1{font-size:clamp(30px,3.1vw,44px);letter-spacing:-1.7px;margin:11px 0 6px;line-height:1.1}.tiny-period{color:var(--sky)}.subtitle{font-size:13px;color:var(--muted);margin:0}.header-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.badge-outline{font-size:10px;letter-spacing:1px;border:1px solid #2b584e;color:#9ce4bb;border-radius:7px;padding:11px 12px;font-weight:800}.pulse,.health-light{display:inline-block;width:7px;height:7px;border-radius:50%;background:#6adbab;margin-right:7px}.btn{padding:12px 17px;border-radius:9px;border:1px solid var(--border);font-weight:750;transition:filter .2s}.btn:hover{filter:brightness(1.08)}.btn.primary{background:var(--sky);color:#071521;border-color:var(--sky)}.btn.light{background:#193b49;color:var(--sky);border-color:#275063}.status-line{margin:28px 0 14px;display:flex;justify-content:space-between;gap:10px;color:#788da8;font-size:11px;align-items:center}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.stat{position:relative;overflow:hidden;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:21px 21px 24px;display:flex;flex-direction:column;gap:7px}.stat-label{font-size:10px;letter-spacing:1.1px;color:#95a7bf;font-weight:750}.stat strong{font-size:clamp(22px,2.7vw,31px);letter-spacing:-.6px;font-variant-numeric:tabular-nums}.stat small{font-size:11px;color:#758aa4}.stat-line{position:absolute;bottom:0;left:0;width:100%;height:3px}.lblue{background:#6db6fa}.lcyan{background:var(--sky)}.lpurple{background:var(--violet)}.lgreen{background:var(--green)}.grid-main{display:grid;grid-template-columns:minmax(0,1.85fr) minmax(270px,1fr);gap:16px;margin:18px 0}.panel{background:var(--panel);border:1px solid var(--border);border-radius:15px;min-width:0;padding:22px}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:17px}.panel h2{font-size:20px;font-weight:750;letter-spacing:-.5px;margin:7px 0 0}.soft-tag{border:1px solid #3b4b64;color:#96aecb;font-size:10px;letter-spacing:.7px;padding:7px 9px;border-radius:7px;white-space:nowrap}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%;white-space:nowrap}th{text-align:left;font-size:9px;letter-spacing:1px;font-weight:850;color:#7187a2;padding:11px 9px 16px;border-bottom:1px solid var(--border)}td{font-size:12px;padding:16px 9px;border-bottom:1px solid #263347;color:#c8d6e7}td:last-child,th:last-child{text-align:right}.ticker{font-weight:850;font-size:13px;color:#f3f7fd}.ticker-label{display:block;font-size:10px;font-weight:400;color:#8597b0;margin-top:3px}.dimmed{opacity:.6}.muted{color:var(--muted)}.muted-sm{color:#8193ae;font-size:11px}.empty{padding:22px;text-align:center;color:#748ba9}.mini-button{border:1px solid #334862;padding:7px 10px;border-radius:7px;background:none;color:#9fbad2;font-size:11px}.mini-button:hover{color:white;background:#22354a}.watch-form{margin-top:25px;border-top:1px solid var(--border);padding-top:19px}.watch-form label,.login-card label{font-size:11px;color:#a0b2ca;display:block;margin-bottom:10px}.form-row{display:flex;gap:8px}.form-row input,.login-card input{min-width:0;background:#0a1625;color:var(--txt);border:1px solid #324660;border-radius:8px;padding:11px 12px;outline:none}.form-row input:focus,.login-card input:focus{border-color:var(--sky)}.form-row input{flex:1}.right-stack{display:grid;gap:16px;align-content:start}.panel.compact{padding:20px}.health-light{background:#677d98}.health-light.ok{background:var(--green)}.health-light.warn{background:var(--warning)}.health-light.error{background:var(--red)}.health-grid{display:grid;grid-template-columns:1fr auto;gap:13px 5px;font-size:12px}.health-grid span{color:#93a5bc}.health-grid strong{font-size:12px;text-align:right;font-weight:700;max-width:165px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mini-info{font-size:11px;color:#8198b1;line-height:1.6;margin:19px 0 0}.rule{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #2d3d54;border-radius:11px;padding:16px 12px}.rule>span{color:#8695ae;font-size:10px}.rule>div{text-align:center}.rule strong{display:block;font-size:25px;color:var(--sky)}.rule small{display:block;font-size:10px;color:#8ca1bc;margin-top:5px}.wide{margin-bottom:17px}.signal-list{display:grid;gap:10px}.signal-card{border:1px solid #334259;border-radius:10px;background:#17263a;padding:14px 16px;display:grid;grid-template-columns:85px 1fr auto;align-items:center;gap:14px}.signal-tag{font-size:13px;font-weight:850;color:var(--sky)}.signal-detail{color:#cedbe9;font-size:12px;line-height:1.5}.signal-meta{font-size:10px;color:#7e96ae;text-align:right}.signal-meta strong{display:block;color:#e4edf8;font-size:12px;margin-bottom:6px}footer{color:#677c97;font-size:10px;letter-spacing:.45px;padding:10px 0 15px}footer span{padding:0 8px}.subhead{margin-top:26px;padding-top:20px;border-top:1px solid var(--border)}.intro-note{margin:0 0 15px}.tag-up{color:var(--green)}.tag-down{color:var(--red)}.tag-neutral{color:#aab9ce}.pattern{font-size:10px;padding:5px 8px;border-radius:6px;color:#9ce8db;border:1px solid #295b5b;white-space:nowrap}.pattern.warning{color:var(--warning);border-color:#775b3a}.news-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.news-item{display:grid;gap:10px;border:1px solid var(--border);padding:16px;border-radius:10px;background:#15253a}.news-item a{font-size:13px;font-weight:700;color:#dfeaf7;line-height:1.5}.news-item a:hover{color:var(--sky);text-decoration:underline}.news-meta{font-size:10px;color:#8fa6c1}.news-symbols{font-size:10px;color:var(--sky)}@media(max-width:800px){.news-grid{grid-template-columns:1fr}}.paper-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.paper-actions .btn{font-size:12px}.paper-actions .mini-button-danger{background:#482334;color:#ffdbe2;border:1px solid #a34b65;border-radius:8px;padding:12px 15px;cursor:pointer}.paper-actions button:disabled{opacity:.5;cursor:not-allowed}.signal-detail{white-space:pre-line}.toast{position:fixed;bottom:25px;right:25px;background:#1d4051;border:1px solid #39848e;color:#e8fcff;padding:14px 18px;border-radius:10px;box-shadow:0 15px 40px #0007;max-width:440px;line-height:1.5;opacity:0;pointer-events:none;transform:translateY(12px);transition:.2s}.toast.show{opacity:1;transform:translateY(0)}.toast.error{background:#4b2435;border-color:#a94f66}.login-page{display:grid;place-items:center;min-height:100vh;padding:20px;background:radial-gradient(ellipse at 60% 20%,#15324c,transparent 47%),#0b1220}.login-card{max-width:450px;width:100%;border:1px solid #344259;border-radius:18px;padding:38px;background:#122035;box-shadow:0 24px 75px #0006}.login-card .brand{margin-bottom:33px}.login-card h1{font-size:32px;line-height:1.13;letter-spacing:-.9px;margin:13px 0 12px}.login-card .muted{line-height:1.6;font-size:13px}.login-card form{margin:28px 0;display:grid;gap:10px}.login-card .btn{display:flex;justify-content:space-between}.note{color:#819eb2;font-size:11px;line-height:1.7;padding:14px;background:#0e1d2a;border-radius:10px}.note strong{color:#bad8e2}.error{color:#ffacb4;padding:12px;border:1px solid #8d4560;border-radius:9px;font-size:12px}
@media(max-width:1200px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-main{grid-template-columns:1fr}.right-stack{grid-template-columns:1fr 1fr}.content{padding:28px 23px}}@media(max-width:800px){.layout{display:block}.sidebar{position:static;width:100%;height:auto;padding:17px 20px;gap:13px}.sidebar-kicker,.sidebar nav,.side-bottom{display:none}.content{padding:24px 16px}.topbar{display:block}.header-actions{margin-top:22px}.status-line{flex-wrap:wrap}.right-stack{grid-template-columns:1fr}.signal-card{grid-template-columns:65px 1fr}.signal-meta{grid-column:2;text-align:left}}@media(max-width:460px){.stats{gap:9px}.stat{padding:16px 13px 21px}.stat strong{font-size:23px}.stat-label{font-size:9px}.panel{padding:17px}.badge-outline{font-size:9px}.form-row{flex-wrap:wrap}.form-row .btn{flex:1}}
`;

export const appJs = `
const $ = id => document.getElementById(id);
const money = n => n!==null && n!==undefined && n!=='' && Number.isFinite(Number(n)) ? '$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
const integer = n => Number.isFinite(Number(n)) ? Number(n).toLocaleString('it-IT') : '—';
const fmtDate = x => x ? new Date(x).toLocaleString('it-IT',{timeZone:'Europe/Rome',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
function el(tag,txt='',className=''){const node=document.createElement(tag);node.textContent=txt;if(className)node.className=className;return node;}
function cell(tr, txt, className=''){const node=el('td',txt,className);tr.appendChild(node);return node;}
let toastTimer;
function toast(msg,error=false){const e=$('toast');e.textContent=msg;e.className='toast show'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.className='toast',5200);}
async function api(path,options={}){
  const res=await fetch(path,{credentials:'same-origin',...options});
  if(res.status===401){window.location.assign('/login');throw new Error('Sessione scaduta');}
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error||'Errore di comunicazione');
  return data;
}
function drawWatch(watchlist){
 const root=$('watch-body');root.replaceChildren();
 if(!watchlist.length){let r=el('tr');cell(r,'Nessun titolo configurato','empty').colSpan=5;root.appendChild(r);return;}
 for(const item of watchlist){
  const tr=el('tr');if(!item.enabled)tr.className='dimmed';
  const symbol=cell(tr,'','');const st=el('span',item.symbol,'ticker');symbol.appendChild(st);symbol.appendChild(el('small',item.label||(!item.enabled?'Disattivato':''),'ticker-label'));
  cell(tr,item.price==null?'—':money(item.price));cell(tr,item.volume==null?'—':integer(item.volume));cell(tr,fmtDate(item.bar_ts),'muted-sm');
  const actions=cell(tr,'');const btn=el('button',item.enabled?'Disattiva':'Riattiva','mini-button');btn.type='button';
  btn.addEventListener('click',async()=>{btn.disabled=true;try{
   if(item.enabled)await api('/api/watchlist/'+encodeURIComponent(item.symbol),{method:'DELETE'});
   else await api('/api/watchlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:item.symbol})});
   await refresh();toast(item.enabled?'Titolo disattivato':'Titolo riattivato');
  }catch(e){toast(e.message,true);}finally{btn.disabled=false;}});actions.appendChild(btn);root.appendChild(tr);
 }
}
function drawSignals(list){
 const root=$('signals-list');root.replaceChildren();
 if(!list.length){root.appendChild(el('p','Nessuna anomalia registrata. Scout memorizzerà eventi soltanto durante le sedute aperte, con dati sufficienti e regole rispettate.','empty'));return;}
 for(const item of list){
  const card=el('div','','signal-card');card.appendChild(el('div',item.symbol,'signal-tag'));
  const detail=el('div',item.reason,'signal-detail');card.appendChild(detail);
  const meta=el('div','','signal-meta');meta.appendChild(el('strong',money(item.price)));meta.appendChild(el('span',fmtDate(item.bar_ts)+' · IEX'));card.appendChild(meta);root.appendChild(card);
 }
}
function drawTechnical(rows){
 const root=$('technical-body');root.replaceChildren();
 if(!rows.length){const tr=el('tr');cell(tr,'Nessun dato tecnico disponibile. Esegui una scansione a mercato aperto.','empty').colSpan=7;root.appendChild(tr);return;}
 for(const x of rows){
  const tr=el('tr');cell(tr,x.symbol,'ticker');
  cell(tr,x.rsi14==null?'—':Number(x.rsi14).toFixed(1));
  cell(tr,x.ema20==null?'—':money(x.ema20));cell(tr,x.sma50==null?'—':money(x.sma50));
  cell(tr,x.trend==='UP'?'RIALZISTA':x.trend==='DOWN'?'RIBASSISTA':'NEUTRALE',x.trend==='UP'?'tag-up':x.trend==='DOWN'?'tag-down':'tag-neutral');
  const pat=cell(tr,'');
  if(x.breakout)pat.appendChild(el('span','BREAKOUT','pattern'));
  if(x.bull_flag_candidate){if(x.breakout)pat.appendChild(el('span',' · '));pat.appendChild(el('span','FLAG?','pattern warning'));}
  if(!x.breakout&&!x.bull_flag_candidate)pat.textContent='—';
  cell(tr,fmtDate(x.bar_ts),'muted-sm');root.appendChild(tr);
 }
}
function drawTechnicalEvents(events){
 const root=$('technical-events');root.replaceChildren();
 if(!events.length){root.appendChild(el('p','Nessun evento tecnico registrato. Zero eventi è un risultato valido.','empty'));return;}
 for(const item of events){
  const row=el('div','','signal-card');row.appendChild(el('div',item.symbol,'signal-tag'));
  row.appendChild(el('div',item.kind+' · '+item.description,'signal-detail'));
  const meta=el('div','','signal-meta');meta.appendChild(el('strong',money(item.price)));
  meta.appendChild(el('span',fmtDate(item.bar_ts)));row.appendChild(meta);root.appendChild(row);
 }
}
function drawNews(rows){
 const root=$('news-list');root.replaceChildren();
 if(!rows.length){root.appendChild(el('p','Nessuna notizia disponibile. Controlla il log se la sorgente Alpaca News risponde con un errore.','empty'));return;}
 for(const item of rows){
  const card=el('article','','news-item'),a=el('a',item.headline);
  try{const url=new URL(item.source_url);if(!['https:','http:'].includes(url.protocol))continue;a.href=url.href;}catch{continue;}
  a.target='_blank';a.rel='noopener noreferrer';card.appendChild(a);
  card.appendChild(el('div',(item.source||'Fonte')+' · '+fmtDate(item.published_at),'news-meta'));
  card.appendChild(el('div',(item.symbols||[]).join(' · '),'news-symbols'));root.appendChild(card);
 }
}
function drawProposals(rows){
 const root=$('proposals-list');root.replaceChildren();
 if(!rows.length){root.appendChild(el('p','Nessuna proposta informativa. Richiede un pattern fresco e controlli di rischio superati.','empty'));return;}
 for(const p of rows){
  const card=el('article','','proposal-card'),top=el('div','','proposal-top');
  const label=el('div');label.appendChild(el('strong',p.symbol+' · '+p.source_event));label.appendChild(el('div',fmtDate(p.bar_ts)+' · solo IEX','proposal-muted'));
  top.appendChild(label);top.appendChild(el('span',p.status+' · '+p.skeptic_mode,'soft-tag'));card.appendChild(top);
  const grid=el('div','','proposal-kpis');
  for(const [k,v] of [['Ingresso teorico',money(p.entry_price)],['Stop teorico',money(p.stop_price)],['Target teorico',money(p.target_price)],['Azioni ipotetiche',String(p.shares)],['Rischio allo stop',money(p.loss_at_stop)]]){
    const box=el('div');box.appendChild(el('small',k));box.appendChild(el('strong',v));grid.appendChild(box);
  }
  card.appendChild(grid);card.appendChild(el('p',p.rationale||'', 'proposal-muted'));
  card.appendChild(el('p','SKEPTIC · '+p.skeptic_verdict,'proposal-muted'));
  const ul=el('ul','','proposal-risks');for(const item of (p.skepticReasons||[])){ul.appendChild(el('li',item));}card.appendChild(ul);
  card.appendChild(el('p','No esecuzione. I prezzi possono cambiare e uno stop non garantisce una perdita massima.','proposal-muted'));
  if(p.status==='WAIT'||p.status==='SKIP'){
    const btn=el('button','Archivia scheda (non è un ordine)','mini-button mini-button-danger');btn.type='button';
    btn.addEventListener('click',async()=>{btn.disabled=true;try{await api('/api/proposals/'+encodeURIComponent(p.id)+'/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'archive'})});await refresh();toast('Scheda archiviata, nessun ordine effettuato');}catch(e){toast(e.message,true);}finally{btn.disabled=false;}});
    card.appendChild(btn);
  }
  root.appendChild(card);
 }
}
function drawDiagnostics(rows){
 const root=$('diagnostics-body');root.replaceChildren();
 if(!rows?.length){const tr=el('tr');cell(tr,'Nessuna diagnostica: eseguire una scansione.','empty').colSpan=7;root.appendChild(tr);return;}
 for(const x of rows){const tr=el('tr');cell(tr,x.symbol,'ticker');cell(tr,x.status);
  cell(tr,x.reason||'—');cell(tr,x.rsi14==null?'—':Number(x.rsi14).toFixed(1));
  cell(tr,x.volume_ratio==null?'—':Number(x.volume_ratio).toFixed(2)+'×');
  cell(tr,x.orb_high==null?'—':(x.orb_confirmed?'Confermato · ':'In attesa · ')+money(x.orb_high));
  cell(tr,fmtDate(x.bar_ts));root.appendChild(tr);
 }
}
function drawLogs(scans){
 const root=$('logs-body');root.replaceChildren();
 if(!scans.length){const tr=el('tr');cell(tr,'Nessuna scansione ancora eseguita','empty').colSpan=5;root.appendChild(tr);return;}
 for(const s of scans){const tr=el('tr');cell(tr,fmtDate(s.started_at));cell(tr,s.source==='cron'?'Automatica':'Manuale');cell(tr,s.status);cell(tr,integer(s.symbols_checked));cell(tr,integer(s.alerts_created));cell(tr,s.finished_at&&s.started_at?Math.round(new Date(s.finished_at)-new Date(s.started_at))+' ms':'—');tr.title=s.detail||'';root.appendChild(tr);}
}
function drawPaperExecution(exec){
 if(!exec)return;
 const state=exec.settings||{},summary=exec.summary||{};
 $('auto-paper-state').textContent=state.enabled&&state.armed?'AUTO PAPER ATTIVO':'PAPER IN PAUSA';
 $('exec-state').textContent=state.enabled&&state.armed?'ARMATO':'IN PAUSA';
 $('exec-pnl').textContent=money(summary.realizedPnl);
 $('exec-count').textContent=String(summary.total||0);
 $('exec-active').textContent=String(summary.active||0);
 $('exec-telegram').textContent=window.__paperNotifyOn?'CONFIGURATO':'NON CONFIGURATO';
 $('exec-arm').textContent=state.armed?'SEGRETO PRESENTE':'NON ARMATO';
 $('exec-reason').textContent=state.reason||'Nessuna causa di pausa registrata';
 $('paper-enable').disabled=state.enabled||!state.armed||!window.__paperNotifyOn||!window.__paperAiOn;
 $('paper-pause').disabled=!state.enabled;
 $('mode-badge').textContent=state.enabled&&state.armed?'● AUTO PAPER':'● PAPER IN PAUSA';
 $('sidebar-mode').textContent=state.enabled&&state.armed?'Auto Paper attivo':'Auto Paper in pausa';
 $('order-position-count').textContent=String(summary.total||0)+' / '+String(summary.active||0);
 const root=$('paper-trades-body');root.replaceChildren();
 if(!exec.trades?.length){let tr=el('tr');cell(tr,'Nessuna operazione eseguita dal bot','empty').colSpan=8;root.appendChild(tr);}
 for(const t of exec.trades||[]){
  const tr=el('tr');cell(tr,fmtDate(t.created_at));cell(tr,t.symbol,'ticker');cell(tr,t.order_status);
  cell(tr,String(t.entry_filled_qty||0)+' / '+String(t.qty));
  cell(tr,money(t.entry_avg_price));cell(tr,money(t.exit_avg_price));
  cell(tr,t.exit_filled_qty>0?money(t.realized_pnl):'—');
  cell(tr,'+'+money(t.expected_gain)+' / -'+money(t.expected_risk));root.appendChild(tr);
 }
 const events=$('paper-events');events.replaceChildren();
 if(!exec.events?.length)events.appendChild(el('p','Nessuna notifica di esecuzione finora.','empty'));
 for(const evt of exec.events||[]){
  const row=el('div','','signal-card');row.appendChild(el('div',evt.kind,'signal-tag'));
  row.appendChild(el('div',evt.message,'signal-detail'));
  row.appendChild(el('div',(evt.delivery_state==='SENT'?'Inviato':'In attesa')+' · '+fmtDate(evt.created_at),'signal-meta'));
  events.appendChild(row);
 }
}
function drawState(data){
 const acct=data.paperAccount;
 $('virtual-balance').textContent=money(acct?.equity);
 $('paper-sync-state').textContent=acct?'Alpaca Paper · aggiornato '+fmtDate(acct.asOf):'Conto non disponibile · nessun budget fittizio';
 $('paper-cash').textContent=money(acct?.cash);
 $('paper-buying-power').textContent=money(acct?.buyingPower);
 $('paper-usable-cash').textContent=money(acct?.cashNoLeverage);
 $('paper-max-notional').textContent=money(data.paperSizing?.maxNotional);
 $('paper-max-risk').textContent=money(data.paperSizing?.maxRisk);
 $('paper-change').textContent=data.paperBalanceChange==null?'—':
   ((data.paperBalanceChange>=0?'+':'')+money(data.paperBalanceChange)+' ('+((data.paperBalanceChangePct??0)>=0?'+':'')+(data.paperBalanceChangePct??0).toFixed(2)+'%)');
 window.__paperNotifyOn=Boolean(data.alertsConfigured); window.__paperAiOn=Boolean(data.skepticConfigured);
 drawPaperExecution(data.paperExecution);
 $('paper-account-info').textContent=acct?
  ('Stato Alpaca: '+acct.status+(acct.blocked?' · conto bloccato':'')+' · I dati includono tutte le operazioni del conto, anche quelle non effettuate dal bot. La variazione parte dal primo snapshot salvato: '+fmtDate(data.paperFirstSnapshot?.snapshot_at)+'. Il P/L attribuibile al bot è riportato in Auto Paper 1.3.1.1.'):
  (data.paperAccountError||'Sincronizzazione Paper non disponibile')+' · Ultimo snapshot: '+fmtDate(data.paperLastSnapshot?.snapshot_at)+'. Proposte di trading bloccate fino al ripristino.';
 $('enabled-count').textContent=String(data.enabledCount);
 $('signals-count').textContent=integer(data.totalSignals);
 $('asof').textContent='Aggiornato: '+fmtDate(data.time);
 $('live-state').textContent='Fonte: Alpaca IEX · copertura parziale · non adatta a ricostruire tutti i volumi USA';
 drawWatch(data.watchlist);drawTechnical(data.technical||[]);drawDiagnostics(data.scannerDiagnostics||[]);drawProposals(data.proposals||[]);
 drawTechnicalEvents(data.technicalEvents||[]);drawNews(data.news||[]);
 $('telegram-status').textContent=data.alertsConfigured?'TELEGRAM: ATTIVO':'TELEGRAM: NON CONFIGURATO';
 $('skeptic-status').textContent=data.skepticConfigured?'SKEPTIC: WORKERS AI ATTIVO':'SKEPTIC: SOLO REGOLE';
 drawSignals(data.signals);drawLogs(data.scans);
 const last=data.scans[0];const status=last?.status||'In attesa';
 $('last-run-at').textContent=fmtDate(last?.started_at);
 $('last-run-status').textContent=status.toUpperCase();
 $('last-run-count').textContent=last?integer(last.symbols_checked):'—';
 $('last-run-alerts').textContent=last?integer(last.alerts_created):'—';
 const rawDetail=last?.detail||'Nessuna scansione disponibile.';
 $('last-run-detail').textContent=rawDetail.replace(/Prossima apertura: (\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:[+-]\\d{2}:\\d{2}|Z))/,(_,date)=>'Prossima apertura: '+fmtDate(date)+' (Italia)');
 $('health-light').className='health-light '+(status==='success'?'ok':status==='skipped'||status==='partial'?'warn':status==='error'?'error':'');
}
let refreshing=false;
async function refresh(){if(refreshing)return;refreshing=true;try{drawState(await api('/api/overview'));}catch(e){toast(e.message,true);}finally{refreshing=false;}}
$('watch-form').addEventListener('submit',async e=>{
 e.preventDefault();const input=$('symbol-input');const symbol=input.value.trim().toUpperCase();if(!symbol)return;
 try{await api('/api/watchlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol})});input.value='';await refresh();toast('Titolo '+symbol+' aggiunto alla watchlist');}
 catch(err){toast(err.message,true);}
});
$('scan-button').addEventListener('click',async e=>{
 const btn=e.currentTarget;btn.disabled=true;btn.textContent='Scansione in corso…';
 try{const result=await api('/api/scan',{method:'POST'});toast(result.detail||('Scansione: '+result.status),result.status==='error');await refresh();}
 catch(err){toast(err.message,true);}
 finally{btn.disabled=false;btn.textContent='↻ Esegui scansione';}
});
$('paper-enable').addEventListener('click',async()=>{
 const phrase=prompt('Solo Paper Trading: per abilitare gli ingressi automatici sul conto simulato, digita esattamente PAPER.');
 if(phrase!=='PAPER')return;
 if(!confirm('Confermi AUTONOMIA degli ordini ALPACA PAPER, senza denaro reale?'))return;
 try{await api('/api/paper/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'enable',confirm:'ENABLE_PAPER_ONLY'})});await refresh();toast('AUTO PAPER abilitato');}catch(e){toast(e.message,true);}
});
$('paper-pause').addEventListener('click',async()=>{
 if(!confirm('Bloccare nuovi ingressi automatici? Le posizioni già aperte e i relativi bracket restano attivi su Alpaca Paper.'))return;
 try{await api('/api/paper/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'pause'})});await refresh();toast('Auto Paper in pausa.');}catch(e){toast(e.message,true);}
});
$('paper-telegram-test').addEventListener('click',async()=>{
 try{const res=await api('/api/paper/telegram-test',{method:'POST'});await refresh();toast(res.telegram?.sent?'Test Telegram inviato':'Test accodato: controlla notifiche e configurazione',!res.telegram?.sent);}catch(e){toast(e.message,true);}
});
$('paper-reconcile').addEventListener('click',async()=>{
 try{const result=await api('/api/paper/reconcile',{method:'POST'});await refresh();toast(result.status==='ERROR'?'Revisione Paper necessaria':'Esecuzioni Paper sincronizzate',result.status==='ERROR');}catch(e){toast(e.message,true);}
});
refresh();setInterval(()=>{if(!document.hidden)refresh();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
`;
