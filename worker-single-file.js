// AI Trading Desk 1.1 — single-file Cloudflare Worker. Auto-generated.

// ---- scout.js ----
// Scout v1: pure, reproducible market metrics. Not a trading recommendation.
// Bar timestamp is the START of a 15-minute interval (Alpaca convention).
const SCOUT_RULES = Object.freeze({
  priceChangeAbsPct: 3,
  volumeSpikeMultiple: 2,
  baselineDays: 5,
  minimumBaselineDays: 3,
  minimumBaselineVolume: 100,
  minimumCurrentVolume: 1000,
  maxSignalsPerDay: 5,
  cooldownMinutes: 60,
  intervalMinutes: 15,
  dataSettleSeconds: 60,
  maxDataAgeMinutes: 32
});

const nyDateTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23'
});

function partsNY(ts, cache = new Map()) {
  if (cache.has(ts)) return cache.get(ts);
  const bits = Object.fromEntries(nyDateTime.formatToParts(new Date(ts))
    .filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const out = {
    date: `${bits.year}-${bits.month}-${bits.day}`,
    slot: `${bits.hour}:${bits.minute}`,
    weekday: bits.weekday,
    regular: bits.weekday !== 'Sat' && bits.weekday !== 'Sun' &&
      `${bits.hour}:${bits.minute}` >= '09:30' && `${bits.hour}:${bits.minute}` < '16:00'
  };
  cache.set(ts, out);
  return out;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function calculateMetrics(rawBars, now = new Date(), cache = new Map()) {
  const time = now.getTime();
  const valid = rawBars.filter(b => Number.isFinite(Date.parse(b.t)) &&
    Number.isFinite(b.c) && b.c > 0 && Number.isFinite(b.v) && b.v >= 0 &&
    partsNY(b.t, cache).regular &&
    Date.parse(b.t) + (SCOUT_RULES.intervalMinutes * 60 + SCOUT_RULES.dataSettleSeconds) * 1000 <= time)
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

  if (!valid.length) return { ok: false, reason: 'Nessuna barra regolare completata disponibile' };
  const latest = valid[valid.length - 1];
  const lastNY = partsNY(latest.t, cache);
  const todayNY = partsNY(now.toISOString(), cache);
  const ageMinutes = (time - (Date.parse(latest.t) + 15 * 60_000)) / 60_000;
  if (lastNY.date !== todayNY.date || ageMinutes > SCOUT_RULES.maxDataAgeMinutes) {
    return { ok: false, reason: 'Dati non correnti: non emetto segnali', latest, dataDate: lastNY.date };
  }

  const earlierTime = Date.parse(latest.t) - 60 * 60_000;
  const older = valid.find(b => Date.parse(b.t) === earlierTime &&
    partsNY(b.t, cache).date === lastNY.date);
  const pct1h = older ? (latest.c / older.c - 1) * 100 : null;

  // The previous five distinct NY trading days for the same 15-minute clock slot.
  const volumesByDay = new Map();
  for (const bar of valid) {
    const p = partsNY(bar.t, cache);
    if (p.date !== lastNY.date && p.date < lastNY.date && p.slot === lastNY.slot) {
      volumesByDay.set(p.date, bar.v);
    }
  }
  const previous = [...volumesByDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, SCOUT_RULES.baselineDays).map(([, vol]) => vol);
  const baselineVolume = previous.length >= SCOUT_RULES.minimumBaselineDays ? median(previous) : null;
  const volumeRatio = baselineVolume !== null && baselineVolume >= SCOUT_RULES.minimumBaselineVolume
    ? latest.v / baselineVolume : null;
  const moved = pct1h !== null && Math.abs(pct1h) >= SCOUT_RULES.priceChangeAbsPct;
  const spiked = volumeRatio !== null && volumeRatio >= SCOUT_RULES.volumeSpikeMultiple &&
    latest.v >= SCOUT_RULES.minimumCurrentVolume;
  const reasons = [];
  if (moved) reasons.push(`Movimento 1h ${pct1h >= 0 ? '+' : ''}${pct1h.toFixed(2)}%`);
  if (spiked) reasons.push(`Volume ${volumeRatio.toFixed(2)}x vs mediana stessa fascia (${previous.length} giorni)`);
  return {
    ok: true, latest, pct1h, volumeRatio, baselineVolume, baselineDays: previous.length,
    reason: reasons.join(' · '), flagged: moved || spiked,
    tradeDate: lastNY.date,
    ageMinutes: Math.round(ageMinutes * 10) / 10
  };
}


// ---- auth.js ----
const sessionName = 'atd_session';
const encoder = new TextEncoder();

function toB64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function fromB64Url(str) {
  const normalized = str.replaceAll('-', '+').replaceAll('_', '/');
  const bytes = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(bytes, c => c.charCodeAt(0));
}
async function keyFromSecret(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
}
async function checkPassword(input, expected) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(input)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
async function validPassword(input, env) {
  return env.DASHBOARD_PASSWORD?.length >= 14 && typeof input === 'string' &&
    await checkPassword(input, env.DASHBOARD_PASSWORD);
}
async function makeSession(env) {
  const data = { exp: Date.now() + 8 * 60 * 60_000, v: 1 };
  const body = toB64Url(encoder.encode(JSON.stringify(data)));
  const signature = await crypto.subtle.sign('HMAC', await keyFromSecret(env.SESSION_SECRET), encoder.encode(body));
  return `${body}.${toB64Url(signature)}`;
}
async function validSession(request, env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return false;
  const cookie = request.headers.get('Cookie') || '';
  const raw = cookie.split(';').map(x => x.trim()).find(x => x.startsWith(sessionName + '='))?.slice(sessionName.length + 1);
  if (!raw || raw.length > 512) return false;
  const chunks = raw.split('.');
  if (chunks.length !== 2) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64Url(chunks[0])));
    if (payload.v !== 1 || !Number.isFinite(payload.exp) || payload.exp < Date.now()) return false;
    return crypto.subtle.verify('HMAC', await keyFromSecret(env.SESSION_SECRET), fromB64Url(chunks[1]), encoder.encode(chunks[0]));
  } catch { return false; }
}
function sessionCookie(request, token) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${sessionName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure}`;
}
function expiredSessionCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${sessionName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
function isSameOrigin(request) {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  // When present and non-null, Origin always takes precedence.
  if (origin && origin !== 'null') return origin === expected;

  // A privacy-sensitive browser or an older cached login form can send
  // Origin: null. Browsers protect Sec-Fetch-* against modification by JS.
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (fetchSite !== null) return fetchSite === 'same-origin';

  // Older browsers without Fetch Metadata may provide a Referer.
  const referer = request.headers.get('Referer');
  if (referer) {
    try { return new URL(referer).origin === expected; }
    catch { return false; }
  }
  // Fail closed when the browser provides no reliable origin context.
  return false;
}


// ---- technical.js ----
// AI Trading Desk v1.1 — deterministic analysis, not a trading recommendation.
// Alpaca 5Min bars start at their timestamp; use only settled regular-session bars.

const TECH_CONFIG = Object.freeze({
  timeframeMinutes: 5, settleSeconds: 60, maxAgeMinutes: 22,
  rsiPeriod: 14, emaPeriod: 20, smaPeriod: 50,
  breakoutLookback: 20, breakoutVolumeMultiple: 1.4,
  flagImpulsePct: 2.5, flagMaxRetracementPct: 2.0,
  eventCooldownMinutes: 60, maxEventsPerDay: 6
});

function ema(values, period) {
  if (values.length < period || !values.slice(0,period).every(Number.isFinite)) return null;
  let result = values.slice(0, period).reduce((a,b)=>a+b,0)/period;
  const alpha=2/(period+1);
  for(let i=period;i<values.length;i++) {
    if(!Number.isFinite(values[i]))return null;
    result = alpha * values[i] + (1-alpha)*result;
  }
  return result;
}
function sma(values, period) {
  if(values.length<period)return null;
  const sample=values.slice(-period);
  return sample.every(Number.isFinite)?sample.reduce((a,b)=>a+b,0)/period:null;
}
// Wilder RSI: average gains and losses are Wilder-smoothed.
function rsi(values, period=14) {
  if(values.length<period+1 || values.some(v=>!Number.isFinite(v) || v<=0))return null;
  let gain=0,loss=0;
  for(let i=1;i<=period;i++){let d=values[i]-values[i-1];gain+=Math.max(0,d);loss+=Math.max(0,-d);}
  gain/=period;loss/=period;
  for(let i=period+1;i<values.length;i++) {
    const d=values[i]-values[i-1];gain=(gain*(period-1)+Math.max(0,d))/period;
    loss=(loss*(period-1)+Math.max(0,-d))/period;
  }
  if(loss===0)return gain===0?50:100;
  return 100-100/(1+gain/loss);
}

const round=(n,d=2)=>n==null?null:Number(n.toFixed(d));
function calculateTechnical(rawBars, now=new Date(), cache=new Map()) {
  const time=now.getTime();
  const valid=(Array.isArray(rawBars)?rawBars:[]).filter(b=>
    Number.isFinite(Date.parse(b.t)) && Number.isFinite(b.o) && Number.isFinite(b.h) &&
    Number.isFinite(b.l) && Number.isFinite(b.c) && Number.isFinite(b.v) &&
    b.o>0 && b.h>=Math.max(b.o,b.c) && b.l<=Math.min(b.o,b.c) && b.c>0 && b.v>=0 &&
    partsNY(b.t,cache).regular &&
    Date.parse(b.t)+(TECH_CONFIG.timeframeMinutes*60+TECH_CONFIG.settleSeconds)*1000<=time
  ).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t));
  if(valid.length<TECH_CONFIG.smaPeriod+1)return {ok:false,reason:'Barre 5m insufficienti per SMA50 e RSI14'};
  const latest=valid.at(-1), currentDay=partsNY(now.toISOString(),cache).date;
  const barDay=partsNY(latest.t,cache).date;
  const ageMin=(time-(Date.parse(latest.t)+TECH_CONFIG.timeframeMinutes*60_000))/60_000;
  if(barDay!==currentDay || ageMin>TECH_CONFIG.maxAgeMinutes)return {ok:false,reason:'Barra 5m non recente: nessun evento',barTs:latest.t};
  const closes=valid.map(b=>b.c), volumes=valid.map(b=>b.v);
  const e20=ema(closes,TECH_CONFIG.emaPeriod), s50=sma(closes,TECH_CONFIG.smaPeriod);
  const r14=rsi(closes,TECH_CONFIG.rsiPeriod);
  const prev=valid.slice(-TECH_CONFIG.breakoutLookback-1,-1);
  const high20=Math.max(...prev.map(b=>b.h));
  const volAvg=prev.reduce((s,b)=>s+b.v,0)/prev.length;
  const volRatio=volAvg>0?latest.v/volAvg:null;
  const strongVolume=latest.v>=100 && volRatio!==null && volRatio>=TECH_CONFIG.breakoutVolumeMultiple;
  const breakout=latest.c>high20 && strongVolume && latest.c>e20;
  const uptrend=latest.c>e20 && e20>s50;
  // Heuristic only: strong rise, 3-8 narrow pullback bars, then reclaim prior close.
  // No pattern detection model; not a confirmed chart formation.
  let bullFlagCandidate=false;
  for(let k=3;k<=8 && !bullFlagCandidate;k++) {
    if(valid.length<k+13)continue;
    const start=valid.at(-k-13), end=valid.at(-k-2);
    const impulsePct=(end.c/start.c-1)*100;
    const pullback=valid.slice(-k-1,-1);
    const peak=Math.max(end.h,...pullback.map(b=>b.h));
    const low=Math.min(...pullback.map(b=>b.l));
    const depth=(peak-low)/peak*100;
    const declining=pullback.at(-1).c<=pullback[0].c;
    const reclaim=latest.c>pullback.at(-1).h && latest.c>e20;
    if(impulsePct>=TECH_CONFIG.flagImpulsePct && depth<=TECH_CONFIG.flagMaxRetracementPct &&
        declining && reclaim && strongVolume && uptrend)bullFlagCandidate=true;
  }
  const events=[];
  if(breakout)events.push({kind:'BREAKOUT_20',description:'Chiusura oltre massimo delle 20 barre precedenti con volume relativo elevato'});
  if(bullFlagCandidate)events.push({kind:'BULL_FLAG_CANDIDATE',description:'Possibile consolidamento dopo un impulso rialzista (euristica da verificare)'});
  if(r14>=70)events.push({kind:'RSI_HIGH',description:'RSI14 elevato: può indicare forza o ipercomprato, non necessariamente inversione'});
  if(r14<=30)events.push({kind:'RSI_LOW',description:'RSI14 basso: può indicare debolezza o ipervenduto, non necessariamente inversione'});
  return {
    ok:true,barTs:latest.t,close:latest.c,volume:latest.v,
    rsi14:round(r14),ema20:round(e20,4),sma50:round(s50,4),
    high20:round(high20,4),volumeRatio20:round(volRatio),
    trend:uptrend?'UP':latest.c<s50?'DOWN':'NEUTRAL',
    breakout,bullFlagCandidate,events,ageMinutes:round(ageMin,1),
    source:'Alpaca IEX, 5Min, sessione regolare'
  };
}


// ---- news.js ----
// Headlines only. Never treat third-party content as instructions.
function normalizeNews(raw, watchSymbols=[]) {
  const allowed=new Set(watchSymbols);
  if(!Array.isArray(raw))return [];
  const unique=new Set();
  const result=[];
  for(const n of raw){
    const id=String(n?.id??'').slice(0,100), title=String(n?.headline??'').trim().slice(0,360);
    const href=String(n?.url??'').trim();
    const when=String(n?.created_at??'');
    let url;
    try{url=new URL(href);if(!['https:','http:'].includes(url.protocol))continue;}catch{continue;}
    if(!id||!title||!Number.isFinite(Date.parse(when))||unique.has(id))continue;
    const symbols=(Array.isArray(n.symbols)?n.symbols:[]).map(s=>String(s).toUpperCase()).filter(s=>allowed.has(s));
    if(!symbols.length)continue;
    unique.add(id);
    result.push({id,headline:title,source:String(n.source||'Fonte non indicata').slice(0,100),
      url:url.toString().slice(0,1200),publishedAt:new Date(when).toISOString(),symbols});
  }
  return result;
}
function buildNewsUrl(symbols,now=new Date()) {
  const u=new URL('https://data.alpaca.markets/v1beta1/news');
  u.searchParams.set('symbols',symbols.join(','));
  u.searchParams.set('start',new Date(now.getTime()-48*3_600_000).toISOString());
  u.searchParams.set('end',now.toISOString());
  u.searchParams.set('limit','50');
  u.searchParams.set('sort','desc');
  return u.toString();
}


// ---- alerts.js ----
// Optional one-way Telegram notifications, never includes credentials or trading actions.
function telegramText(events){
  const lines=['📊 AI Trading Desk · Scout 1.1','Nuovi eventi tecnici (IEX, solo informativi):'];
  for(const event of events.slice(0,6))lines.push(`• ${event.symbol} · ${event.kind} · ${event.close.toFixed(2)} USD`);
  lines.push('Analisi automatica, non è un suggerimento d’acquisto. Consulta la dashboard.');
  return lines.join('\n');
}
async function sendTelegram(env, events, sender=fetch) {
  if(!events.length)return {status:'none'};
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return {status:'disabled'};
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),7000);
  try {
    const res=await sender(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:telegramText(events),disable_web_page_preview:true}),
      signal:controller.signal
    });
    if(!res.ok)throw new Error(`Telegram HTTP ${res.status}`);
    return {status:'sent'};
  }catch(e){return {status:'error',detail:String(e?.message||e).slice(0,100)};}
  finally{clearTimeout(timeout);}
}


// ---- ui.js ----
const loginHtml = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Accesso · AI Trading Desk</title><link rel="stylesheet" href="/assets/app.css"></head>
<body class="login-page"><main class="login-card"><div class="brand"><span class="brand-icon">A<span class="brand-dot">●</span></span><span>AI TRADING <strong>DESK</strong></span></div><span class="eyebrow">AMBIENTE PRIVATO</span><h1>Benvenuto nel tuo trading desk.</h1><p class="muted">Scout monitora le anomalie di mercato. Nessuna operazione reale o simulata viene eseguita da questa versione.</p><!--login-error--><form method="post" action="/login"><label for="password">Password della dashboard</label><input id="password" name="password" type="password" autocomplete="current-password" required placeholder="La tua password privata"><button class="btn primary" type="submit">Accedi alla dashboard <span>↗</span></button></form><div class="note"><strong>Solo osservazione.</strong> Non inserire chiavi API o credenziali del broker in questa pagina.</div></main></body></html>`;

const dashboardHtml = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AI Trading Desk · Scout 1.1</title><link rel="stylesheet" href="/assets/app.css"><script src="/assets/app.js" defer></script></head><body>
<div class="layout"><aside class="sidebar"><div class="brand"><span class="brand-icon">A<span class="brand-dot">●</span></span><span>AI TRADING <strong>DESK</strong></span></div><div class="sidebar-kicker">WORKSPACE / 01</div><nav aria-label="Navigazione principale"><a class="nav-item current" href="/"><span class="nav-sym">▦</span> Panoramica</a><a class="nav-item" href="#watch-section"><span class="nav-sym">◈</span> Watchlist</a><a class="nav-item" href="#signals-section"><span class="nav-sym">⌁</span> Anomalie Scout</a><a class="nav-item" href="#technical-section"><span class="nav-sym">⌁</span> Scanner tecnico</a><a class="nav-item" href="#news-section"><span class="nav-sym">◉</span> Notizie</a><a class="nav-item" href="#log-section"><span class="nav-sym">▤</span> Log scansioni</a></nav><div class="side-bottom"><div class="safe-box"><span class="safe-dot"></span><div><strong>Safe mode attiva</strong><small>Trading disabilitato</small></div></div><form method="post" action="/logout"><button type="submit" class="logout">Esci dall'account ↗</button></form></div></aside>
<main class="content"><header class="topbar"><div><div class="eyebrow">CONTROL ROOM <span class="kicker-sep">/</span> MARKET SCOUT</div><h1>Trading overview<span class="tiny-period">.</span></h1><p class="subtitle">Segnali informativi di mercato. Niente ordini, niente denaro reale.</p></div><div class="header-actions"><div class="badge-outline"><span class="pulse"></span> OBSERVATION ONLY</div><button class="btn primary" id="scan-button">↻ Esegui scansione</button></div></header>
<div class="status-line"><span id="live-state">Caricamento dati…</span><span id="asof"></span></div>
<section class="stats" aria-label="Statistiche"><article class="stat"><span class="stat-label">CAPITALE DI RIFERIMENTO</span><strong id="virtual-balance">$10,000.00</strong><small>Illustrativo, non movimentato</small><div class="stat-line lblue"></div></article><article class="stat"><span class="stat-label">TITOLI MONITORATI</span><strong id="enabled-count">—</strong><small>Fino a 20 nella watchlist</small><div class="stat-line lcyan"></div></article><article class="stat"><span class="stat-label">ANOMALIE REGISTRATE</span><strong id="signals-count">—</strong><small>Segnali ≠ raccomandazioni</small><div class="stat-line lpurple"></div></article><article class="stat"><span class="stat-label">ORDINI / POSIZIONI</span><strong>0 / 0</strong><small>Esecuzione disabilitata in V1.1</small><div class="stat-line lgreen"></div></article></section>
<section class="grid-main"><div class="panel" id="watch-section"><div class="panel-head"><div><span class="eyebrow">LIVE MONITOR</span><h2>Watchlist</h2></div><div class="panel-actions"><span class="soft-tag">FEED: IEX</span></div></div><div class="table-scroll"><table><thead><tr><th>TITOLO</th><th>ULTIMO CLOSE</th><th>VOLUME 15M</th><th>DATA BARRA</th><th>AZIONI</th></tr></thead><tbody id="watch-body"><tr><td colspan="5" class="empty">Caricamento watchlist…</td></tr></tbody></table></div><form class="watch-form" id="watch-form"><label for="symbol-input">Aggiungi un titolo alla watchlist</label><div class="form-row"><input id="symbol-input" maxlength="10" placeholder="Ticker, es. ORCL" autocomplete="off" required><button type="submit" class="btn light">+ Aggiungi</button></div></form></div>
<div class="right-stack"><section class="panel compact"><div class="panel-head"><div><span class="eyebrow">SYSTEM HEALTH</span><h2>Stato monitoraggio</h2></div><span class="health-light" id="health-light"></span></div><div class="health-grid"><span>Ultimo controllo</span><strong id="last-run-at">—</strong><span>Esito</span><strong id="last-run-status">—</strong><span>Simboli controllati</span><strong id="last-run-count">—</strong><span>Nuove anomalie</span><strong id="last-run-alerts">—</strong></div><p class="mini-info" id="last-run-detail">In attesa del primo controllo.</p></section><section class="panel compact"><div class="panel-head"><div><span class="eyebrow">SCOUT / RULES</span><h2>Soglie attive</h2></div></div><div class="rule"><div><strong>±3%</strong><small>Movimento 1 ora</small></div><span>oppure</span><div><strong>2.0×</strong><small>Volume fascia oraria</small></div></div><p class="mini-info">Confronto sulla mediana dello stesso intervallo di 15 minuti degli ultimi 5 giorni disponibili. Feed IEX parziale; almeno 3 giorni validi per il controllo volumi.</p></section></div></section>
<section class="panel wide" id="technical-section"><div class="panel-head"><div><span class="eyebrow">TECHNICAL SCANNER / 5 MIN</span><h2>Indicatori e pattern</h2></div><span class="soft-tag">RSI14 · EMA20 · SMA50 · BREAKOUT</span></div><p class="mini-info intro-note">Analisi algoritmica di barre IEX completate. I pattern sono ipotesi descrittive, non segnali operativi; dati mancanti o vecchi non generano eventi.</p><div class="table-scroll"><table><thead><tr><th>TITOLO</th><th>RSI 14</th><th>EMA 20</th><th>SMA 50</th><th>TREND</th><th>PATTERN</th><th>ULTIMA BARRA</th></tr></thead><tbody id="technical-body"><tr><td colspan="7" class="empty">Caricamento indicatori…</td></tr></tbody></table></div><div class="panel-head subhead"><div><span class="eyebrow">EVENT HISTORY</span><h2>Eventi tecnici registrati</h2></div><span class="soft-tag">MAX 6 / GIORNO</span></div><div id="technical-events" class="signal-list"><p class="empty">Nessun evento tecnico.</p></div></section>
<section class="panel wide" id="news-section"><div class="panel-head"><div><span class="eyebrow">NEWS FEED / ALPACA</span><h2>Notizie monitorate</h2></div><span class="soft-tag" id="telegram-status">TELEGRAM: NON CONFIGURATO</span></div><p class="mini-info intro-note">Titoli e fonti originali di notizie pertinenti alla watchlist. Nessun modello AI le interpreta ancora: l'analisi semantica arriverà in una fase successiva.</p><div class="news-grid" id="news-list"><p class="empty">Non ci sono notizie salvate.</p></div></section>
<section class="panel wide" id="signals-section"><div class="panel-head"><div><span class="eyebrow">OPPORTUNITY RADAR</span><h2>Anomalie rilevate</h2></div><span class="soft-tag">ULTIMI 30 EVENTI</span></div><div class="signal-list" id="signals-list"><p class="empty">Non ci sono ancora anomalie registrate.</p></div></section>
<section class="panel wide" id="log-section"><div class="panel-head"><div><span class="eyebrow">SYSTEM AUDIT</span><h2>Storico scansioni</h2></div></div><div class="table-scroll"><table><thead><tr><th>DATA / ORA</th><th>ORIGINE</th><th>STATO</th><th>TITOLI</th><th>NUOVE ANOMALIE</th></tr></thead><tbody id="logs-body"><tr><td colspan="5" class="empty">Nessuna scansione disponibile.</td></tr></tbody></table></div></section>
<footer>AI TRADING DESK · SCOUT 1.1 <span>•</span> Analisi algoritmica informativa. Non sono presenti funzioni di negoziazione e la performance non è misurata.</footer></main></div><div id="toast" class="toast" role="status" aria-live="polite"></div></body></html>`;

const appCss = `
:root{color-scheme:dark;--bg:#0b1220;--sidebar:#0d1728;--panel:#121e31;--panel2:#142237;--border:#26354a;--txt:#eaf0fc;--muted:#94a2b9;--sky:#6de2e4;--violet:#b497ff;--green:#8eeab7;--red:#fb999e;--warning:#efc58d}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--txt);font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px}button,input{font:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:wait}a{color:inherit;text-decoration:none}.layout{display:grid;grid-template-columns:255px minmax(0,1fr);min-height:100vh}.sidebar{background:var(--sidebar);border-right:1px solid var(--border);padding:31px 18px;display:flex;flex-direction:column;gap:35px;position:sticky;top:0;height:100vh}.brand{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;letter-spacing:1px;white-space:nowrap}.brand strong{color:var(--sky);font-weight:750}.brand-icon{display:grid;place-items:center;width:35px;height:35px;border-radius:10px;background:#19394a;color:var(--sky);font-size:20px;font-weight:900;letter-spacing:-1px;position:relative}.brand-dot{position:absolute;bottom:3px;right:4px;font-size:8px}.sidebar-kicker,.eyebrow{font-size:10px;font-weight:800;letter-spacing:2.2px;color:var(--sky)}.sidebar-kicker{margin-top:22px;color:#627792}nav{display:grid;gap:8px;margin-top:-18px}.nav-item{padding:13px 14px;border-radius:10px;color:#9aa9c0;display:flex;align-items:center;gap:11px}.nav-item:hover,.nav-item.current{background:#172c41;color:#e4f9ff}.nav-item.current{box-shadow:inset 3px 0 0 var(--sky)}.nav-sym{font-size:17px;color:#7ac9d0;width:18px}.side-bottom{margin-top:auto;display:grid;gap:16px}.safe-box{border:1px solid #284b48;background:#112e30;border-radius:13px;padding:14px;display:flex;align-items:center;gap:10px}.safe-box strong{display:block;font-size:12px}.safe-box small{display:block;color:#86b6ad;margin-top:4px}.safe-dot{width:9px;height:9px;border-radius:50%;background:var(--green);box-shadow:0 0 0 5px #17483b}.logout{background:none;border:none;color:#8b9eb8;cursor:pointer}.content{padding:40px clamp(18px,3vw,46px) 20px;min-width:0;max-width:1750px;width:100%;margin:0 auto}.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:24px}.kicker-sep{color:#627792;padding:0 8px}.topbar h1{font-size:clamp(30px,3.1vw,44px);letter-spacing:-1.7px;margin:11px 0 6px;line-height:1.1}.tiny-period{color:var(--sky)}.subtitle{font-size:13px;color:var(--muted);margin:0}.header-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.badge-outline{font-size:10px;letter-spacing:1px;border:1px solid #2b584e;color:#9ce4bb;border-radius:7px;padding:11px 12px;font-weight:800}.pulse,.health-light{display:inline-block;width:7px;height:7px;border-radius:50%;background:#6adbab;margin-right:7px}.btn{padding:12px 17px;border-radius:9px;border:1px solid var(--border);font-weight:750;transition:filter .2s}.btn:hover{filter:brightness(1.08)}.btn.primary{background:var(--sky);color:#071521;border-color:var(--sky)}.btn.light{background:#193b49;color:var(--sky);border-color:#275063}.status-line{margin:28px 0 14px;display:flex;justify-content:space-between;gap:10px;color:#788da8;font-size:11px;align-items:center}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.stat{position:relative;overflow:hidden;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:21px 21px 24px;display:flex;flex-direction:column;gap:7px}.stat-label{font-size:10px;letter-spacing:1.1px;color:#95a7bf;font-weight:750}.stat strong{font-size:clamp(22px,2.7vw,31px);letter-spacing:-.6px;font-variant-numeric:tabular-nums}.stat small{font-size:11px;color:#758aa4}.stat-line{position:absolute;bottom:0;left:0;width:100%;height:3px}.lblue{background:#6db6fa}.lcyan{background:var(--sky)}.lpurple{background:var(--violet)}.lgreen{background:var(--green)}.grid-main{display:grid;grid-template-columns:minmax(0,1.85fr) minmax(270px,1fr);gap:16px;margin:18px 0}.panel{background:var(--panel);border:1px solid var(--border);border-radius:15px;min-width:0;padding:22px}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:17px}.panel h2{font-size:20px;font-weight:750;letter-spacing:-.5px;margin:7px 0 0}.soft-tag{border:1px solid #3b4b64;color:#96aecb;font-size:10px;letter-spacing:.7px;padding:7px 9px;border-radius:7px;white-space:nowrap}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%;white-space:nowrap}th{text-align:left;font-size:9px;letter-spacing:1px;font-weight:850;color:#7187a2;padding:11px 9px 16px;border-bottom:1px solid var(--border)}td{font-size:12px;padding:16px 9px;border-bottom:1px solid #263347;color:#c8d6e7}td:last-child,th:last-child{text-align:right}.ticker{font-weight:850;font-size:13px;color:#f3f7fd}.ticker-label{display:block;font-size:10px;font-weight:400;color:#8597b0;margin-top:3px}.dimmed{opacity:.6}.muted{color:var(--muted)}.muted-sm{color:#8193ae;font-size:11px}.empty{padding:22px;text-align:center;color:#748ba9}.mini-button{border:1px solid #334862;padding:7px 10px;border-radius:7px;background:none;color:#9fbad2;font-size:11px}.mini-button:hover{color:white;background:#22354a}.watch-form{margin-top:25px;border-top:1px solid var(--border);padding-top:19px}.watch-form label,.login-card label{font-size:11px;color:#a0b2ca;display:block;margin-bottom:10px}.form-row{display:flex;gap:8px}.form-row input,.login-card input{min-width:0;background:#0a1625;color:var(--txt);border:1px solid #324660;border-radius:8px;padding:11px 12px;outline:none}.form-row input:focus,.login-card input:focus{border-color:var(--sky)}.form-row input{flex:1}.right-stack{display:grid;gap:16px;align-content:start}.panel.compact{padding:20px}.health-light{background:#677d98}.health-light.ok{background:var(--green)}.health-light.warn{background:var(--warning)}.health-light.error{background:var(--red)}.health-grid{display:grid;grid-template-columns:1fr auto;gap:13px 5px;font-size:12px}.health-grid span{color:#93a5bc}.health-grid strong{font-size:12px;text-align:right;font-weight:700;max-width:165px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mini-info{font-size:11px;color:#8198b1;line-height:1.6;margin:19px 0 0}.rule{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #2d3d54;border-radius:11px;padding:16px 12px}.rule>span{color:#8695ae;font-size:10px}.rule>div{text-align:center}.rule strong{display:block;font-size:25px;color:var(--sky)}.rule small{display:block;font-size:10px;color:#8ca1bc;margin-top:5px}.wide{margin-bottom:17px}.signal-list{display:grid;gap:10px}.signal-card{border:1px solid #334259;border-radius:10px;background:#17263a;padding:14px 16px;display:grid;grid-template-columns:85px 1fr auto;align-items:center;gap:14px}.signal-tag{font-size:13px;font-weight:850;color:var(--sky)}.signal-detail{color:#cedbe9;font-size:12px;line-height:1.5}.signal-meta{font-size:10px;color:#7e96ae;text-align:right}.signal-meta strong{display:block;color:#e4edf8;font-size:12px;margin-bottom:6px}footer{color:#677c97;font-size:10px;letter-spacing:.45px;padding:10px 0 15px}footer span{padding:0 8px}.subhead{margin-top:26px;padding-top:20px;border-top:1px solid var(--border)}.intro-note{margin:0 0 15px}.tag-up{color:var(--green)}.tag-down{color:var(--red)}.tag-neutral{color:#aab9ce}.pattern{font-size:10px;padding:5px 8px;border-radius:6px;color:#9ce8db;border:1px solid #295b5b;white-space:nowrap}.pattern.warning{color:var(--warning);border-color:#775b3a}.news-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.news-item{display:grid;gap:10px;border:1px solid var(--border);padding:16px;border-radius:10px;background:#15253a}.news-item a{font-size:13px;font-weight:700;color:#dfeaf7;line-height:1.5}.news-item a:hover{color:var(--sky);text-decoration:underline}.news-meta{font-size:10px;color:#8fa6c1}.news-symbols{font-size:10px;color:var(--sky)}@media(max-width:800px){.news-grid{grid-template-columns:1fr}}.toast{position:fixed;bottom:25px;right:25px;background:#1d4051;border:1px solid #39848e;color:#e8fcff;padding:14px 18px;border-radius:10px;box-shadow:0 15px 40px #0007;max-width:440px;line-height:1.5;opacity:0;pointer-events:none;transform:translateY(12px);transition:.2s}.toast.show{opacity:1;transform:translateY(0)}.toast.error{background:#4b2435;border-color:#a94f66}.login-page{display:grid;place-items:center;min-height:100vh;padding:20px;background:radial-gradient(ellipse at 60% 20%,#15324c,transparent 47%),#0b1220}.login-card{max-width:450px;width:100%;border:1px solid #344259;border-radius:18px;padding:38px;background:#122035;box-shadow:0 24px 75px #0006}.login-card .brand{margin-bottom:33px}.login-card h1{font-size:32px;line-height:1.13;letter-spacing:-.9px;margin:13px 0 12px}.login-card .muted{line-height:1.6;font-size:13px}.login-card form{margin:28px 0;display:grid;gap:10px}.login-card .btn{display:flex;justify-content:space-between}.note{color:#819eb2;font-size:11px;line-height:1.7;padding:14px;background:#0e1d2a;border-radius:10px}.note strong{color:#bad8e2}.error{color:#ffacb4;padding:12px;border:1px solid #8d4560;border-radius:9px;font-size:12px}
@media(max-width:1200px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-main{grid-template-columns:1fr}.right-stack{grid-template-columns:1fr 1fr}.content{padding:28px 23px}}@media(max-width:800px){.layout{display:block}.sidebar{position:static;width:100%;height:auto;padding:17px 20px;gap:13px}.sidebar-kicker,.sidebar nav,.side-bottom{display:none}.content{padding:24px 16px}.topbar{display:block}.header-actions{margin-top:22px}.status-line{flex-wrap:wrap}.right-stack{grid-template-columns:1fr}.signal-card{grid-template-columns:65px 1fr}.signal-meta{grid-column:2;text-align:left}}@media(max-width:460px){.stats{gap:9px}.stat{padding:16px 13px 21px}.stat strong{font-size:23px}.stat-label{font-size:9px}.panel{padding:17px}.badge-outline{font-size:9px}.form-row{flex-wrap:wrap}.form-row .btn{flex:1}}
`;

const appJs = `
const $ = id => document.getElementById(id);
const money = n => Number.isFinite(Number(n)) ? '$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
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
function drawLogs(scans){
 const root=$('logs-body');root.replaceChildren();
 if(!scans.length){const tr=el('tr');cell(tr,'Nessuna scansione ancora eseguita','empty').colSpan=5;root.appendChild(tr);return;}
 for(const s of scans){const tr=el('tr');cell(tr,fmtDate(s.started_at));cell(tr,s.source==='cron'?'Automatica':'Manuale');cell(tr,s.status);cell(tr,integer(s.symbols_checked));cell(tr,integer(s.alerts_created));root.appendChild(tr);}
}
function drawState(data){
 $('virtual-balance').textContent=money(data.virtualBalance);
 $('enabled-count').textContent=String(data.enabledCount);
 $('signals-count').textContent=integer(data.totalSignals);
 $('asof').textContent='Aggiornato: '+fmtDate(data.time);
 $('live-state').textContent='Fonte: Alpaca IEX · copertura parziale · non adatta a ricostruire tutti i volumi USA';
 drawWatch(data.watchlist);drawTechnical(data.technical||[]);
 drawTechnicalEvents(data.technicalEvents||[]);drawNews(data.news||[]);
 $('telegram-status').textContent=data.alertsConfigured?'TELEGRAM: ATTIVO':'TELEGRAM: NON CONFIGURATO';
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
refresh();setInterval(refresh,60000);
`;


// ---- index.js ----






// Only read-only market data endpoints are used. NO broker order API endpoints in V1.1.
const DATA_BASE = 'https://data.alpaca.markets/v2';
const PAPER_BASE = 'https://paper-api.alpaca.markets/v2';
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
};
const iso = () => new Date().toISOString();
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS }); }
function err(message, status = 400) { return json({ error: message }, status); }
function redirect(path = '/', headers = {}) { return new Response(null, { status: 303, headers: { Location: path, 'Cache-Control': 'no-store', ...headers } }); }
function staticResponse(body, mime) { return new Response(body, { headers: { 'Content-Type': mime, 'Cache-Control': 'no-store' } }); }
function requireConfig(env) {
  if (!env.DB || !env.ALPACA_KEY_ID || !env.ALPACA_SECRET_KEY) throw new Error('Configurazione Alpaca o D1 mancante. Vedi README.');
}
async function alpacaFetch(env, url) {
  const response = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID': env.ALPACA_KEY_ID,
      'APCA-API-SECRET-KEY': env.ALPACA_SECRET_KEY,
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Alpaca HTTP ${response.status}: ${body.slice(0, 160)}`);
  }
  return response.json();
}
async function alpacaClock(env) { return alpacaFetch(env, `${PAPER_BASE}/clock`); }
async function alpacaBars(env, symbol) {
  const url = new URL(`${DATA_BASE}/stocks/${encodeURIComponent(symbol)}/bars`);
  url.searchParams.set('timeframe', '15Min');
  url.searchParams.set('feed', 'iex');
  url.searchParams.set('adjustment', 'raw');
  url.searchParams.set('sort', 'asc');
  url.searchParams.set('limit', '1000');
  url.searchParams.set('start', new Date(Date.now() - 21 * 86_400_000).toISOString());
  url.searchParams.set('end', new Date().toISOString());
  const data = await alpacaFetch(env, url.toString());
  if (data.next_page_token) throw new Error(`${symbol}: risultati paginati: ridurre periodo o implementare paginazione`);
  if (!Array.isArray(data.bars)) throw new Error(`${symbol}: risposta bars non valida`);
  return data.bars;
}

async function alpaca5mBars(env, symbol) {
  // Seven calendar days of 5Min bars: normally under the 1,000-row per-symbol limit.
  // Fail closed on partial pagination, instead of calculating indicators from missing candles.
  const url = new URL(`${DATA_BASE}/stocks/${encodeURIComponent(symbol)}/bars`);
  url.searchParams.set('timeframe', '5Min');
  url.searchParams.set('feed', 'iex');
  url.searchParams.set('adjustment', 'raw');
  url.searchParams.set('sort', 'asc');
  url.searchParams.set('limit', '1000');
  url.searchParams.set('start', new Date(Date.now() - 7 * 86_400_000).toISOString());
  url.searchParams.set('end', new Date().toISOString());
  const data = await alpacaFetch(env, url.toString());
  if (data.next_page_token) throw new Error(`${symbol}: pagina 5Min incompleta`);
  if (!Array.isArray(data.bars)) throw new Error(`${symbol}: risposta 5Min non valida`);
  return data.bars;
}
async function saveTechnical(env, symbol, metric) {
  if(!metric?.ok) return;
  await env.DB.prepare(`INSERT INTO technical_snapshots
    (symbol,bar_ts,close,volume,rsi14,ema20,sma50,high20,volume_ratio20,trend,breakout,bull_flag_candidate,feed,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'iex', ?)
    ON CONFLICT(symbol) DO UPDATE SET
      bar_ts=excluded.bar_ts,close=excluded.close,volume=excluded.volume,
      rsi14=excluded.rsi14,ema20=excluded.ema20,sma50=excluded.sma50,
      high20=excluded.high20,volume_ratio20=excluded.volume_ratio20,
      trend=excluded.trend,breakout=excluded.breakout,
      bull_flag_candidate=excluded.bull_flag_candidate,updated_at=excluded.updated_at
    WHERE excluded.bar_ts >= technical_snapshots.bar_ts`)
    .bind(symbol,metric.barTs,metric.close,metric.volume,metric.rsi14,metric.ema20,
      metric.sma50,metric.high20,metric.volumeRatio20,metric.trend,
      Number(metric.breakout),Number(metric.bullFlagCandidate),iso()).run();
}
async function saveTechnicalEvents(env, symbol, metric, today, used) {
  if(!metric?.ok || !metric.events.length) return [];
  const emitted=[];
  for(const event of metric.events){
    if(used+emitted.length >= TECH_CONFIG.maxEventsPerDay)break;
    const prev=await env.DB.prepare(`SELECT bar_ts FROM technical_events
      WHERE symbol=? AND kind=? ORDER BY bar_ts DESC LIMIT 1`).bind(symbol,event.kind).first();
    if(prev && Date.parse(metric.barTs)-Date.parse(prev.bar_ts)<TECH_CONFIG.eventCooldownMinutes*60_000)continue;
    const res=await env.DB.prepare(`INSERT OR IGNORE INTO technical_events
      (id,symbol,bar_ts,trade_date,kind,description,price,rsi14,volume_ratio20,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),symbol,metric.barTs,today,
        event.kind,event.description,metric.close,metric.rsi14,metric.volumeRatio20,iso()).run();
    if(res.meta?.changes)emitted.push({symbol,kind:event.kind,close:metric.close});
  }
  return emitted;
}
async function fetchNews(env, symbols) {
  const response=await alpacaFetch(env,buildNewsUrl(symbols));
  if(!Array.isArray(response.news))throw new Error('Risposta News Alpaca non valida');
  const articles=normalizeNews(response.news,symbols);
  if(articles.length){
    // Individual writes: safe for D1 free-tier limits and idempotent on repeated scans.
    for(const a of articles){
      await env.DB.prepare(`INSERT OR IGNORE INTO news_items
       (article_id,headline,source,source_url,published_at,symbols_json,fetched_at)
       VALUES(?,?,?,?,?,?,?)`).bind(a.id,a.headline,a.source,a.url,a.publishedAt,JSON.stringify(a.symbols),iso()).run();
    }
  }
  return articles.length;
}

async function tryLock(env) {
  const owner = crypto.randomUUID();
  const now = Date.now();
  const attempt = await env.DB.prepare(`INSERT INTO scan_lock(name,owner,expires_at) VALUES('scout',?,?)
    ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at
    WHERE scan_lock.expires_at < ?`).bind(owner, now + 240000, now).run();
  return attempt.meta?.changes ? owner : null;
}
async function releaseLock(env, owner) {
  await env.DB.prepare("DELETE FROM scan_lock WHERE name='scout' AND owner=?").bind(owner).run();
}
async function saveRecentBars(env, symbol, bars) {
  const valid = bars.filter(b => Number.isFinite(b.o) && Number.isFinite(b.h) &&
    Number.isFinite(b.l) && Number.isFinite(b.c) && Number.isFinite(b.v) &&
    Number.isFinite(Date.parse(b.t)) && b.c > 0 && b.v >= 0).slice(-8);
  if (!valid.length) return;
  const stmts = valid.map(b => env.DB.prepare(`INSERT INTO price_bars(symbol,ts,open,high,low,close,volume,feed)
    VALUES(?,?,?,?,?,?,?,'iex') ON CONFLICT(symbol,ts) DO UPDATE SET
    open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,volume=excluded.volume`)
    .bind(symbol,b.t,b.o,b.h,b.l,b.c,b.v));
  await env.DB.batch(stmts);
}

export async function runScan(env, source = 'manual') {
  requireConfig(env);
  const owner = await tryLock(env);
  if (!owner) return { status: 'busy', detail: 'Un’altra scansione è già in corso.' };
  const runId = crypto.randomUUID(), started = iso();
  let status = 'running', detail = '', checked = 0, alerts = 0, recorded = false, techEvents = 0, newsCount = 0;
  try {
    await env.DB.prepare(`INSERT INTO scan_runs(id,started_at,status,source) VALUES(?,?,'running',?)`)
      .bind(runId, started, source).run();
    recorded = true;
    const clock = await alpacaClock(env);
    if (!clock.is_open) {
      status = 'skipped';
      detail = `Borsa USA chiusa. Prossima apertura: ${clock.next_open || 'da verificare'}`;
      return { status, detail, symbols_checked: 0, alerts_created: 0 };
    }
    const watchlist = await env.DB.prepare('SELECT symbol FROM watchlist WHERE enabled=1 ORDER BY symbol LIMIT 20').all();
    const symbols = (watchlist.results || []).map(r => r.symbol);
    if (!symbols.length) {
      status = 'skipped'; detail = 'Watchlist vuota';
      return { status, detail, symbols_checked: 0, alerts_created: 0 };
    }
    const cache = new Map();
    // At most four concurrent ticker jobs; two read-only data fetches per symbol.
    const outcomes = [];
    for (let i = 0; i < symbols.length; i += 4) {
      const chunk = symbols.slice(i, i + 4);
      const result = await Promise.all(chunk.map(async symbol => {
        try {
          const [bars15,bars5]=await Promise.all([alpacaBars(env,symbol),alpaca5mBars(env,symbol)]);
          const metric = calculateMetrics(bars15, new Date(), cache);
          const technical = calculateTechnical(bars5, new Date(), cache);
          await saveRecentBars(env,symbol,bars15);
          await saveTechnical(env,symbol,technical);
          return { symbol, metric, technical };
        } catch (e) { return { symbol, error: String(e.message || e).slice(0, 180) }; }
      }));
      outcomes.push(...result);
    }
    checked = outcomes.filter(o => !o.error).length;
    const errors = outcomes.filter(o => o.error).map(o => `${o.symbol}: ${o.error}`);
    const today = partsNY(new Date().toISOString(), cache).date;
    const existing = await env.DB.prepare('SELECT COUNT(*) AS n FROM signals WHERE trade_date=?')
      .bind(today).first();
    let used = Number(existing?.n || 0);
    for (const {symbol,metric,error} of outcomes) {
      if (error || !metric?.ok || !metric.flagged || used >= SCOUT_RULES.maxSignalsPerDay) continue;
      // Do not create repeated signals for a stock during the next 60 minutes.
      const previous = await env.DB.prepare('SELECT bar_ts FROM signals WHERE symbol=? ORDER BY bar_ts DESC LIMIT 1')
        .bind(symbol).first();
      if (previous && (Date.parse(metric.latest.t) - Date.parse(previous.bar_ts)) < SCOUT_RULES.cooldownMinutes * 60_000) continue;
      const result = await env.DB.prepare(`INSERT OR IGNORE INTO signals
        (id,symbol,bar_ts,trade_date,price,pct_1h,volume_ratio,volume,baseline_volume,reason,feed,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,'iex',?)`).bind(
          crypto.randomUUID(),symbol,metric.latest.t,metric.tradeDate,metric.latest.c,
          metric.pct1h,metric.volumeRatio,metric.latest.v,metric.baselineVolume,
          metric.reason,iso()
        ).run();
      if (result.meta?.changes) { used++; alerts++; }
    }
    const existingTech = await env.DB.prepare('SELECT COUNT(*) AS n FROM technical_events WHERE trade_date=?')
      .bind(today).first();
    let techUsed=Number(existingTech?.n||0);
    const newEvents=[];
    for(const {symbol,technical,error} of outcomes){
      if(error || !technical?.ok || techUsed>=TECH_CONFIG.maxEventsPerDay)continue;
      const events=await saveTechnicalEvents(env,symbol,technical,today,techUsed);
      newEvents.push(...events);techUsed+=events.length;
    }
    techEvents=newEvents.length;
    const readyTechnical=outcomes.filter(o=>o.technical?.ok).length;
    let newsError='';
    try{newsCount=await fetchNews(env,symbols);}catch(e){
      // News source is optional in V1.1; market data can still work.
      newsError=`News non disponibili: ${String(e?.message||e).slice(0,100)}`;
    }
    const telegram=await sendTelegram(env,newEvents);
    const suffix=` · ${readyTechnical}/${symbols.length} indicatori 5m pronti · ${techEvents} eventi tecnici · ${newsCount} notizie` +
      (telegram.status==='error'?' · Telegram non inviato':'') + (newsError?` · ${newsError}`:'');
    status = errors.length ? (checked ? 'partial' : 'error') : 'success';
    detail = (errors.length ? errors.slice(0, 5).join(' | ') :
      `Controllati ${checked}/${symbols.length} titoli · feed IEX · ${alerts} anomalie Scout`) + suffix;
    return { status, detail, symbols_checked: checked, alerts_created: alerts };
  } catch (e) {
    status = 'error'; detail = String(e.message || e).slice(0, 500);
    return { status, detail, symbols_checked: checked, alerts_created: alerts };
  } finally {
    try {
      if (recorded) await env.DB.prepare(`UPDATE scan_runs SET finished_at=?,status=?,symbols_checked=?,alerts_created=?,detail=? WHERE id=?`)
        .bind(iso(),status,checked,alerts,detail,runId).run();
    } finally {
      await releaseLock(env, owner);
    }
  }
}

async function overview(env) {
  const [watch, signals, scans, totals, technical, technicalEvents, news] = await Promise.all([
    env.DB.prepare(`SELECT w.symbol,w.label,w.enabled,b.close AS price,b.volume,b.ts AS bar_ts,
        (SELECT COUNT(*) FROM signals s WHERE s.symbol=w.symbol) AS all_signals
       FROM watchlist w LEFT JOIN price_bars b ON b.symbol=w.symbol AND b.ts=(SELECT MAX(x.ts) FROM price_bars x WHERE x.symbol=w.symbol)
       ORDER BY w.enabled DESC,w.symbol ASC`).all(),
    env.DB.prepare(`SELECT symbol,bar_ts,trade_date,price,pct_1h,volume_ratio,volume,baseline_volume,reason,created_at,feed
       FROM signals ORDER BY created_at DESC LIMIT 30`).all(),
    env.DB.prepare(`SELECT id,started_at,finished_at,status,source,symbols_checked,alerts_created,detail FROM scan_runs ORDER BY started_at DESC LIMIT 8`).all(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM signals`).first(),
    env.DB.prepare(`SELECT symbol,bar_ts,close,rsi14,ema20,sma50,high20,volume_ratio20,trend,breakout,bull_flag_candidate,updated_at FROM technical_snapshots ORDER BY symbol`).all(),
    env.DB.prepare(`SELECT symbol,bar_ts,kind,description,price,rsi14,volume_ratio20,created_at FROM technical_events ORDER BY created_at DESC LIMIT 30`).all(),
    env.DB.prepare(`SELECT article_id,headline,source,source_url,published_at,symbols_json FROM news_items ORDER BY published_at DESC LIMIT 30`).all()
  ]);
  return {
    mode: 'OBSERVATION_ONLY', source: 'Alpaca IEX (copertura parziale)',
    time: iso(), rules: SCOUT_RULES,
    watchlist: watch.results || [], signals: signals.results || [], scans: scans.results || [],
    technical: technical.results || [], technicalEvents: technicalEvents.results || [],
    news: (news.results||[]).map(n=>({...n,symbols:JSON.parse(n.symbols_json||'[]'),symbols_json:undefined})),
    alertsConfigured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
    totalSignals: totals?.count || 0,
    positions: 0, orders: 0, // Explicit: trading/executor is NOT implemented in V1.1.
    virtualBalance: 10000, // Display-only illustrative value; not a simulated portfolio ledger.
    enabledCount: (watch.results || []).filter(x => x.enabled).length
  };
}

async function addWatchSymbol(request, env) {
  let input;
  try { input = await request.json(); } catch { return err('JSON non valido'); }
  const symbol = String(input?.symbol || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol)) return err('Ticker non valido (es. AAPL)');
  const label = String(input?.label || '').slice(0, 50);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM watchlist WHERE enabled=1').first();
  const exists = await env.DB.prepare('SELECT enabled FROM watchlist WHERE symbol=?').bind(symbol).first();
  if (!exists?.enabled && Number(count?.n || 0) >= 20) return err('Massimo 20 titoli attivi', 409);
  await env.DB.prepare(`INSERT INTO watchlist(symbol,label,enabled) VALUES(?,?,1)
    ON CONFLICT(symbol) DO UPDATE SET label=CASE WHEN excluded.label!='' THEN excluded.label ELSE watchlist.label END,enabled=1`)
    .bind(symbol,label).run();
  return json({ok:true,symbol});
}
async function disableWatchSymbol(symbol, env) {
  if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol)) return err('Ticker non valido');
  await env.DB.prepare('UPDATE watchlist SET enabled=0 WHERE symbol=?').bind(symbol).run();
  return json({ok:true,symbol});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), pathname = url.pathname;
    let response;
    try {
      if (request.method === 'GET' && pathname === '/assets/app.css') response = staticResponse(appCss, 'text/css; charset=utf-8');
      else if (request.method === 'GET' && pathname === '/assets/app.js') response = staticResponse(appJs, 'application/javascript; charset=utf-8');
      else if (request.method === 'GET' && pathname === '/login') response = staticResponse(loginHtml, 'text/html; charset=utf-8');
      else if (request.method === 'POST' && pathname === '/login') {
        if (!isSameOrigin(request)) return err('Origine richiesta non valida', 403);
        const form = await request.formData();
        if (!(await validPassword(form.get('password'), env)) || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
          response = staticResponse(loginHtml.replace('<!--login-error-->', '<p class="error">Password non valida o configurazione incompleta.</p>'), 'text/html; charset=utf-8');
          response = new Response(response.body, { status: 401, headers: response.headers });
        } else {
          response = redirect('/', { 'Set-Cookie': sessionCookie(request, await makeSession(env)) });
        }
      } else {
        if (!(await validSession(request, env))) {
          return pathname.startsWith('/api/') ? err('Sessione scaduta: effettua di nuovo il login', 401) : redirect('/login');
        }
        if (request.method === 'GET' && pathname === '/') response = staticResponse(dashboardHtml, 'text/html; charset=utf-8');
        else if (request.method === 'GET' && pathname === '/api/overview') response = json(await overview(env));
        else if (request.method === 'POST' && pathname === '/logout') {
          response = !isSameOrigin(request) ? err('Origine non valida', 403) :
            redirect('/login', { 'Set-Cookie': expiredSessionCookie(request) });
        } else if (request.method === 'POST' && pathname === '/api/scan') {
          response = !isSameOrigin(request) ? err('Origine non valida', 403) : json(await runScan(env,'manual'));
        } else if (request.method === 'POST' && pathname === '/api/watchlist') {
          response = !isSameOrigin(request) ? err('Origine non valida', 403) : await addWatchSymbol(request,env);
        } else if (request.method === 'DELETE' && pathname.startsWith('/api/watchlist/')) {
          response = !isSameOrigin(request) ? err('Origine non valida', 403) :
            await disableWatchSymbol(decodeURIComponent(pathname.slice('/api/watchlist/'.length)).toUpperCase(), env);
        } else response = err('Risorsa non trovata',404);
      }
    } catch (e) {
      // Avoid leaking API keys or credentials in error responses.
      response = err('Errore applicativo. Verifica configurazione e log Worker.', 500);
      console.error('Request failed', String(e?.message || e).slice(0, 250));
    }
    for (const [k,v] of Object.entries(SECURITY)) response.headers.set(k,v);
    return response;
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runScan(env, 'cron').catch(e => {
      console.error('Scheduled scan failed', String(e?.message || e).slice(0,250));
    }));
  }
};

