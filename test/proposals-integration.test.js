import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{runScan} from '../src/index.js';
const migrations=['0001_init.sql','0002_technical_news.sql','0003_proposals.sql'];
function createDB(){
 const raw=new DatabaseSync(':memory:');
 for(const m of migrations)raw.exec(readFileSync(new URL('../migrations/'+m,import.meta.url),'utf8'));
 const DB={prepare(sql){let stmt=raw.prepare(sql),args=[];
  const obj={bind(...x){args=x;return obj},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){return {meta:{changes:stmt.run(...args).changes}}}};
  return obj;},async batch(stmts){const out=[];for(const s of stmts)out.push(await s.run());return out;}};
 return {raw,DB};
}
function config(DB){return {DB,ALPACA_KEY_ID:'fake',ALPACA_SECRET_KEY:'fake',DASHBOARD_PASSWORD:'this-is-a-test-password',SESSION_SECRET:'a-long-integration-test-secret-0123456789-abcdefghijk'}};
const origin='https://ai-trading-desk.example.workers.dev';
async function login(env){const r=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:env.DASHBOARD_PASSWORD})}),env);assert.equal(r.status,303);return r.headers.get('set-cookie').split(';')[0];}
function req(path,opts={}){return new Request(origin+path,opts);}
test('migration 0003 is additive and repeatable on existing 1.1 records',()=>{
 const raw=new DatabaseSync(':memory:');
 for(const m of migrations.slice(0,2))raw.exec(readFileSync(new URL('../migrations/'+m,import.meta.url),'utf8'));
 raw.prepare("INSERT INTO scan_runs(id,started_at,status,source) VALUES('prior','2026-11-04T12:00:00Z','success','manual')").run();
 const sql=readFileSync(new URL('../migrations/0003_proposals.sql',import.meta.url),'utf8');raw.exec(sql);raw.exec(sql);
 assert.equal(raw.prepare("SELECT COUNT(*) n FROM scan_runs WHERE id='prior'").get().n,1);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM watchlist').get().n,10);
});
test('archive endpoint requires session and same origin, never triggers network or orders',async()=>{
 const {raw,DB}=createDB(),env=config(DB);
 const id='123e4567-e89b-42d3-a456-426614174000';
 raw.prepare(`INSERT INTO trade_proposals
 (id,symbol,bar_ts,trade_date,source_event,entry_price,stop_price,target_price,
 shares,notional,loss_at_stop,reward_risk,rationale,cautions_json,technical_json,
 skeptic_mode,skeptic_verdict,skeptic_reasons_json,status,created_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,'AAPL','2026-11-04T15:50:00Z','2026-11-04','BREAKOUT_20',100,98.5,103,5,500,7.5,2,'test','[]','{}','RULES_ONLY','WAIT','[]','WAIT','2026-11-04T15:55:00Z');
 const path='/api/proposals/'+id+'/archive';
 const body=JSON.stringify({action:'archive'});
 const unauthorized=await worker.fetch(req(path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body}),env);
 assert.equal(unauthorized.status,401);
 const cookie=await login(env);
 const denied=await worker.fetch(req(path,{method:'POST',headers:{Cookie:cookie,Origin:'https://evil.example','Content-Type':'application/json'},body}),env);
 assert.equal(denied.status,403);
 const badAction=await worker.fetch(req(path,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'BUY'})}),env);
 assert.equal(badAction.status,400);
 const good=await worker.fetch(req(path,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body}),env);
 assert.equal(good.status,200);
 assert.equal(raw.prepare('SELECT status FROM trade_proposals WHERE id=?').get(id).status,'ARCHIVED');
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM proposal_audit').get().n,1);
 assert.equal(raw.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='orders'").get().n,0);
 const overview=await worker.fetch(req('/api/overview',{headers:{Cookie:cookie}}),env);
 assert.equal(overview.status,200);const payload=await overview.json();
 assert.equal(payload.proposals[0].status,'ARCHIVED');
 assert.equal(payload.positions,0);assert.equal(payload.orders,0);
});
test('market-open scanner creates a single fresh information proposal, never an order',async()=>{
 const {raw,DB}=createDB(),env=config(DB),oldFetch=globalThis.fetch,RealDate=globalThis.Date;
 const timestamp='2026-07-20T15:08:00Z',fixed=RealDate.parse(timestamp),urls=[];
 globalThis.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
 const bars5=[];
 for(const day of ['2026-07-17','2026-07-20']){
  const count=day.endsWith('17')?78:19;
  for(let i=0;i<count;i++){
   const idx=bars5.length;
   const close=98+idx*0.025+0.4*Math.sin(idx*1.8);
   const t=new RealDate(RealDate.parse(day+'T13:30:00Z')+i*300000).toISOString();
   bars5.push({t,o:close,h:close+0.05,l:close-0.05,c:close,v:300});
  }
 }
 // Last completed candle: bullish breakout, RSI ~61, relative volume 10x.
 globalThis.fetch=async(input)=>{
  const u=String(input);urls.push(u);
  if(u.endsWith('/clock'))return Response.json({is_open:true});
  if(u.includes('/v1beta1/news'))return Response.json({news:[]});
  if(u.includes('timeframe=5Min')){const data=bars5.map(x=>({...x}));if(u.includes('/AAPL/')){const b=data.at(-1);b.c+=1;b.o=b.c-0.1;b.h=b.c+0.07;b.l=b.c-0.2;b.v=3000;}return Response.json({bars:data});}
  return Response.json({bars:[]});
 };
 try{
  const out=await runScan(env,'manual');assert.equal(out.status,'success');
  const count=raw.prepare('SELECT COUNT(*) n FROM trade_proposals').get().n;
  assert.equal(count,1);
  const record=raw.prepare('SELECT * FROM trade_proposals').get();
  assert.equal(record.symbol,'AAPL');assert.equal(record.skeptic_mode,'RULES_ONLY');
  assert.equal(record.skeptic_verdict,'WAIT');
  assert.equal(record.status,'WAIT');
  assert.ok(record.notional<=500&&record.loss_at_stop<=25);
  assert.ok(urls.every(url=>!url.includes('/orders')&&!url.includes('api.alpaca.markets/v2/orders')));
  const repeat=await runScan(env,'manual');assert.equal(repeat.status,'success');
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM trade_proposals').get().n,count);
 }finally{globalThis.fetch=oldFetch;globalThis.Date=RealDate;}
});
