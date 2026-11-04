import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, {runScan} from '../src/index.js';

const sql = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url),'utf8');
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
 assert.equal(payload.virtualBalance,10000);
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
  assert.deepEqual(requests,['https://paper-api.alpaca.markets/v2/clock']);
 }finally{globalThis.fetch=oldFetch;}
});

test('open market checks 10 symbols using market-data API only',async()=>{
 const {DB,database}=mockD1(), config=env(DB), oldFetch=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async(input)=>{
  calls.push(String(input));
  if(String(input).endsWith('/clock'))return Response.json({is_open:true});
  return Response.json({bars:[],next_page_token:null});
 };
 try{
  const result=await runScan(config,'cron');
  assert.equal(result.status,'success');
  assert.equal(result.symbols_checked,10);
  assert.equal(result.alerts_created,0);
  assert.equal(calls.length,11);
  assert.ok(calls.slice(1).every(x=>x.includes('data.alpaca.markets/v2/stocks/')&&x.includes('feed=iex')));
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM signals').get().n,0);
 }finally{globalThis.fetch=oldFetch;}
});
