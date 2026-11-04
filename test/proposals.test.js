import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProposal,skepticReview,PROPOSAL_RULES} from '../src/proposals.js';
const now=new Date('2026-11-04T16:00:00Z');
const good={ok:true,source:'Alpaca IEX, 5Min, sessione regolare',barTs:'2026-11-04T15:50:00Z',
 close:100,ema20:99,sma50:97,rsi14:61,volumeRatio20:2.1,trend:'UP',breakout:true,bullFlagCandidate:false};
test('proposal is long-only, capped to 5% notional and 0.25% risk, and 2R exit',()=>{
 const p=buildProposal(good,now);
 assert.equal(p.ok,true);
 assert.equal(p.sourceEvent,'BREAKOUT_20');
 assert.equal(p.entry,100);
 assert.equal(p.stop,98.5);
 assert.equal(p.target,103);
 assert.equal(p.quantity,5);
 assert.equal(p.notional,500);
 assert.equal(p.lossAtStop,7.5);
 assert.ok(p.lossAtStop<=PROPOSAL_RULES.referenceCapital*PROPOSAL_RULES.maxLossFraction);
});
test('no proposal from stale bars, missing metrics, unexpected source or invalid patterns',()=>{
 for(const changed of [
   {barTs:'2026-11-04T15:20:00Z'}, {source:'unknown'}, {rsi14:90},
   {ema20:null},{breakout:false,bullFlagCandidate:false}, {trend:'DOWN'}, {volumeRatio20:1},
   {close:5001}, {close:0}, {barTs:'not-a-date'}
 ])assert.equal(buildProposal({...good,...changed},now).ok,false,JSON.stringify(changed));
});
test('risk sizing refuses unaffordable share when stop-adjusted risk or notional too large',()=>{
 const p=buildProposal({...good,close:600,ema20:590,sma50:580},now);
 assert.equal(p.ok,false);
});
test('AI absent or failing: Skeptic blocks progression with WAIT',async()=>{
 const p=buildProposal(good,now);
 assert.deepEqual((await skepticReview({},'AAPL',p)).verdict,'WAIT');
 const errorAI={AI:{run:async()=>{throw Error('unavailable')}}};
 assert.equal((await skepticReview(errorAI,'AAPL',p)).mode,'AI_UNAVAILABLE');
});
test('AI replies can only be WAIT or SKIP, never BUY or APPROVE',async()=>{
 const p=buildProposal(good,now);
 const reasons=['Risk of gaps after market news','Incomplete IEX venue coverage','Current trend may reverse'];
 const stub=x=>({AI:{run:async()=>({response:JSON.stringify(x)})}});
 assert.equal((await skepticReview(stub({verdict:'SKIP',reasons}),'AAPL',p)).verdict,'SKIP');
 assert.equal((await skepticReview(stub({verdict:'BUY',reasons}),'AAPL',p)).verdict,'WAIT');
 assert.equal((await skepticReview(stub({verdict:'APPROVE',reasons}),'AAPL',p)).mode,'AI_UNAVAILABLE');
});
