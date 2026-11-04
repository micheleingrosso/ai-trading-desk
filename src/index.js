import { calculateMetrics, partsNY, SCOUT_RULES } from './scout.js';
import { validPassword, makeSession, validSession, sessionCookie, expiredSessionCookie, isSameOrigin } from './auth.js';
import { dashboardHtml, loginHtml, appCss, appJs } from './ui.js';

// Only read-only market data endpoints are used. NO broker order APIs anywhere in V1.
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
  let status = 'running', detail = '', checked = 0, alerts = 0, recorded = false;
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
    // At most five concurrent outbound HTTP calls.
    const outcomes = [];
    for (let i = 0; i < symbols.length; i += 5) {
      const chunk = symbols.slice(i, i + 5);
      const result = await Promise.all(chunk.map(async symbol => {
        try {
          const bars = await alpacaBars(env, symbol);
          const metric = calculateMetrics(bars, new Date(), cache);
          await saveRecentBars(env, symbol, bars);
          return { symbol, metric };
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
    status = errors.length ? (checked ? 'partial' : 'error') : 'success';
    detail = errors.length ? errors.slice(0, 5).join(' | ') :
      `Controllati ${checked}/${symbols.length} titoli · feed IEX · ${alerts} anomalie nuove`;
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
  const [watch, signals, scans, totals] = await Promise.all([
    env.DB.prepare(`SELECT w.symbol,w.label,w.enabled,b.close AS price,b.volume,b.ts AS bar_ts,
        (SELECT COUNT(*) FROM signals s WHERE s.symbol=w.symbol) AS all_signals
       FROM watchlist w LEFT JOIN price_bars b ON b.symbol=w.symbol AND b.ts=(SELECT MAX(x.ts) FROM price_bars x WHERE x.symbol=w.symbol)
       ORDER BY w.enabled DESC,w.symbol ASC`).all(),
    env.DB.prepare(`SELECT symbol,bar_ts,trade_date,price,pct_1h,volume_ratio,volume,baseline_volume,reason,created_at,feed
       FROM signals ORDER BY created_at DESC LIMIT 30`).all(),
    env.DB.prepare(`SELECT id,started_at,finished_at,status,source,symbols_checked,alerts_created,detail FROM scan_runs ORDER BY started_at DESC LIMIT 8`).all(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM signals`).first()
  ]);
  return {
    mode: 'OBSERVATION_ONLY', source: 'Alpaca IEX (copertura parziale)',
    time: iso(), rules: SCOUT_RULES,
    watchlist: watch.results || [], signals: signals.results || [], scans: scans.results || [],
    totalSignals: totals?.count || 0,
    positions: 0, orders: 0, // Explicit: trading/executor is NOT implemented in V1.
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
