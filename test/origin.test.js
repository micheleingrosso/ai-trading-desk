import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameOrigin } from '../src/auth.js';
import { loginHtml } from '../src/ui.js';
import worker from '../src/index.js';
const site = 'https://ai-trading-desk.example.workers.dev';
const make = headers => new Request(site + '/login', {method: 'POST', headers, body: 'password=any'});

test('accepts ordinary same-origin login', () => {
  assert.equal(isSameOrigin(make({Origin:site})), true);
});
test('accepts privacy-mode Origin null only with same-origin fetch metadata', () => {
  assert.equal(isSameOrigin(make({Origin:'null','Sec-Fetch-Site':'same-origin'})), true);
  assert.equal(isSameOrigin(make({'Sec-Fetch-Site':'same-origin'})), true);
});
test('accepts same-origin Referer in browsers without fetch metadata', () => {
  assert.equal(isSameOrigin(make({Referer:site+'/login'})), true);
});
test('rejects cross-site and missing-origin requests', () => {
  assert.equal(isSameOrigin(make({Origin:'https://malicious.example','Sec-Fetch-Site':'same-origin'})), false);
  assert.equal(isSameOrigin(make({Origin:'null','Sec-Fetch-Site':'cross-site'})), false);
  assert.equal(isSameOrigin(make({'Sec-Fetch-Site':'same-site'})), false);
  assert.equal(isSameOrigin(make({Referer:'https://malicious.example/'})), false);
  assert.equal(isSameOrigin(make({})), false);
});
test('login response uses Referrer-Policy same-origin for HTML form compatibility', async () => {
  const response = await worker.fetch(new Request(site+'/login'));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Referrer-Policy'),'same-origin');
  assert.ok(loginHtml.includes('action="/login"'));
});
