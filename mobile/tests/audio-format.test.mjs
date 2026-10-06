import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatDuration, MAX_RECORDING_SECONDS, MIN_RECORDING_SECONDS } from '../src/audioFormat.ts';

test('durations are shown as minutes and seconds', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(5), '0:05');
  assert.equal(formatDuration(95.4), '1:35');
  assert.equal(formatDuration(600), '10:00');
  assert.equal(formatDuration(3725), '62:05');
});

test('bad numbers never break the display', () => {
  assert.equal(formatDuration(-4), '0:00');
  assert.equal(formatDuration(NaN), '0:00');
  assert.equal(formatDuration(Infinity), '0:00');
});

test('the recording limits are sensible and fit the server (25 MB, 3600 s)', () => {
  assert.equal(MAX_RECORDING_SECONDS, 1200);
  assert.ok(MAX_RECORDING_SECONDS <= 3600);
  assert.ok(MIN_RECORDING_SECONDS >= 1 && MIN_RECORDING_SECONDS < 10);
});
