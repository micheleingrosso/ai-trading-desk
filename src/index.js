import { calculateMetrics, partsNY, SCOUT_RULES } from './scout.js';
import { validPassword, makeSession, validSession, sessionCookie, expiredSessionCookie, isSameOrigin } from './auth.js';
import { dashboardHtml, loginHtml, appCss, appJs } from './ui.js';
import { calculateTechnical, TECH_CONFIG } from './technical.js';
import { normalizeNews, buildNewsUrl } from './news.js';
import { sendTelegram } from './alerts.js';
import { buildProposal, skepticReview, PROPOSAL_RULES } from './proposals.js';
import { normalizePaperAccount, paperBudget } from './paper.js';
import { readRuntime, updateRuntime, runPaperAutomation, paperDashboard, flushTelegramEvents, queueEvent } from './paper-executor.js';

// Data/account endpoints remain read-only. V1.3 isolated executor uses Alpaca PAPER ONLY (disabled by default).
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
async function alpacaPaperAccount(env) { return normalizePaperAccount(await alpacaFetch(env, `${PAPER_BASE}/account`)); }
async function recordPaperSnapshot(env,account) {
  // Snapshot the entire Alpaca Paper account independently of our trading strategy.
  await env.DB.prepare(`INSERT INTO paper_account_snapshots
    (id,snapshot_at,equity,cash,buying_power,cash_no_leverage,previous_equity,status,blocked)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),iso(),account.equity,account.cash,
      account.buyingPower,account.cashNoLeverage,account.previousEquity,account.status,
      account.blocked?1:0).run();
}
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

// Proposal creation only; idempotent, fail-closed and entirely separate from order execution.
async function createInformationProposals(env, outcomes, today, budget) {
  const stats={created:0,ignored:0,errors:0};
  if (!budget) return {...stats,reason:"Account Paper non disponibile: nessuna proposta creata"};
  let num=Number((await env.DB.prepare('SELECT COUNT(*) AS n FROM trade_proposals WHERE trade_date=?').bind(today).first())?.n||0);
  let pending=Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM trade_proposals WHERE status IN ('WAIT','SKIP')").first())?.n||0);
  for(const o of outcomes) {
    if(o.error||!o.technical?.ok||pending>=PROPOSAL_RULES.maxPending||num>=PROPOSAL_RULES.maxPerDay)continue;
    const candidate=buildProposal(o.technical,new Date(),budget);
    if(!candidate.ok){stats.ignored++;continue;}
    try {
      // Deliberately only one proposal per ticker per day in the early prototype.
      const prev=await env.DB.prepare('SELECT id FROM trade_proposals WHERE symbol=? AND trade_date=? LIMIT 1').bind(o.symbol,today).first();
      if(prev)continue;
      // Only give the AI a small bounded list of headlines; they are untrusted context.
      const news=await env.DB.prepare('SELECT headline FROM news_items WHERE symbols_json LIKE ? AND published_at>=? ORDER BY published_at DESC LIMIT 3')
        .bind('%"'+o.symbol+'"%',new Date(Date.now()-86400000).toISOString()).all();
      const skeptic=await skepticReview(env,o.symbol,candidate,(news.results||[]).map(x=>x.headline));
      const id=crypto.randomUUID();
      const res=await env.DB.prepare(`INSERT OR IGNORE INTO trade_proposals
        (id,symbol,bar_ts,trade_date,source_event,entry_price,stop_price,target_price,
        shares,notional,loss_at_stop,reward_risk,rationale,cautions_json,technical_json,
        skeptic_mode,skeptic_verdict,skeptic_reasons_json,status,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,o.symbol,candidate.barTs,today,candidate.sourceEvent,
        candidate.entry,candidate.stop,candidate.target,candidate.quantity,candidate.notional,candidate.lossAtStop,
        candidate.riskReward,candidate.rationale,JSON.stringify(candidate.cautions),JSON.stringify(candidate.technical),
        skeptic.mode,skeptic.verdict,JSON.stringify(skeptic.counterarguments),skeptic.verdict,iso()).run();
      if(res.meta?.changes){num++;pending++;stats.created++;}
    } catch(e) {stats.errors++;console.error('Proposal failure',o.symbol,String(e?.message||e).slice(0,160));}
  }
  return stats;
}

async function archiveInformationProposal(request, env, id) {
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id))return err('ID non valido');
  let input;
  try{input=await request.json();}catch{return err('JSON non valido');}
  if(input?.action!=='archive')return err('Azione non consentita');
  const note=String(input.note||'').trim().slice(0,200);
  // Archiving is not an approval and never creates an order or a position.
  const res=await env.DB.prepare("UPDATE trade_proposals SET status='ARCHIVED',reviewed_at=?,review_note=? WHERE id=? AND status IN ('WAIT','SKIP')")
    .bind(iso(),note,id).run();
  if(!res.meta?.changes)return err('Proposta inesistente o già archiviata',409);
  await env.DB.prepare('INSERT INTO proposal_audit(id,proposal_id,action,detail,created_at) VALUES(?,?,?,?,?)')
    .bind(crypto.randomUUID(),id,'ARCHIVED',note,iso()).run();
  return json({ok:true,status:'ARCHIVED'});
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
  let status = 'running', detail = '', checked = 0, alerts = 0, recorded = false, techEvents = 0, newsCount = 0, proposals = 0, proposalErrors=0;
  let budget=null,accountNote='',paperAccount=null;
  try {
    await env.DB.prepare(`INSERT INTO scan_runs(id,started_at,status,source) VALUES(?,?,'running',?)`)
      .bind(runId, started, source).run();
    recorded = true;
    // Re-read Alpaca Paper every scan. Missing account data MUST NEVER lead to using a fake budget.
    try{
      const account=await alpacaPaperAccount(env);
      paperAccount=account;
      await recordPaperSnapshot(env,account);
      if(account.eligibleForInformationalSizing)budget=paperBudget(account);
      else accountNote='Conto Paper sospeso o liquidità non idonea: proposte bloccate';
    }catch(e){
      accountNote='Saldo Alpaca Paper non verificabile: proposte bloccate';
      console.error('Paper account sync failed:',String(e?.message||e).slice(0,160));
    }
    const clock = await alpacaClock(env);
    if (!clock.is_open) {
      status = 'skipped';
      detail = `Borsa USA chiusa. Prossima apertura: ${clock.next_open || 'da verificare'}` + (accountNote?' · '+accountNote:'');
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
    // No proposals from incomplete/noncurrent data; risk rules apply before Skeptic.
    const pstats=await createInformationProposals(env,outcomes,today,budget);
    proposals=pstats.created;proposalErrors=pstats.errors;
    // Only after deterministic indicators, account and risk checks. Disabled unless explicitly armed.
    const paperResult=source==='cron' ?
      await runPaperAutomation(env,{outcomes,account:paperAccount,date:today}) :
      await runPaperAutomation(env); // Manual Scout button NEVER places a Paper order.
    const telegram=await sendTelegram(env,newEvents);
    const suffix=` · ${readyTechnical}/${symbols.length} indicatori 5m pronti · ${techEvents} eventi tecnici · ${newsCount} notizie · ${proposals} proposte informative` +
      (proposalErrors?` · ${proposalErrors} errori proposte`:``) +
      (telegram.status==='error'?' · Telegram non inviato':'') + (newsError?` · ${newsError}`:'') + (accountNote?` · ${accountNote}`:'');
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
  const [watch, signals, scans, totals, technical, technicalEvents, news, proposals, lastPaper, firstPaper, paperExecution] = await Promise.all([
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
    env.DB.prepare(`SELECT article_id,headline,source,source_url,published_at,symbols_json FROM news_items ORDER BY published_at DESC LIMIT 30`).all(),
    env.DB.prepare(`SELECT id,symbol,bar_ts,trade_date,source_event,entry_price,stop_price,target_price,shares,notional,loss_at_stop,reward_risk,rationale,cautions_json,technical_json,skeptic_mode,skeptic_verdict,skeptic_reasons_json,status,created_at,reviewed_at FROM trade_proposals ORDER BY created_at DESC LIMIT 25`).all(),
    env.DB.prepare('SELECT snapshot_at,equity,cash,buying_power,cash_no_leverage,previous_equity,status FROM paper_account_snapshots ORDER BY snapshot_at DESC LIMIT 1').first(),
    env.DB.prepare('SELECT snapshot_at,equity FROM paper_account_snapshots ORDER BY snapshot_at ASC LIMIT 1').first(),
    paperDashboard(env)
  ]);
  // Do not silently show stale snapshots as if they were current.
  let account=null,accountError=null;
  try{account=await alpacaPaperAccount(env);}catch(e){
    accountError='Sincronizzazione Alpaca Paper non riuscita. Ultimo snapshot mostrato separatamente.';
    console.error('Alpaca Paper dashboard unavailable:',String(e?.message||e).slice(0,160));
  }
  const startingEquity=Number(firstPaper?.equity);
  const currentEquity=Number(account?.equity);
  const balanceChange=account && Number.isFinite(startingEquity) && startingEquity>0 ?
    Math.round((currentEquity-startingEquity)*100)/100:null;
  const balanceChangePct=account && balanceChange!==null?Math.round((balanceChange/startingEquity)*10000)/100:null;
  return {
    mode: paperExecution.settings.enabled&&paperExecution.settings.armed?'AUTO_PAPER':'OBSERVATION_ONLY', source: 'Alpaca IEX (copertura parziale)',
    time: iso(), rules: SCOUT_RULES,
    watchlist: watch.results || [], signals: signals.results || [], scans: scans.results || [],
    technical: technical.results || [], technicalEvents: technicalEvents.results || [],
    news: (news.results||[]).map(n=>({...n,symbols:JSON.parse(n.symbols_json||'[]'),symbols_json:undefined})),
    alertsConfigured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
    proposals: (proposals.results||[]).map(p=>({...p,cautions:JSON.parse(p.cautions_json||'[]'),skepticReasons:JSON.parse(p.skeptic_reasons_json||'[]'),technical:JSON.parse(p.technical_json||'{}'),cautions_json:undefined,skeptic_reasons_json:undefined,technical_json:undefined})),
    skepticConfigured: Boolean(env.AI && typeof env.AI.run==='function'),
    proposalRules: PROPOSAL_RULES,
    paperAccount:account?{...account,asOf:iso()}:null,
    paperAccountError:accountError,
    paperLastSnapshot:lastPaper||null,
    paperFirstSnapshot:firstPaper||null,
    paperBalanceChange:balanceChange,
    paperBalanceChangePct:balanceChangePct,
    paperSizing:account?.eligibleForInformationalSizing?{
      equity:account.equity,maxNotional:Math.min(account.cashNoLeverage,account.equity*PROPOSAL_RULES.maxNotionalFraction),
      maxRisk:account.equity*PROPOSAL_RULES.maxLossFraction
    }:null,
    totalSignals: totals?.count || 0,
    paperExecution,
    positions: paperExecution.summary.active, orders: paperExecution.summary.total,
    virtualBalance: account?.equity??null, // Live read-only Alpaca PAPER equity, no fake fallback.
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
        else if (request.method === 'POST' && /^\/api\/proposals\/[0-9a-f-]+\/archive$/i.test(pathname)) {
          response = !isSameOrigin(request) ? err('Origine non valida',403) :
            await archiveInformationProposal(request,env,pathname.split('/')[3]);
        }
        else if (request.method === 'POST' && pathname === '/api/paper/settings') {
          if(!isSameOrigin(request))response=err('Origine non valida',403);
          else {
            let input;try{input=await request.json();}catch{input=null;}
            if(!input||!['enable','pause'].includes(input.action))response=err('Azione non valida');
            else if(input.action==='enable' && input.confirm!=='ENABLE_PAPER_ONLY')response=err('Conferma Paper mancante',400);
            else {
              try {
                await updateRuntime(env,input.action==='enable',input.action==='enable'?'Abilitato manualmente dal proprietario':'Pausa manuale');
                await queueEvent(env,null,'MODE:'+crypto.randomUUID(),'MODE',input.action==='enable'?'🟢 AUTO PAPER abilitato dalla dashboard. MAI denaro reale.':'⏸ AUTO PAPER in pausa: non saranno inviati nuovi ingressi. Le uscite bracket esistenti rimangono attive su Alpaca Paper.');
                await flushTelegramEvents(env);
                response=json({ok:true,mode:input.action});
              }catch(e){response=err(String(e.message).slice(0,170),409);}
            }
          }
        }
        else if (request.method === 'POST' && pathname === '/api/paper/telegram-test') {
          if(!isSameOrigin(request))response=err('Origine non valida',403);
          else if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)response=err('Configura prima TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID',409);
          else {
            await queueEvent(env,null,'TEST:'+crypto.randomUUID(),'TEST','✅ AI Trading Desk 1.3 · messaggio di prova. Collegamento Telegram pronto per gli eventi Alpaca PAPER. Nessun ordine effettuato.');
            const sent=await flushTelegramEvents(env);
            response=json({ok:true,telegram:sent});
          }
        }
        else if (request.method === 'POST' && pathname === '/api/paper/reconcile') {
          response = !isSameOrigin(request) ? err('Origine non valida',403) : json(await runPaperAutomation(env));
        }
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
    // Every 5 minutes: monitor Alpaca fills and send Telegram. Every 15: also scan.
    const task=new Date().getUTCMinutes()%15===0?runScan(env,'cron'):runPaperAutomation(env);
    ctx.waitUntil(task.catch(e=>console.error('Paper/Scout cron failed',String(e?.message||e).slice(0,240))));
  }
};
