import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { dashboardHtml, appJs, appCss } from '../src/ui.js';
import singleWorker from '../worker-single-file.js';

test('browser JavaScript parses and all referenced dashboard IDs exist',()=>{
 assert.doesNotThrow(()=>new Script(appJs));
 const ids=new Set([...dashboardHtml.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
 const accesses=[...appJs.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
 assert.deepEqual(accesses.filter(id=>!ids.has(id)),[]);
 assert.ok(ids.has('technical-body'));
 assert.ok(ids.has('news-list'));
 assert.ok(appJs.includes('\\d{4}')); // checks local time regex survives template parsing
 assert.ok(appCss.includes('.news-grid'));
});
test('standalone Cloudflare Worker bundle exposes fetch and scheduled',()=>{
 assert.equal(typeof singleWorker.fetch,'function');
 assert.equal(typeof singleWorker.scheduled,'function');
});
