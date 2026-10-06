import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isActive, narrationFor, needsPolling, progressPercent } from '../src/narration.ts';
import { VOICE_SAMPLE_SCRIPT } from '../src/voiceSample.ts';

const n = (id, voice_id, status, done = 0, total = 0) => ({ id, voice_id, status, progress_done: done, progress_total: total });

test('only waiting and running audio is "active"', () => {
  assert.deepEqual(['queued', 'running', 'done', 'failed'].map((s) => isActive({ status: s })), [true, true, false, false]);
});

test('polling stops when nothing is being made', () => {
  assert.equal(needsPolling([]), false);
  assert.equal(needsPolling([n(1, 1, 'done'), n(2, 2, 'failed')]), false);
  assert.equal(needsPolling([n(1, 1, 'done'), n(2, 2, 'running')]), true);
});

test('the audio of one voice is found', () => {
  const list = [n(1, 10, 'done'), n(2, 20, 'running')];
  assert.equal(narrationFor(20, list).id, 2);
  assert.equal(narrationFor(30, list), undefined);
});

test('progress is a safe percentage', () => {
  assert.equal(progressPercent({ progress_done: 0, progress_total: 0 }), 0);
  assert.equal(progressPercent({ progress_done: 3, progress_total: 12 }), 25);
  assert.equal(progressPercent({ progress_done: 12, progress_total: 12 }), 100);
  assert.equal(progressPercent({ progress_done: 99, progress_total: 12 }), 100);
  assert.equal(progressPercent({ progress_done: -5, progress_total: 12 }), 0);
});

test('the voice sample text is long enough to read for 30 seconds or more, and not too long', () => {
  const words = VOICE_SAMPLE_SCRIPT.split(/\s+/).length;
  // about 130 words a minute when read calmly
  assert.ok(words >= 70 && words <= 160, `the script has ${words} words`);
  assert.ok(!/[<>]/.test(VOICE_SAMPLE_SCRIPT));
});
