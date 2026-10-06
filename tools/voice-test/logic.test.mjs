// Run:  node --test tools/voice-test/logic.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const { parseClipName, isClone, shuffle, toCsv, csvEscape, summarize } = createRequire(import.meta.url)('./logic.js');

test('file names are split into candidate, voice and passage', () => {
  assert.deepEqual(parseClipName('elevenlabs__dad__p2.mp3'), { candidate: 'elevenlabs', voice: 'dad', passage: 'p2' });
  assert.deepEqual(parseClipName('phonikud__stock__p1.wav'), { candidate: 'phonikud', voice: 'stock', passage: 'p1' });
  assert.deepEqual(parseClipName('strange.mp3'), { candidate: 'strange', voice: '?', passage: '?' });
});

test('only the voice name "stock" is not a clone', () => {
  assert.equal(isClone('stock'), false);
  assert.equal(isClone('STOCK'), false);
  assert.equal(isClone('dad'), true);
});

test('shuffle keeps every item once and does not change the original list', () => {
  const list = [1, 2, 3, 4, 5, 6];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = shuffle(list, rand);
  assert.deepEqual([...out].sort(), list);
  assert.deepEqual(list, [1, 2, 3, 4, 5, 6]);
});

test('csv escapes commas, quotes and new lines, and starts with a byte-order mark', () => {
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape('line\nbreak'), '"line\nbreak"');
  assert.equal(csvEscape(null), '');
  const csv = toCsv([{ rater: 'Mom', clip: 'Clip 1', candidate: 'x', voice: 'dad', passage: 'p1', clear: 5, pron: 4, rhythm: 3, sim: '', wrong: 'ספר, שמן' }]);
  assert.ok(csv.startsWith('﻿rater,clip,candidate'));
  assert.ok(csv.includes('Mom,Clip 1,x,dad,p1,5,4,3,,"ספר, שמן"'));
});

test('summary averages ratings per candidate and kind, and skips unrated clips', () => {
  const rows = [
    { candidate: 'a', voice: 'dad', clear: 5, pron: 4, rhythm: 4, sim: 3 },
    { candidate: 'a', voice: 'mom', clear: 4, pron: 4, rhythm: 5, sim: 4 },
    { candidate: 'a', voice: 'mom', clear: '', pron: '', rhythm: '', sim: '' },
    { candidate: 'b', voice: 'stock', clear: 3, pron: 2, rhythm: 3, sim: '' },
  ];
  const [a, b] = summarize(rows);
  assert.equal(a.name, 'a / clone');
  assert.equal(a.clips, 3);
  assert.deepEqual([a.clear, a.pron, a.rhythm, a.sim], [4.5, 4, 4.5, 3.5]);
  assert.equal(a.pass, true);
  assert.equal(b.name, 'b / stock');
  assert.equal(b.sim, null);
  assert.equal(b.pass, false);
});

test('a candidate with nothing rated does not pass', () => {
  assert.equal(summarize([{ candidate: 'a', voice: 'dad', clear: '', pron: '', rhythm: '', sim: '' }])[0].pass, false);
});
