import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock, TICK_MS, MAX_CATCH_UP_TICKS } from '../clock.mjs';

test('fractional elapsed time is retained across callbacks', () => {
  const clock = createClock(100);
  assert.equal(TICK_MS, 50);
  assert.deepEqual(clock.sample(124.5), { ticks: 0, dropped: 0, overruns: 0, remainder: 24.5 });
  assert.deepEqual(clock.sample(150), { ticks: 1, dropped: 0, overruns: 0, remainder: 0 });
  assert.deepEqual(clock.sample(249.75), { ticks: 1, dropped: 0, overruns: 0, remainder: 49.75 });
  assert.deepEqual(clock.sample(250), { ticks: 1, dropped: 0, overruns: 0, remainder: 0 });
  assert.deepEqual(clock.sample(250), { ticks: 0, dropped: 0, overruns: 0, remainder: 0 });
});

test('each callback processes at most five ticks and drops excess whole ticks', () => {
  const clock = createClock();
  assert.equal(MAX_CATCH_UP_TICKS, 5);
  assert.deepEqual(clock.sample(250), { ticks: 5, dropped: 0, overruns: 0, remainder: 0 });
  assert.deepEqual(clock.sample(826.5), { ticks: 5, dropped: 6, overruns: 1, remainder: 26.5 });
  assert.deepEqual(clock.sample(850), { ticks: 1, dropped: 0, overruns: 1, remainder: 0 });
  assert.deepEqual(clock.sample(1351), { ticks: 5, dropped: 5, overruns: 2, remainder: 1 });
  assert.deepEqual(clock.sample(1351), { ticks: 0, dropped: 0, overruns: 2, remainder: 1 });
});

test('invalid or backwards readings fail without consuming valid elapsed time', () => {
  const clock = createClock(10);
  clock.sample(35);
  for (const invalid of [NaN, Infinity, -Infinity, -1, '60', null, undefined]) {
    assert.throws(() => clock.sample(invalid), TypeError);
  }
  assert.throws(() => clock.sample(34.99), RangeError);
  assert.throws(() => clock.sample(Number.MAX_VALUE), RangeError);
  assert.deepEqual(clock.sample(60), { ticks: 1, dropped: 0, overruns: 0, remainder: 0 });
});

test('invalid clock origins are rejected', () => {
  for (const invalid of [NaN, Infinity, -Infinity, -1, '0', null]) {
    assert.throws(() => createClock(invalid), TypeError);
  }
});
