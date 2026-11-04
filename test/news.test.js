import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNews, buildNewsUrl } from '../src/news.js';
import { telegramText, sendTelegram } from '../src/alerts.js';

test('news ingestion deduplicates, filters symbols and unsafe links',()=>{
 const input=[
   {id:1,headline:'News A',source:'provider',created_at:'2026-11-04T12:00:00Z',url:'https://example.org/a',symbols:['AAPL','OTHER']},
   {id:1,headline:'Dup',created_at:'2026-11-04T12:00:00Z',url:'https://example.org/a',symbols:['AAPL']},
   {id:2,headline:'Injected',created_at:'2026-11-04T12:00:00Z',url:'javascript:alert(1)',symbols:['AAPL']},
   {id:3,headline:'Other',created_at:'2026-11-04T12:00:00Z',url:'https://example.org/z',symbols:['TSLA']},
 ];
 const out=normalizeNews(input,['AAPL']);
 assert.equal(out.length,1);
 assert.deepEqual(out[0].symbols,['AAPL']);
 const url=new URL(buildNewsUrl(['AAPL','MSFT'],new Date('2026-11-04T12:00:00Z')));
 assert.equal(url.searchParams.get('limit'),'50');
 assert.equal(url.searchParams.get('symbols'),'AAPL,MSFT');
});
test('Telegram is optional and only sends on new events',async()=>{
 assert.match(telegramText([{symbol:'AAPL',kind:'BREAKOUT_20',close:120}]), /AAPL/);
 const off=await sendTelegram({},[{symbol:'AAPL',kind:'RSI_HIGH',close:100}],()=>{throw Error('should not call')});
 assert.equal(off.status,'disabled');
 const none=await sendTelegram({TELEGRAM_BOT_TOKEN:'test',TELEGRAM_CHAT_ID:'test'},[],()=>{throw Error('should not call')});
 assert.equal(none.status,'none');
});
