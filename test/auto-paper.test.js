import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {paperArmed,paperRequest,safeBracket,bracketPayload,updateRuntime,readRuntime,runPaperAutomation,tradeEventChanges} from '../src/paper-executor.js';
import {normalizePaperAccount} from '../src/paper.js';
import worker from '../src/index.js';
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const f of ['0001_init.sql','0002_technical_news.sql','0003_proposals.sql','0004_paper_snapshots.sql','0005_paper_execution.sql','0006_scaling_diagnostics.sql'])db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const D1={prepare(sql){let stmt=db.prepare(sql),params=[];const obj={bind(...args){params=args;return obj;},async first(){return stmt.get(...params)||null;},async all(){return {results:stmt.all(...params)};},async run(){return {meta:{changes:stmt.run(...params).changes}};}};return obj;},
 async batch(stmts){return Promise.all(stmts.map(s=>s.run()));}};
 const env={DB:D1,ALPACA_KEY_ID:'paperfake',ALPACA_SECRET_KEY:'papersecretfake',TELEGRAM_BOT_TOKEN:'fakebot',TELEGRAM_CHAT_ID:'12345',
 PAPER_AUTOTRADE_ARM:'PAPER_ONLY',DASHBOARD_PASSWORD:'another-long-fake-password',SESSION_SECRET:'a-very-long-secret-auth-for-test-session-xyz-12345678',
 AI:{async run(){return {response:JSON.stringify({verdict:'PASS',reasons:['Trend confermato da EMA','Volume sufficiente sul feed IEX','Nessuna notizia negativa evidente']})}}}};
 return {db,env};
}
const makeAccount=()=>normalizePaperAccount({equity:'100000',cash:'100000',buying_power:'400000',status:'ACTIVE',currency:'USD'});
function technical(now){return {ok:true,source:'Alpaca IEX, 5Min, sessione regolare',barTs:new Date(now-7*60000).toISOString(),close:100,ema20:99,sma50:98,rsi14:60,volumeRatio20:3,breakout:true,bullFlagCandidate:false,trend:'UP'};}
const origin='https://unit.example.workers.dev';
async function session(env){const res=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:env.DASHBOARD_PASSWORD})}),env);assert.equal(res.status,303);return res.headers.get('set-cookie').split(';')[0];}

test('migration 0005 is non-destructive, repeatable, and automation OFF by default',async()=>{
 const {db,env}=fixture();const sql=readFileSync(new URL('../migrations/0005_paper_execution.sql',import.meta.url),'utf8');db.exec(sql);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM watchlist').get().n,10);
 assert.equal((await readRuntime(env)).enabled,false);
 assert.equal((await readRuntime(env)).armed,false); // Safe upgrade gate remains OFF
 assert.equal(db.prepare('SELECT COUNT(*) n FROM paper_trades').get().n,0);
});
test('paper credentials/arming + order shape cannot be redirected to live host',async()=>{
 const {env}=fixture();
 assert.equal(paperArmed({...env,PAPER_AUTOTRADE_ARM:'OTHER'}),false);
 await assert.rejects(()=>updateRuntime({...env,PAPER_AUTOTRADE_ARM:undefined},true,'test'),/segreto|collaudato|mancante/i);
 await assert.rejects(()=>paperRequest(env,'https://api.alpaca.markets/v2/orders'),/Endpoint/);
 await assert.rejects(()=>paperRequest(env,'/positions',{method:'POST',body:{}}),/POST/);
 await assert.rejects(()=>paperRequest({...env,PAPER_AUTOTRADE_ARM:''},'/orders',{method:'POST',body:{order_class:'bracket',side:'buy',type:'limit',time_in_force:'gtc',extended_hours:false}}),/autorizzato/);
});
test('risk guard uses equity+cash not leveraged buying power; creates protective GTC bracket',()=>{
 const account=makeAccount();
 const c={ok:true,entry:100,stop:98.50,target:103,quantity:1000};
 const risk=safeBracket(c,account);
 assert.equal(risk.ok,true);
 assert.equal(risk.qty,49); // price markup reduces maximum 5% notional
 assert.ok(risk.notional<=5000&&risk.risk<=250);
 const payload=bracketPayload('AAPL',risk,'atd13-123e4567-e89b-42d3-a456-426614174000');
 assert.equal(payload.order_class,'bracket');assert.equal(payload.side,'buy');
 assert.equal(payload.extended_hours,false);assert.equal(payload.time_in_force,'gtc');
 assert.equal(payload.stop_loss.stop_price,'98.50');
 assert.equal(payload.take_profit.limit_price,'103.00');
 const poor=safeBracket(c,{...account,cashNoLeverage:30});assert.equal(poor.ok,false);
});
test('authenticated same-origin + explicit confirmation required for enable and pause',async()=>{
 const {env}=fixture(); const cookie=await session(env);
 const attempt=(path,body,headers={})=>worker.fetch(new Request(origin+path,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)}),env);
 const bad=await attempt('/api/paper/settings',{action:'enable',confirm:'BUY'});assert.equal(bad.status,400);
 const cross=await attempt('/api/paper/settings',{action:'enable',confirm:'ENABLE_PAPER_ONLY'},{Origin:'https://evil.example'});assert.equal(cross.status,403);
 assert.equal((await readRuntime(env)).enabled,false);
 env.DB.prepare('UPDATE release_guard SET validated=1 WHERE id=1').run();
 const ok=await attempt('/api/paper/settings',{action:'enable',confirm:'ENABLE_PAPER_ONLY'});assert.equal(ok.status,200);
 assert.equal((await readRuntime(env)).enabled,true);
 const pause=await attempt('/api/paper/settings',{action:'pause'});assert.equal(pause.status,200);
 assert.equal((await readRuntime(env)).enabled,false);
});
test('auto Paper executes exactly one bracket; reconciles entry, exit, expected vs actual; no re-POST',async()=>{
 const {env,db}=fixture(),prevFetch=globalThis.fetch,RealDate=globalThis.Date;
 const fixed=RealDate.parse('2026-11-04T16:20:00Z');
 globalThis.Date=class extends RealDate{constructor(...x){super(...(x.length?x:[fixed]));}static now(){return fixed;}};
 let brokerOrder=null,brokerPosts=0,telegramSends=0,step='new',requests=[];
 globalThis.fetch=async(input,opts={})=>{
  const url=String(input);requests.push({url,method:opts.method||'GET'});
  if(url.includes('api.telegram.org')){telegramSends++;return Response.json({ok:true});}
  if(url.endsWith('/clock'))return Response.json({is_open:true,next_close:'2026-11-04T16:00:00-05:00'});
  if(url.endsWith('/positions'))return Response.json([]);
  if(url.includes('/orders?status=open'))return Response.json([]);
  if(url.endsWith('/orders') && opts.method==='POST'){
   brokerPosts++;const payload=JSON.parse(opts.body);assert.equal(payload.side,'buy');
   assert.equal(payload.order_class,'bracket');assert.equal(payload.type,'limit');
   assert.ok(url.startsWith('https://paper-api.alpaca.markets/v2/'));
   brokerOrder={id:'123e4567-e89b-42d3-a456-426614174001',client_order_id:payload.client_order_id,symbol:payload.symbol,qty:payload.qty,status:'new',filled_qty:'0',filled_avg_price:null,legs:[]};
   return Response.json(brokerOrder);
  }
  if(url.includes('/orders/')||url.includes('/orders:by_client_order_id')){
   const payload={...brokerOrder};
   if(step==='opened')Object.assign(payload,{status:'filled',filled_qty:'49',filled_avg_price:'100.12',legs:[{side:'sell',group_role:'take_profit',filled_qty:'0'}]});
   if(step==='closed')Object.assign(payload,{status:'filled',filled_qty:'49',filled_avg_price:'100.12',legs:[{side:'sell',group_role:'take_profit',filled_qty:'49',filled_avg_price:'102.80'}]});
   return Response.json(payload);
  }
  throw new Error('Unexpected URL '+url);
 };
 try{
  db.prepare('UPDATE release_guard SET validated=1 WHERE id=1').run();
  await updateRuntime(env,true,'test');
  const outcomes=[{symbol:'AAPL',technical:technical(fixed)}];
  const first=await runPaperAutomation(env,{outcomes,account:makeAccount(),date:'2026-11-04'});
  assert.equal(first.placed.status,'SUBMITTED');assert.equal(brokerPosts,1);
  const submitted=db.prepare('SELECT * FROM paper_trades').get();assert.equal(submitted.symbol,'AAPL');
  assert.equal(submitted.order_status,'SUBMITTED');assert.equal(Number(submitted.qty),49);
  const again=await runPaperAutomation(env,{outcomes,account:makeAccount(),date:'2026-11-04'});
  assert.equal(brokerPosts,1); assert.equal(again.placed.status,'NO_SETUP');
  step='opened';await runPaperAutomation(env);
  let saved=db.prepare('SELECT * FROM paper_trades').get(); assert.equal(saved.order_status,'OPEN');
  assert.equal(saved.entry_filled_qty,49);assert.equal(saved.entry_avg_price,100.12);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM paper_trade_events WHERE kind='OPEN'").get().n,1);
  step='closed';await runPaperAutomation(env);
  saved=db.prepare('SELECT * FROM paper_trades').get();assert.equal(saved.order_status,'CLOSED');
  assert.equal(saved.exit_avg_price,102.8);
  assert.equal(saved.realized_pnl,131.32); // 49 x (102.80 - 100.12)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM paper_trade_events WHERE kind='CLOSE'").get().n,1);
  await runPaperAutomation(env);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM paper_trade_events WHERE kind='CLOSE'").get().n,1);
  assert.equal(brokerPosts,1);
  assert.ok(telegramSends>=3); // submitted, open, close
  assert.ok(requests.filter(x=>x.method==='POST'&&x.url.includes('alpaca')).every(x=>x.url==='https://paper-api.alpaca.markets/v2/orders'));
 }finally{globalThis.fetch=prevFetch;globalThis.Date=RealDate;}
});
test('inconsistent or partial fills trigger fail-closed pause',()=>{
 const rec={qty:10,entry_filled_qty:0,exit_filled_qty:0};
 assert.throws(()=>tradeEventChanges(rec,{filled_qty:'9',filled_avg_price:'100',legs:[{side:'sell',filled_qty:'10',filled_avg_price:'101'}]}),/eccedono/);
});

test('daily equity drawdown 1% blocks all Paper entries and permanently pauses until manual review',async()=>{
 const {env,db}=fixture();const prev=globalThis.fetch,RealDate=globalThis.Date;
 const fixed=RealDate.parse('2026-11-04T16:20:00Z');
 globalThis.Date=class extends RealDate{constructor(...v){super(...(v.length?v:[fixed]));}static now(){return fixed;}};
 let posts=0;
 globalThis.fetch=async(u,opts={})=>{
  if(String(u).includes('api.telegram.org'))return Response.json({ok:true});
  if(String(u).endsWith('/clock'))return Response.json({is_open:true,next_close:'2026-11-04T16:00:00-05:00'});
  if(opts.method==='POST')posts++;
  return Response.json([]);
 };
 try{
  db.prepare('UPDATE release_guard SET validated=1 WHERE id=1').run();
  await updateRuntime(env,true,'test');
  db.prepare('UPDATE paper_runtime SET day_key=?,day_start_equity=? WHERE id=1').run('2026-11-04',100000);
  const account=normalizePaperAccount({equity:'98900',cash:'98900',buying_power:'300000',currency:'USD',status:'ACTIVE'});
  const result=await runPaperAutomation(env,{outcomes:[{symbol:'AAPL',technical:technical(fixed)}],account,date:'2026-11-04'});
  assert.equal(result.placed.status,'HALTED');assert.equal(posts,0);
  assert.equal((await readRuntime(env)).enabled,false);
  assert.match((await readRuntime(env)).reason,/giornaliera/);
 }finally{globalThis.fetch=prev;globalThis.Date=RealDate;}
});

test('Telegram test endpoint requires same-origin authenticated session and no broker order',async()=>{
 const {env,db}=fixture();const cookie=await session(env),prev=globalThis.fetch;
 const urls=[];
 globalThis.fetch=async(url)=>{urls.push(String(url));return Response.json({ok:true})};
 try{
  const bad=await worker.fetch(new Request(origin+'/api/paper/telegram-test',{method:'POST',headers:{Cookie:cookie,Origin:'https://not-this-site.example'}}),env);
  assert.equal(bad.status,403);
  const r=await worker.fetch(new Request(origin+'/api/paper/telegram-test',{method:'POST',headers:{Cookie:cookie,Origin:origin}}),env);
  assert.equal(r.status,200);assert.equal((await r.json()).telegram.sent,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM paper_trade_events WHERE kind='TEST' AND delivery_state='SENT'").get().n,1);
  assert.ok(urls.every(u=>u.startsWith('https://api.telegram.org/bot')));
 }finally{globalThis.fetch=prev;}
});
