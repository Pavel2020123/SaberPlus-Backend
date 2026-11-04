import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from './pilot_capacity_local.mjs';
test('nearest-rank percentiles include failures rather than hiding slow errors', () => {
  const samples = Array.from({ length: 20 }, (_, i) => ({ ms: i + 1, ok: i !== 19 }));
  assert.deepEqual(summarize(samples), { requests: 20, failures: 1, p50ms: 10, p95ms: 19, p99ms: 20, maxMs: 20 });
  assert.equal(samples[0].ms, 1);
});
test('empty sample does not claim success', () => assert.throws(() => summarize([])));
