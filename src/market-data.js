// 1.3.1: Alpaca IEX batch retrieval, closed-bar caching, paginated reads.
// These market-data functions NEVER submit broker orders.
import { partsNY } from './scout.js';

export const MARKET_RULES = Object.freeze({
  maxWatchlist: 50, shards: 5, maxBootstrapPerShard: 4,
  batchSymbols: 4, maxDataPages: 4, maxRowsPerSymbol: 650,
  settleSeconds: 60,
});
const MARKET_BASE = 'https://data.alpaca.markets';
const mins = { '5Min':5, '15Min':15 };
const shift = (ms) => new Date(Date.now()-ms).toISOString();
const group=(a,n)=>{const result=[];for(let i=0;i<a.length;i+=n)result.push(a.slice(i,i+n));return result;};
export function shardWatchlist(symbols, date=new Date(), numShards=MARKET_RULES.shards){
  const index=date.getUTCMinutes()%numShards;
  return symbols.filter((_,i)=>i%numShards===index);
}
export function closedRegularBar(bar,timeframe,now=Date.now(),cache=new Map()){
  const start=Date.parse(bar?.t),len=mins[timeframe];
  return Number.isFinite(start) && len && start+(len*60+MARKET_RULES.settleSeconds)*1000<=now &&
    Number.isFinite(bar.o)&&Number.isFinite(bar.h)&&Number.isFinite(bar.l)&&Number.isFinite(bar.c)&&
    Number.isFinite(bar.v)&&bar.o>0&&bar.c>0&&bar.h>=Math.max(bar.o,bar.c)&&bar.l<=Math.min(bar.o,bar.c)&&bar.v>=0&&
    partsNY(bar.t,cache).regular;
}
export async function fetchMultiBars(env,symbols,timeframe,start,end,transport=fetch){
  if(!symbols.length)return new Map();
  if(!mins[timeframe]||symbols.length>MARKET_RULES.batchSymbols)throw new Error('Batch richiesto troppo grande');
  const results=new Map(symbols.map(s=>[s,[]]));
  let pageToken='',pages=0;
  do {
    if(++pages>MARKET_RULES.maxDataPages)throw new Error('Alpaca: paginazione oltre limite; dati parziali scartati');
    const u=new URL('/v2/stocks/bars',MARKET_BASE);
    for(const [k,v] of Object.entries({symbols:symbols.join(','),timeframe,feed:'iex',adjustment:'raw',sort:'asc',limit:'10000',start,end}))u.searchParams.set(k,v);
    if(pageToken)u.searchParams.set('page_token',pageToken);
    const response=await transport(u.toString(),{headers:{'APCA-API-KEY-ID':env.ALPACA_KEY_ID,'APCA-API-SECRET-KEY':env.ALPACA_SECRET_KEY,'Accept':'application/json'},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('Alpaca dati HTTP '+response.status);
    const body=await response.json();
    if(!body||typeof body.bars!=='object'||Array.isArray(body.bars))throw new Error('Alpaca: formato batch non valido');
    for(const [symbol,bars] of Object.entries(body.bars)){
      if(!results.has(symbol)||!Array.isArray(bars))throw new Error('Alpaca: simboli inattesi o dati non validi');
      results.get(symbol).push(...bars);
    }
    pageToken=body.next_page_token||'';
  }while(pageToken);
  return results;
}
async function storeBars(env,symbol,timeframe,bars,now=Date.now(),latestStored=null){
  const ny=new Map();
  const validated=bars.filter(b=>closedRegularBar(b,timeframe,now,ny) && (!latestStored || b.t>latestStored));
  const unique=new Map(validated.map(b=>[b.t,b]));
  const list=[...unique.values()];
  for(const block of group(list,60)) {
    const statements=block.map(b=>env.DB.prepare(`INSERT OR IGNORE INTO market_bars_cache
      (symbol,timeframe,ts,open,high,low,close,volume) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(symbol,timeframe,b.t,b.o,b.h,b.l,b.c,b.v));
    await env.DB.batch(statements);
  }
  return list.length;
}
async function cachedMetrics(env,symbols){
  const stats=new Map(symbols.map(s=>[s,{ '5Min':{n:0,last:null},'15Min':{n:0,last:null} }]));
  if(!symbols.length)return stats;
  const bind=symbols.map(()=>'?').join(',');
  const r=await env.DB.prepare(`SELECT symbol,timeframe,COUNT(*) n,MAX(ts) AS last FROM market_bars_cache
    WHERE symbol IN (${bind}) GROUP BY symbol,timeframe`).bind(...symbols).all();
  for(const a of r.results||[])if(stats.has(a.symbol))stats.get(a.symbol)[a.timeframe]={n:Number(a.n)||0,last:a.last||null};
  return stats;
}
export async function cachedBars(env,symbol,timeframe){
  const r=await env.DB.prepare(`SELECT ts AS t,open AS o,high AS h,low AS l,close AS c,volume AS v
     FROM market_bars_cache WHERE symbol=? AND timeframe=? ORDER BY ts DESC LIMIT ?`)
    .bind(symbol,timeframe,MARKET_RULES.maxRowsPerSymbol).all();
  return (r.results||[]).reverse();
}
export async function retrieveMarketBars(env,symbols,{now=new Date(),transport=fetch}={}){
  // Cold history is fetched once per symbol, then only a small overlapping tail.
  // A cold ticker that cannot be fully bootstrapped does not qualify for an order.
  const stats=await cachedMetrics(env,symbols),bootstrap=[];
  const recent=await env.DB.prepare('SELECT symbol,last_attempt_ms FROM market_bootstrap').all();
  const attempts=new Map((recent.results||[]).map(x=>[x.symbol,Number(x.last_attempt_ms)]));
  const cooling=new Set();
  for(const s of symbols){
    const q=stats.get(s);
    if(q['5Min'].n<60||q['15Min'].n<130){
      if(attempts.has(s)&&now.getTime()-attempts.get(s)<30*60_000)cooling.add(s);
      else bootstrap.push(s);
    }
  }
  const cold=new Set(bootstrap.slice(0,MARKET_RULES.maxBootstrapPerShard));
  const delayed=new Set([...bootstrap.slice(MARKET_RULES.maxBootstrapPerShard),...cooling]);
  for(const s of cold)await env.DB.prepare(`INSERT INTO market_bootstrap(symbol,last_attempt_ms) VALUES(?,?)
    ON CONFLICT(symbol) DO UPDATE SET last_attempt_ms=excluded.last_attempt_ms`)
    .bind(s,now.getTime()).run();
  const errors=new Map();
  for(const timeframe of ['5Min','15Min']){
    const startFull=timeframe==='5Min'?shift(10*86400000):shift(23*86400000);
    const startTail=timeframe==='5Min'?shift(45*60000):shift(90*60000);
    for(const [needFull,eligible] of [[true,[...cold]],[false,symbols.filter(s=>!cold.has(s)&&!delayed.has(s))]]){
      for(const bunch of group(eligible,MARKET_RULES.batchSymbols)){
        try{
          const fetched=await fetchMultiBars(env,bunch,timeframe,needFull?startFull:startTail,now.toISOString(),transport);
          for(const s of bunch)await storeBars(env,s,timeframe,fetched.get(s)||[],now.getTime(),stats.get(s)?.[timeframe]?.last);
        }catch(e){for(const s of bunch)errors.set(s,String(e.message||e).slice(0,160));}
      }
    }
  }
  const result=new Map();
  for(const s of symbols){
    if(delayed.has(s)){result.set(s,{error:'Storico in preparazione: riproverò nel ciclo successivo'});continue;}
    if(errors.has(s)){result.set(s,{error:errors.get(s)});continue;}
    const [bars5,bars15]=await Promise.all([cachedBars(env,s,'5Min'),cachedBars(env,s,'15Min')]);
    if(bars5.length<51||bars15.length<100){result.set(s,{error:'Storico IEX insufficiente; nessun ordine consentito'});continue;}
    result.set(s,{bars5,bars15});
  }
  return result;
}

// Weekly retention of re-fetchable market caches only. Never purge trades,
// paper_trade_events, audit, proposals, or financial performance history.
export async function pruneMarketCache(env,now=new Date()){
  const cutoff5=new Date(now.getTime()-21*86400000).toISOString();
  const cutoff15=new Date(now.getTime()-60*86400000).toISOString();
  await env.DB.prepare("DELETE FROM market_bars_cache WHERE timeframe='5Min' AND ts<?").bind(cutoff5).run();
  await env.DB.prepare("DELETE FROM market_bars_cache WHERE timeframe='15Min' AND ts<?").bind(cutoff15).run();
  await env.DB.prepare('DELETE FROM price_bars WHERE ts<?').bind(cutoff15).run();
}
