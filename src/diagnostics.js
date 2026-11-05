// Lightweight, bounded trading-signal diagnostics (no order actions).
import { buildProposal } from './proposals.js';
export function explainSignal(outcome, now=new Date(), budget=null){
  if(outcome.error)return {status:'DATA_ERROR',reason:outcome.error};
  const t=outcome.technical;
  if(!t?.ok)return {status:'NOT_READY',reason:t?.reason||'Indicatori incompleti'};
  if(!t.breakout&&!t.bullFlagCandidate)return {status:'NO_PATTERN',reason:'Nessun breakout 20 barre o bull flag'};
  const proposal=buildProposal(t,now,budget);
  if(!proposal.ok)return {status:'FILTERED',reason:proposal.reason};
  return {status:'SETUP_READY',reason:'Regole tecniche e budget superati; servono ancora Skeptic e controlli Alpaca'};
}
export async function saveSignalDiagnostics(env,outcomes,now,budget){
  for(const o of outcomes){
    const d=explainSignal(o,now,budget);
    const t=o.technical;
    await env.DB.prepare(`INSERT INTO scanner_diagnostics(symbol,bar_ts,status,reason,rsi14,volume_ratio,orb_high,orb_confirmed,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET
      bar_ts=excluded.bar_ts,status=excluded.status,reason=excluded.reason,
      rsi14=excluded.rsi14,volume_ratio=excluded.volume_ratio,orb_high=excluded.orb_high,
      orb_confirmed=excluded.orb_confirmed,updated_at=excluded.updated_at
      WHERE COALESCE(scanner_diagnostics.bar_ts,'')<>COALESCE(excluded.bar_ts,'') OR scanner_diagnostics.status<>excluded.status OR scanner_diagnostics.reason<>excluded.reason`)
      .bind(o.symbol,t?.barTs||null,d.status,d.reason,t?.rsi14??null,t?.volumeRatio20??null,t?.orb15?.rangeHigh??null,t?.orb15?.confirmed?1:0,now.toISOString()).run();
  }
}
