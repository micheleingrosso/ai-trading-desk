import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePaperAccount,paperBudget} from '../src/paper.js';
import {buildProposal} from '../src/proposals.js';
const example={equity:'100000',cash:'100000',buying_power:'400000',portfolio_value:'100000',status:'ACTIVE',currency:'USD',account_blocked:false};
const good={ok:true,source:'Alpaca IEX, 5Min, sessione regolare',barTs:'2026-11-04T15:50:00Z',close:100,ema20:99,sma50:97,rsi14:61,volumeRatio20:2.1,trend:'UP',breakout:true,bullFlagCandidate:false};
test('paper budget uses whole Alpaca equity and never buying power with leverage',()=>{
 const a=normalizePaperAccount(example);assert.equal(a.equity,100000);assert.equal(a.buyingPower,400000);
 assert.equal(a.cashNoLeverage,100000);const p=buildProposal(good,new Date('2026-11-04T16:00:00Z'),paperBudget(a));
 assert.equal(p.quantity,50);assert.equal(p.notional,5000);assert.equal(p.lossAtStop,75);
});
test('insufficient cash caps size regardless of equity',()=>{
 const a=normalizePaperAccount({...example,cash:'1250'});
 const p=buildProposal(good,new Date('2026-11-04T16:00:00Z'),paperBudget(a));
 assert.equal(p.quantity,12);assert.equal(p.notional,1200);
});
test('missing or blocked Alpaca balance must fail closed',()=>{
 for(const body of [{...example,equity:null},{...example,equity:'nan'},{...example,equity:'0'},null])
   assert.throws(()=>normalizePaperAccount(body));
 const blocked=normalizePaperAccount({...example,trading_blocked:true});assert.throws(()=>paperBudget(blocked));
 const inactive=normalizePaperAccount({...example,status:'REJECTED'});assert.throws(()=>paperBudget(inactive));
 const empty=normalizePaperAccount({...example,cash:'0'});assert.throws(()=>paperBudget(empty));
});
