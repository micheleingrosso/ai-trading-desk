import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{runScan} from '../src/index.js';
const migrationNames=['0001_init.sql','0002_technical_news.sql','0003_proposals.sql','0004_paper_snapshots.sql','0005_paper_execution.sql'];
function fixture(){
  const raw=new DatabaseSync(':memory:');
  for(const filename of migrationNames)raw.exec(readFileSync(new URL('../migrations/'+filename,import.meta.url),'utf8'));
  const DB={prepare(sql){let stmt=raw.prepare(sql),a=[];const p={bind(...args){a=args;return p;},async first(){return stmt.get(...a)||null},async all(){return {results:stmt.all(...a)}},async run(){return {meta:{changes:stmt.run(...a).changes}}}};return p;},
    async batch(stmts){return Promise.all(stmts.map(s=>s.run()));}};
  const env={DB,ALPACA_KEY_ID:'fake-paper-id',ALPACA_SECRET_KEY:'fake-paper-secret',DASHBOARD_PASSWORD:'fake-long-pw-11111111',SESSION_SECRET:'very-long-session-secret-to-test-000000000000000'};
  return {raw,DB,env};
}
async function session(env){const origin='https://paper-test.example.workers.dev';const r=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:env.DASHBOARD_PASSWORD})}),env);assert.equal(r.status,303);return r.headers.get('set-cookie').split(';')[0];}
test('paper account snapshots are additive and migration repeatable',()=>{
 const raw=new DatabaseSync(':memory:');
 for(const name of migrationNames.slice(0,3))raw.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 raw.prepare("INSERT INTO scan_runs(id,started_at,status,source) VALUES('before','2026-11-04T12:00:00Z','success','manual')").run();
 const migration=readFileSync(new URL('../migrations/0004_paper_snapshots.sql',import.meta.url),'utf8');raw.exec(migration);raw.exec(migration);
 assert.equal(raw.prepare("SELECT COUNT(*) n FROM scan_runs WHERE id='before'").get().n,1);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM watchlist').get().n,10);
 assert.equal(raw.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='paper_account_snapshots'").get().n,1);
});
test('reads current 100k paper account and saves snapshot even if market closed; never orders',async()=>{
 const {raw,env}=fixture(),prev=globalThis.fetch,urls=[];
 globalThis.fetch=async input=>{
  const u=String(input);urls.push(u);
  if(u.endsWith('/account'))return Response.json({equity:'100000',cash:'95000',buying_power:'400000',status:'ACTIVE',currency:'USD',last_equity:'99000'});
  if(u.endsWith('/clock'))return Response.json({is_open:false,next_open:'2026-11-05T09:30:00-05:00'});
  throw new Error('Unexpected endpoint '+u);
 };
 try{
  const result=await runScan(env,'manual');assert.equal(result.status,'skipped');
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM paper_account_snapshots').get().n,1);
  const cookie=await session(env);
  const res=await worker.fetch(new Request('https://paper-test.example.workers.dev/api/overview',{headers:{Cookie:cookie}}),env);
  assert.equal(res.status,200);const body=await res.json();
  assert.equal(body.paperAccount.equity,100000);
  assert.equal(body.paperAccount.cash,95000);
  assert.equal(body.paperAccount.buyingPower,400000);
  assert.equal(body.paperSizing.maxNotional,5000);
  assert.equal(body.paperSizing.maxRisk,250);
  assert.equal(body.virtualBalance,100000);
  assert.equal(body.paperBalanceChange,0);
  assert.ok(urls.every(u=>u.startsWith('https://paper-api.alpaca.markets/v2/')));
  assert.ok(urls.every(u=>!u.includes('/orders')&&!u.includes('api.alpaca.markets/v2/orders')));
 } finally{globalThis.fetch=prev;}
});
test('API unavailable means no fake paper capital and no generated proposals',async()=>{
 const {env}=fixture(),previous=globalThis.fetch;
 globalThis.fetch=async input=>String(input).endsWith('/clock')?Response.json({is_open:false}):new Response('service unavailable',{status:503});
 try{
  const out=await runScan(env,'manual');assert.equal(out.status,'skipped');
  const cookie=await session(env);
  const res=await worker.fetch(new Request('https://paper-test.example.workers.dev/api/overview',{headers:{Cookie:cookie}}),env);
  const data=await res.json();assert.equal(data.virtualBalance,null);assert.equal(data.paperSizing,null);
  assert.equal(data.paperAccount,null);assert.ok(data.paperAccountError);
 }finally{globalThis.fetch=previous;}
});
