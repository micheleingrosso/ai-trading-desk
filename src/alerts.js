// Optional one-way Telegram notifications, never includes credentials or trading actions.
export function telegramText(events){
  const lines=['📊 AI Trading Desk · Scout 1.1','Nuovi eventi tecnici (IEX, solo informativi):'];
  for(const event of events.slice(0,6))lines.push(`• ${event.symbol} · ${event.kind} · ${event.close.toFixed(2)} USD`);
  lines.push('Analisi automatica, non è un suggerimento d’acquisto. Consulta la dashboard.');
  return lines.join('\n');
}
export async function sendTelegram(env, events, sender=fetch) {
  if(!events.length)return {status:'none'};
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return {status:'disabled'};
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),7000);
  try {
    const res=await sender(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:telegramText(events),disable_web_page_preview:true}),
      signal:controller.signal
    });
    if(!res.ok)throw new Error(`Telegram HTTP ${res.status}`);
    return {status:'sent'};
  }catch(e){return {status:'error',detail:String(e?.message||e).slice(0,100)};}
  finally{clearTimeout(timeout);}
}
