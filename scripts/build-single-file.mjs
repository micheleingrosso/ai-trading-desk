import { readFileSync, writeFileSync } from 'node:fs';
const modules=['scout.js','auth.js','technical.js','news.js','alerts.js','proposals.js','paper.js','ui.js','index.js'];
let compiled='// AI Trading Desk 1.2.1 — single-file Cloudflare Worker. Auto-generated.\n';
for(const file of modules){
 let source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
 source=source.replace(/^import .* from .*;\s*$/gm,'');
 if(file!=='index.js')source=source.replace(/^export /gm,'');
 compiled+='\n// ---- '+file+' ----\n'+source+'\n';
}
writeFileSync(new URL('../worker-single-file.js',import.meta.url),compiled);
console.log('Generated worker-single-file.js');
