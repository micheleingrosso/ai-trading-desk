// 1.2.1 — Read-only Alpaca Paper account normalization (never place orders).
const strictNumber=(v,field)=>{
  if(v===null || v===undefined || String(v).trim()==='') throw new Error(`Alpaca: ${field} assente`);
  const n=Number(v);
  if(!Number.isFinite(n))throw new Error(`Alpaca: ${field} non numerico`);
  return n;
};
export function normalizePaperAccount(data){
  if(!data || typeof data!=='object' || Array.isArray(data))throw new Error('Risposta account Alpaca non valida');
  const equity=strictNumber(data.equity,'equity');
  const cash=strictNumber(data.cash,'cash');
  const buyingPower=strictNumber(data.buying_power,'buying_power');
  const previousEquity=(data.last_equity==null?null:strictNumber(data.last_equity,'last_equity'));
  if(equity<=0 || equity>1e12)throw new Error('Equity Paper non valida');
  if(data.currency && data.currency!=='USD')throw new Error('Valuta Alpaca inattesa');
  const blocked=Boolean(data.account_blocked || data.trading_blocked || data.trade_suspended_by_user);
  // Do not use margin buying power.  A positive cash figure alone is not permission to trade:
  // proposed order execution will independently revalidate live account and open orders.
  const cashNoLeverage=Math.max(0,Math.min(cash,equity));
  const status=String(data.status||'UNKNOWN');
  return {
    connected:true,source:'ALPACA_PAPER',currency:'USD',equity,cash,buyingPower,
    cashNoLeverage,previousEquity,portfolioValue:data.portfolio_value==null?equity:strictNumber(data.portfolio_value,'portfolio_value'),
    longMarketValue:Math.max(0,Number(data.long_market_value||0)),
    status,blocked,
    // This is not a live-trading readiness flag; this version is read-only.
    eligibleForInformationalSizing:!blocked && cashNoLeverage>0 && ['ACTIVE','PAPER_ONLY'].includes(status)
  };
}
export function paperBudget(account){
  if(!account?.connected || !account.eligibleForInformationalSizing)throw new Error('Conto Paper non idoneo al dimensionamento');
  const equity=Number(account.equity),cash=Number(account.cashNoLeverage);
  if(!(equity>0) || !(cash>0) || !Number.isFinite(equity)||!Number.isFinite(cash))throw new Error('Equity/cash non valida');
  return {equity,cashNoLeverage:Math.min(cash,equity)};
}
