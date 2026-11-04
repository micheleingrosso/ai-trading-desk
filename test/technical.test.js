import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTechnical, rsi, ema, sma } from '../src/technical.js';

const bar=(t,close,volume=300)=>({t,o:close,h:close,l:close,c:close,v:volume});
function sample({breakout=false}={}){
 const rows=[];
 for(const day of ['2026-07-17','2026-07-20']){
   const last=day==='2026-07-17'?77:18;
   for(let i=0;i<=last;i++){
      const ts=Date.parse(day+'T13:30:00Z')+i*300_000;
      rows.push(bar(new Date(ts).toISOString(),100,300));
   }
 }
 if(breakout){
   const last=rows.at(-1);last.o=104;last.h=106;last.l=103;last.c=105;last.v=2500;
 }
 return rows;
}
const now=new Date('2026-07-20T15:08:00Z');
test('indicator functions handle normal and flat data',()=>{
 assert.equal(rsi(Array.from({length:70},()=>100)),50);
 assert.equal(sma(Array.from({length:50},(_,i)=>i+1),50),25.5);
 assert.equal(ema([1,2,3,4,5],3)?.toFixed(2),'4.00');
 assert.equal(rsi([1,2,3]),null);
});
test('calculates technical snapshot from settled 5 minute bars',()=>{
 const out=calculateTechnical(sample(),now);
 assert.equal(out.ok,true);
 assert.equal(out.rsi14,50);
 assert.equal(out.trend,'NEUTRAL');
 assert.equal(out.breakout,false);
 assert.deepEqual(out.events,[]);
});
test('identifies breakout with volume, not merely price movement',()=>{
 const out=calculateTechnical(sample({breakout:true}),now);
 assert.equal(out.ok,true);
 assert.equal(out.breakout,true);
 assert.ok(out.events.some(e=>e.kind==='BREAKOUT_20'));
 assert.ok(out.volumeRatio20>8);
});
test('rejects insufficient and stale bars, avoiding false alerts',()=>{
 assert.equal(calculateTechnical(sample().slice(-20),now).ok,false);
 assert.equal(calculateTechnical(sample(),new Date('2026-07-21T15:08:00Z')).ok,false);
});
test('excludes unsettled 5 minute candle',()=>{
 const rows=sample();
 rows.push({t:'2026-07-20T15:05:00Z',o:120,h:125,l:110,c:125,v:10000});
 const out=calculateTechnical(rows,now);
 assert.equal(out.close,100);
});
