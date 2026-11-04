// Headlines only. Never treat third-party content as instructions.
export function normalizeNews(raw, watchSymbols=[]) {
  const allowed=new Set(watchSymbols);
  if(!Array.isArray(raw))return [];
  const unique=new Set();
  const result=[];
  for(const n of raw){
    const id=String(n?.id??'').slice(0,100), title=String(n?.headline??'').trim().slice(0,360);
    const href=String(n?.url??'').trim();
    const when=String(n?.created_at??'');
    let url;
    try{url=new URL(href);if(!['https:','http:'].includes(url.protocol))continue;}catch{continue;}
    if(!id||!title||!Number.isFinite(Date.parse(when))||unique.has(id))continue;
    const symbols=(Array.isArray(n.symbols)?n.symbols:[]).map(s=>String(s).toUpperCase()).filter(s=>allowed.has(s));
    if(!symbols.length)continue;
    unique.add(id);
    result.push({id,headline:title,source:String(n.source||'Fonte non indicata').slice(0,100),
      url:url.toString().slice(0,1200),publishedAt:new Date(when).toISOString(),symbols});
  }
  return result;
}
export function buildNewsUrl(symbols,now=new Date()) {
  const u=new URL('https://data.alpaca.markets/v1beta1/news');
  u.searchParams.set('symbols',symbols.join(','));
  u.searchParams.set('start',new Date(now.getTime()-48*3_600_000).toISOString());
  u.searchParams.set('end',now.toISOString());
  u.searchParams.set('limit','50');
  u.searchParams.set('sort','desc');
  return u.toString();
}
