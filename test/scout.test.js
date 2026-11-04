import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMetrics, partsNY } from '../src/scout.js';

function bar(t, c, v) { return { t, c, o:c, h:c, l:c, v }; }
function historical({todayVolume=2500, olderClose=100, newClose=104, baseline=600} = {}) {
  const arr = [];
  // July 2026 EDT: 9:30 NY = 13:30Z. Prior sessions at 10:30 NY=14:30Z.
  for (const d of ['2026-07-13','2026-07-14','2026-07-15','2026-07-16','2026-07-17']) {
    arr.push(bar(`${d}T14:30:00Z`, 99, baseline));
  }
  arr.push(bar('2026-07-20T14:30:00Z', olderClose, 700));
  arr.push(bar('2026-07-20T15:30:00Z', newClose, todayVolume));
  // previous peer volumes for 11:30 NY (15:30Z)
  for (const d of ['2026-07-13','2026-07-14','2026-07-15','2026-07-16','2026-07-17']) {
    arr.push(bar(`${d}T15:30:00Z`, 101, baseline));
  }
  return arr;
}
const now = new Date('2026-07-20T15:48:00Z');
test('NY time is daylight-saving aware', () => {
  assert.equal(partsNY('2026-07-20T15:30:00Z').slot, '11:30');
  assert.equal(partsNY('2026-01-20T15:30:00Z').slot, '10:30');
});
test('flags hourly move OR same-slot 5-day median volume', () => {
  const out = calculateMetrics(historical(), now);
  assert.equal(out.ok, true);
  assert.equal(out.flagged, true);
  assert.ok(out.pct1h > 3.9);
  assert.ok(out.volumeRatio > 4);
  assert.equal(out.baselineDays, 5);
});
test('no flag for neutral price and normal volume', () => {
  const out = calculateMetrics(historical({olderClose:100,newClose:100,todayVolume:600}), now);
  assert.equal(out.flagged, false);
});
test('does not signal from stale data', () => {
  const out = calculateMetrics(historical(), new Date('2026-07-21T15:48:00Z'));
  assert.equal(out.flagged, undefined);
  assert.equal(out.ok, false);
});
test('requires at least three prior volume sessions', () => {
  const out = calculateMetrics(historical().filter(x => !x.t.startsWith('2026-07-13') && !x.t.startsWith('2026-07-14') && !x.t.startsWith('2026-07-15')), now);
  assert.equal(out.volumeRatio, null);
  assert.equal(out.baselineDays, 2);
});
test('newest unfinished 15min bar is ignored', () => {
  const bars = historical();
  bars.push(bar('2026-07-20T15:45:00Z', 1000, 100000));
  const out = calculateMetrics(bars, now);
  assert.equal(out.latest.t, '2026-07-20T15:30:00Z');
});
