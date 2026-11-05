import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {shardWatchlist,closedRegularBar,fetchMultiBars,retrieveMarketBars} from '../src/market-data.js';
import {calculateTechnical} from '../src/technical.js';
import {readRuntime,updateRuntime} from '../src/paper-executor.js';

const all=['0001_init.sql','0002_technical_news.sql','0003_proposals.sql','0004_paper_snapshots.sql','0005_paper_execution.sql','0006_scaling_diagnostics.sql'];
function fixture(){const db=new DatabaseSync(':memory:');for(const n of all)db.exec(readFileSync(new URL('../migrations/'+n,import.meta.url),'utf8'));
 const DB={prepare(sql){let stmt=db.prepare(sql),args=[];const w={bind(...a){args=a;return w},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){return {meta:{changes:stmt.run(...args).changes}}}};return w;},async batch(s){return Promise.all(s.map(x=>x.run()))}};
 return {db,env:{DB,ALPACA_KEY_ID:'fake',ALPACA_SECRET_KEY:'fake',PAPER_AUTOTRADE_ARM:'PAPER_ONLY'}};}
test('50 symbols are scanned in 5 disjoint shards, each exactly once per 5 minutes',()=>{
 const symbols=Array.from({length:50},(_,i)=>'T'+String(i).padStart(2,'0'));
 const groups=Array.from({length:5},(_,i)=>shardWatchlist(symbols,new Date('2026-11-05T15:'+String(i).padStart(2,'0')+':00Z')));
 assert.deepEqual(groups.map(x=>x.length),[10,10,10,10,10]);
 assert.deepEqual(groups.flat().sort(),symbols);
});
test('only settled regular-session IEX bars are inserted',()=>{
 const b={t:'2026-11-04T14:30:00Z',o:100,h:101,l:99,c:100.4,v:100};
 assert.equal(closedRegularBar(b,'5Min',Date.parse('2026-11-04T14:34:59Z')),false);
 assert.equal(closedRegularBar(b,'5Min',Date.parse('2026-11-04T14:36:01Z')),true);
 assert.equal(closedRegularBar({...b,t:'2026-11-04T13:20:00Z'},'5Min',Date.parse('2026-11-04T14:40:00Z')),false);
 assert.equal(closedRegularBar({...b,v:-1},'5Min',Date.parse('2026-11-04T14:40:00Z')),false);
});
test('Alpaca multi-symbol API consumes pagination instead of silently truncating',async()=>{
 let calls=0,urls=[];
 const transport=async (url)=>{urls.push(new URL(url));calls++;return Response.json(calls===1?{bars:{AAPL:[{t:'t1'}]},next_page_token:'cursor'}:{bars:{MSFT:[{t:'t2'}]},next_page_token:null});};
 const bars=await fetchMultiBars({ALPACA_KEY_ID:'a',ALPACA_SECRET_KEY:'b'},['AAPL','MSFT'],'5Min','2026-11-01','2026-11-02',transport);
 assert.equal(calls,2);assert.equal(bars.get('AAPL').length,1);assert.equal(bars.get('MSFT').length,1);
 assert.equal(urls[0].searchParams.get('symbols'),'AAPL,MSFT');assert.equal(urls[1].searchParams.get('page_token'),'cursor');
 assert.equal(urls[0].searchParams.get('feed'),'iex');
});
test('market API rejects unexpected symbols and incomplete pagination',async()=>{
 const env={ALPACA_KEY_ID:'a',ALPACA_SECRET_KEY:'b'};
 await assert.rejects(()=>fetchMultiBars(env,['AAPL'],'5Min','2026-11-01','2026-11-02',async()=>Response.json({bars:{EVIL:[]},next_page_token:null})),/inattesi/);
 await assert.rejects(()=>fetchMultiBars(env,['AAPL'],'5Min','2026-11-01','2026-11-02',async()=>Response.json({bars:{AAPL:[]},next_page_token:'continue'})),/paginazione/);
});
test('upgrade migration preserves history but pauses auto Paper even if previously enabled',async()=>{
 const raw=new DatabaseSync(':memory:');
 for(const n of all.slice(0,-1))raw.exec(readFileSync(new URL('../migrations/'+n,import.meta.url),'utf8'));
 raw.prepare("UPDATE paper_runtime SET enabled=1 WHERE id=1").run();
 raw.prepare("INSERT INTO scan_runs(id,started_at,status,source) VALUES('keep','2026-11-04T16:00:00Z','success','manual')").run();
 const migration=readFileSync(new URL('../migrations/0006_scaling_diagnostics.sql',import.meta.url),'utf8');raw.exec(migration);
 assert.equal(raw.prepare('SELECT enabled FROM paper_runtime').get().enabled,0);
 assert.equal(raw.prepare('SELECT validated FROM release_guard').get().validated,0);
 assert.equal(raw.prepare("SELECT COUNT(*) n FROM scan_runs WHERE id='keep'").get().n,1);
 assert.equal(raw.prepare("SELECT COUNT(*) n FROM watchlist").get().n,10);
});
test('new release must be explicitly validated before automatic Paper can be enabled',async()=>{
 const {db,env}=fixture();
 const initial=await readRuntime(env);assert.equal(initial.enabled,false);assert.equal(initial.armed,false);
 await assert.rejects(()=>updateRuntime(env,true,'test'),/collaudato/);
 db.prepare('UPDATE release_guard SET validated=1 WHERE id=1').run();
 await updateRuntime(env,true,'explicit test');
 assert.equal((await readRuntime(env)).enabled,true);
 await updateRuntime(env,false,'pause');assert.equal((await readRuntime(env)).enabled,false);
});
test('ORB15 only confirms on a completed close strictly above first-15-minute high',()=>{
 const bars=[];for(const day of ['2026-11-03','2026-11-04'])for(let i=0;i<(day.endsWith('03')?78:20);i++){
  let c=100; if(day.endsWith('04')&&i===19)c=102;
  const ts=new Date(Date.parse(day+'T14:30:00Z')+i*300000).toISOString();
  bars.push({t:ts,o:c,h:c,l:c,c,v:1000});
 }
 const t=new Date('2026-11-04T16:12:00Z');const r=calculateTechnical(bars,t);
 assert.equal(r.ok,true);assert.equal(r.orb15.confirmed,true);assert.equal(r.orb15.justConfirmed,true);
 assert.ok(r.events.some(x=>x.kind==='ORB15_CONFIRM'));
 assert.ok(r.source.includes('IEX'));
});
test('repeated cached market fetches do not reinsert historical bars',async()=>{
 const {db,env}=fixture();const now=new Date('2026-11-04T19:00:00Z');
 const prev=globalThis.Date;globalThis.Date=class extends prev{constructor(...a){super(...(a.length?a:[now.getTime()]));}static now(){return now.getTime();}};
 let requestCount=0;
 const transport=async (url)=>{
  requestCount++;
  const u=new URL(url),is5=u.searchParams.get('timeframe')==='5Min',count=is5?70:140;
  const arr=[];const start='2026-11-03T14:30:00Z';
  for(let i=0;i<count;i++){const t=new prev(prev.parse(start)+i*(is5?300000:900000)).toISOString();arr.push({t,o:100,h:101,l:99,c:100,v:1000});}
  return Response.json({bars:{AAPL:arr},next_page_token:null});
 };
 try{
  await retrieveMarketBars(env,['AAPL'],{now,transport});
  const first=db.prepare('SELECT COUNT(*) n FROM market_bars_cache').get().n;
  await retrieveMarketBars(env,['AAPL'],{now,transport});
  const second=db.prepare('SELECT COUNT(*) n FROM market_bars_cache').get().n;
  assert.equal(first,second);assert.ok(requestCount>=2);
 }finally{globalThis.Date=prev;}
});
