import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, {runScan} from '../src/index.js';

const sql = ['0001_init.sql','0002_technical_news.sql','0003_proposals.sql','0004_paper_snapshots.sql'].map(n=>readFileSync(new URL('../migrations/'+n, import.meta.url),'utf8')).join('\n');
function mockD1() {
  const database = new DatabaseSync(':memory:');
  database.exec(sql);
  const DB = {
    prepare(query) {
      let statement=database.prepare(query), args=[];
      const wrapper={
        bind(...newArgs){args=newArgs;return wrapper;},
        async first(){return statement.get(...args)??null;},
        async all(){return {results:statement.all(...args)};},
        async run(){return {meta:{changes:statement.run(...args).changes}};}
      };
      return wrapper;
    },
    async batch(statements){return Promise.all(statements.map(s=>s.run()));}
  };
  return {DB,database};
}
function env(DB) {return {DB, ALPACA_KEY_ID:'fake-paper-id',ALPACA_SECRET_KEY:'fake-paper-secret',DASHBOARD_PASSWORD:'another_fake_long_password_123',SESSION_SECRET:'a-long-integration-test-secret-0123456789-abcdefghijk'};}
const origin='https://example.workers.dev';
function request(path, options={}) {return new Request(origin+path,options);}

test('new deployment has watchlist, no signals, no orders; login is protected',async()=>{
 const {DB}=mockD1(), config=env(DB);
 const denied=await worker.fetch(request('/api/overview'),config);
 assert.equal(denied.status,401);
 const bad=await worker.fetch(request('/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:'password=wrong'}),config);
 assert.equal(bad.status,401);
 const good=await worker.fetch(request('/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:config.DASHBOARD_PASSWORD})}),config);
 assert.equal(good.status,303);
 const cookie=good.headers.get('set-cookie').split(';')[0];
 const overview=await worker.fetch(request('/api/overview',{headers:{Cookie:cookie}}),config);
 assert.equal(overview.status,200);
 const payload=await overview.json();
 assert.equal(payload.watchlist.length,10);
 assert.equal(payload.enabledCount,10);
 assert.equal(payload.signals.length,0);
 assert.equal(payload.orders,0);
 assert.equal(payload.virtualBalance,null);
 assert.equal(payload.paperAccount,null);
 const changed=await worker.fetch(request('/api/watchlist',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({symbol:'ORCL'})}),config);
 assert.equal(changed.status,200);
 const after=await worker.fetch(request('/api/overview',{headers:{Cookie:cookie}}),config);
 assert.equal((await after.json()).enabledCount,11);
});

test('market closed schedules a safe skip; no broker order request',async()=>{
 const {DB,database}=mockD1(), config=env(DB), oldFetch=globalThis.fetch;
 const requests=[];
 globalThis.fetch=async(input)=>{
  requests.push(String(input));
  return Response.json({is_open:false,next_open:'2026-11-05T09:30:00-05:00'});
 };
 try{
  const out=await runScan(config,'cron');
  assert.equal(out.status,'skipped');
  assert.equal(out.alerts_created,0);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM signals').get().n,0);
  assert.equal(database.prepare('SELECT status FROM scan_runs').get().status,'skipped');
  assert.ok(requests.includes('https://paper-api.alpaca.markets/v2/account'));
  assert.ok(requests.includes('https://paper-api.alpaca.markets/v2/clock'));
  assert.ok(requests.every(x=>!x.includes('/orders')));
 }finally{globalThis.fetch=oldFetch;}
});

test('open market checks 10 symbols using market-data API only',async()=>{
 const {DB,database}=mockD1(), config=env(DB), oldFetch=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async(input)=>{
  calls.push(String(input));
  if(String(input).endsWith('/clock'))return Response.json({is_open:true});
  if(String(input).endsWith('/account'))return Response.json({equity:'100000',cash:'100000',buying_power:'200000',status:'ACTIVE',currency:'USD'});
  if(String(input).includes('/v1beta1/news'))return Response.json({news:[]});
  return Response.json({bars:[],next_page_token:null});
 };
 try{
  const result=await runScan(config,'cron');
  assert.equal(result.status,'success');
  assert.equal(result.symbols_checked,10);
  assert.equal(result.alerts_created,0);
  assert.equal(calls.length,23);
  assert.ok(calls.filter(x=>x.includes('data.alpaca.markets/v2/stocks/')).length===20);
  assert.ok(calls.at(-1).includes('/v1beta1/news'));
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM news_items').get().n,0);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM signals').get().n,0);
 }finally{globalThis.fetch=oldFetch;}
});

// Running the 1.1 migration on an existing V1 database should never delete history.
test('migration v1.1 preserves v1 watchlist and old scan records',()=>{
 const database=new DatabaseSync(':memory:');
 database.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));
 database.prepare('INSERT INTO scan_runs(id,started_at,status,source) VALUES(?,?,?,?)').run('old','2026-11-04T12:00:00Z','skipped','manual');
 database.exec(readFileSync(new URL('../migrations/0002_technical_news.sql',import.meta.url),'utf8'));
 database.exec(readFileSync(new URL('../migrations/0002_technical_news.sql',import.meta.url),'utf8'));
 assert.equal(database.prepare('SELECT COUNT(*) AS n FROM watchlist').get().n,10);
 assert.equal(database.prepare('SELECT COUNT(*) AS n FROM scan_runs WHERE id=?').get('old').n,1);
});

test('end-to-end v1.1 saves RSI, breakout and sourced news without submitting orders',async()=>{
 const {DB,database}=mockD1(),config=env(DB), oldFetch=globalThis.fetch,oldDate=globalThis.Date;
 const fixed='2026-07-20T15:08:00.000Z', fixedMs=oldDate.parse(fixed);
 globalThis.Date=class extends oldDate {
   constructor(...args){ super(...(args.length?args:[fixedMs])); }
   static now(){return fixedMs;}
 };
 const bars5=[];
 for(const day of ['2026-07-17','2026-07-20']){
   const count=day==='2026-07-17'?78:19;
   for(let i=0;i<count;i++){
     const t=new oldDate(oldDate.parse(day+'T13:30:00Z')+i*300_000).toISOString();
     bars5.push({t,o:100,h:100,l:100,c:100,v:300});
   }
 }
 const bar15=[{t:'2026-07-20T14:00:00Z',o:100,h:100,l:100,c:100,v:200},
              {t:'2026-07-20T15:00:00Z',o:100,h:100,l:100,c:100,v:200}];
 const urls=[];
 globalThis.fetch=async(input)=>{
   const u=String(input);urls.push(u);
   if(u.endsWith('/clock'))return Response.json({is_open:true});
   if(u.endsWith('/account'))return Response.json({equity:'100000',cash:'100000',buying_power:'200000',status:'ACTIVE',currency:'USD'});
   if(u.includes('/v1beta1/news'))return Response.json({news:[{
     id:123,headline:'Earnings report published',source:'financial-wire',
     created_at:fixed,url:'https://example.org/news',symbols:['AAPL']
   }]});
   if(u.includes('timeframe=5Min')){
     const copy=bars5.map(b=>({...b}));
     if(u.includes('/AAPL/'))Object.assign(copy.at(-1),{o:104,h:106,l:103,c:105,v:2500});
     return Response.json({bars:copy});
   }
   return Response.json({bars:bar15});
 };
 try{
   const result=await runScan(config,'manual');
   assert.equal(result.status,'success');
   assert.equal(result.symbols_checked,10);
   assert.equal(database.prepare('SELECT COUNT(*) AS n FROM technical_snapshots').get().n,10);
   assert.ok(database.prepare('SELECT COUNT(*) AS n FROM technical_events').get().n>=1);
   assert.equal(database.prepare('SELECT COUNT(*) AS n FROM news_items').get().n,1);
   assert.ok(urls.every(x=>!x.includes('/orders')));
   const repeat=await runScan(config,'manual');
   assert.equal(repeat.status,'success');
   assert.equal(database.prepare('SELECT COUNT(*) AS n FROM news_items').get().n,1);
 }finally{globalThis.fetch=oldFetch;globalThis.Date=oldDate;}
});
