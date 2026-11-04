// AI Trading Desk v1.1 — deterministic analysis, not a trading recommendation.
// Alpaca 5Min bars start at their timestamp; use only settled regular-session bars.
import { partsNY } from './scout.js';

export const TECH_CONFIG = Object.freeze({
  timeframeMinutes: 5, settleSeconds: 60, maxAgeMinutes: 22,
  rsiPeriod: 14, emaPeriod: 20, smaPeriod: 50,
  breakoutLookback: 20, breakoutVolumeMultiple: 1.4,
  flagImpulsePct: 2.5, flagMaxRetracementPct: 2.0,
  eventCooldownMinutes: 60, maxEventsPerDay: 6
});

export function ema(values, period) {
  if (values.length < period || !values.slice(0,period).every(Number.isFinite)) return null;
  let result = values.slice(0, period).reduce((a,b)=>a+b,0)/period;
  const alpha=2/(period+1);
  for(let i=period;i<values.length;i++) {
    if(!Number.isFinite(values[i]))return null;
    result = alpha * values[i] + (1-alpha)*result;
  }
  return result;
}
export function sma(values, period) {
  if(values.length<period)return null;
  const sample=values.slice(-period);
  return sample.every(Number.isFinite)?sample.reduce((a,b)=>a+b,0)/period:null;
}
// Wilder RSI: average gains and losses are Wilder-smoothed.
export function rsi(values, period=14) {
  if(values.length<period+1 || values.some(v=>!Number.isFinite(v) || v<=0))return null;
  let gain=0,loss=0;
  for(let i=1;i<=period;i++){let d=values[i]-values[i-1];gain+=Math.max(0,d);loss+=Math.max(0,-d);}
  gain/=period;loss/=period;
  for(let i=period+1;i<values.length;i++) {
    const d=values[i]-values[i-1];gain=(gain*(period-1)+Math.max(0,d))/period;
    loss=(loss*(period-1)+Math.max(0,-d))/period;
  }
  if(loss===0)return gain===0?50:100;
  return 100-100/(1+gain/loss);
}

const round=(n,d=2)=>n==null?null:Number(n.toFixed(d));
export function calculateTechnical(rawBars, now=new Date(), cache=new Map()) {
  const time=now.getTime();
  const valid=(Array.isArray(rawBars)?rawBars:[]).filter(b=>
    Number.isFinite(Date.parse(b.t)) && Number.isFinite(b.o) && Number.isFinite(b.h) &&
    Number.isFinite(b.l) && Number.isFinite(b.c) && Number.isFinite(b.v) &&
    b.o>0 && b.h>=Math.max(b.o,b.c) && b.l<=Math.min(b.o,b.c) && b.c>0 && b.v>=0 &&
    partsNY(b.t,cache).regular &&
    Date.parse(b.t)+(TECH_CONFIG.timeframeMinutes*60+TECH_CONFIG.settleSeconds)*1000<=time
  ).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t));
  if(valid.length<TECH_CONFIG.smaPeriod+1)return {ok:false,reason:'Barre 5m insufficienti per SMA50 e RSI14'};
  const latest=valid.at(-1), currentDay=partsNY(now.toISOString(),cache).date;
  const barDay=partsNY(latest.t,cache).date;
  const ageMin=(time-(Date.parse(latest.t)+TECH_CONFIG.timeframeMinutes*60_000))/60_000;
  if(barDay!==currentDay || ageMin>TECH_CONFIG.maxAgeMinutes)return {ok:false,reason:'Barra 5m non recente: nessun evento',barTs:latest.t};
  const closes=valid.map(b=>b.c), volumes=valid.map(b=>b.v);
  const e20=ema(closes,TECH_CONFIG.emaPeriod), s50=sma(closes,TECH_CONFIG.smaPeriod);
  const r14=rsi(closes,TECH_CONFIG.rsiPeriod);
  const prev=valid.slice(-TECH_CONFIG.breakoutLookback-1,-1);
  const high20=Math.max(...prev.map(b=>b.h));
  const volAvg=prev.reduce((s,b)=>s+b.v,0)/prev.length;
  const volRatio=volAvg>0?latest.v/volAvg:null;
  const strongVolume=latest.v>=100 && volRatio!==null && volRatio>=TECH_CONFIG.breakoutVolumeMultiple;
  const breakout=latest.c>high20 && strongVolume && latest.c>e20;
  const uptrend=latest.c>e20 && e20>s50;
  // Heuristic only: strong rise, 3-8 narrow pullback bars, then reclaim prior close.
  // No pattern detection model; not a confirmed chart formation.
  let bullFlagCandidate=false;
  for(let k=3;k<=8 && !bullFlagCandidate;k++) {
    if(valid.length<k+13)continue;
    const start=valid.at(-k-13), end=valid.at(-k-2);
    const impulsePct=(end.c/start.c-1)*100;
    const pullback=valid.slice(-k-1,-1);
    const peak=Math.max(end.h,...pullback.map(b=>b.h));
    const low=Math.min(...pullback.map(b=>b.l));
    const depth=(peak-low)/peak*100;
    const declining=pullback.at(-1).c<=pullback[0].c;
    const reclaim=latest.c>pullback.at(-1).h && latest.c>e20;
    if(impulsePct>=TECH_CONFIG.flagImpulsePct && depth<=TECH_CONFIG.flagMaxRetracementPct &&
        declining && reclaim && strongVolume && uptrend)bullFlagCandidate=true;
  }
  const events=[];
  if(breakout)events.push({kind:'BREAKOUT_20',description:'Chiusura oltre massimo delle 20 barre precedenti con volume relativo elevato'});
  if(bullFlagCandidate)events.push({kind:'BULL_FLAG_CANDIDATE',description:'Possibile consolidamento dopo un impulso rialzista (euristica da verificare)'});
  if(r14>=70)events.push({kind:'RSI_HIGH',description:'RSI14 elevato: può indicare forza o ipercomprato, non necessariamente inversione'});
  if(r14<=30)events.push({kind:'RSI_LOW',description:'RSI14 basso: può indicare debolezza o ipervenduto, non necessariamente inversione'});
  return {
    ok:true,barTs:latest.t,close:latest.c,volume:latest.v,
    rsi14:round(r14),ema20:round(e20,4),sma50:round(s50,4),
    high20:round(high20,4),volumeRatio20:round(volRatio),
    trend:uptrend?'UP':latest.c<s50?'DOWN':'NEUTRAL',
    breakout,bullFlagCandidate,events,ageMinutes:round(ageMin,1),
    source:'Alpaca IEX, 5Min, sessione regolare'
  };
}
