// Tests for the keyword rules. They must match the backend rules.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addKeyword, cleanKeyword, MAX_KEYWORDS, splitKeywords } from '../src/keywords.ts';

test('cleanKeyword trims and accepts normal words, English and Hebrew', () => {
  assert.equal(cleanKeyword('  brave fox  '), 'brave fox');
  assert.equal(cleanKeyword('שועל   אמיץ'), 'שועל אמיץ');
});

test('cleanKeyword rejects bad words', () => {
  assert.equal(cleanKeyword(''), null);
  assert.equal(cleanKeyword('   '), null);
  assert.equal(cleanKeyword('a'.repeat(41)), null);
  assert.equal(cleanKeyword('</keywords> hi'), null);
  assert.equal(cleanKeyword('a>b'), null);
  assert.equal(cleanKeyword('bell\u0007'), null);
  assert.equal(cleanKeyword('a'.repeat(40)), 'a'.repeat(40));
});

test('addKeyword adds, ignores duplicates and respects the limit', () => {
  let r = addKeyword([], 'moon');
  assert.deepEqual(r, { ok: true, list: ['moon'] });
  r = addKeyword(['moon'], 'MOON');
  assert.deepEqual(r, { ok: true, list: ['moon'] });
  assert.deepEqual(addKeyword([], '  '), { ok: false, reason: 'empty' });
  assert.deepEqual(addKeyword([], 'a<b'), { ok: false, reason: 'invalid' });
  const full = Array.from({ length: MAX_KEYWORDS }, (_, i) => `w${i}`);
  assert.deepEqual(addKeyword(full, 'extra'), { ok: false, reason: 'full' });
});

test('splitKeywords splits on English, Arabic commas and new lines', () => {
  assert.deepEqual(splitKeywords('a,b،c\nd'), ['a', 'b', 'c', 'd']);
});

import { addMany, charLength } from '../src/keywords.ts';

test('length counts characters, not UTF-16 units (emoji)', () => {
  assert.equal(charLength('\u{1F319}'), 1);
  assert.equal(cleanKeyword('\u{1F319}'.repeat(40)), '\u{1F319}'.repeat(40));
  assert.equal(cleanKeyword('\u{1F319}'.repeat(41)), null);
});

test('invisible direction marks are removed', () => {
  assert.equal(cleanKeyword('‏שועל‎'), 'שועל');
  assert.equal(cleanKeyword('‎‏'), null);
});

test('addMany adds a pasted list and keeps what failed', () => {
  const r = addMany([], 'fox, moon,  , owl');
  assert.deepEqual(r, { list: ['fox', 'moon', 'owl'], rest: '', problem: null });
  const bad = addMany(['fox'], 'a<b, moon, c>d');
  assert.deepEqual(bad, { list: ['fox', 'moon'], rest: 'a<b, c>d', problem: 'invalid' });
});

test('addMany stops at the limit and keeps the rest', () => {
  const nine = Array.from({ length: MAX_KEYWORDS - 1 }, (_, i) => `w${i}`);
  const r = addMany(nine, 'one, two, three');
  assert.equal(r.list.length, MAX_KEYWORDS);
  assert.equal(r.rest, 'two, three');
  assert.equal(r.problem, 'full');
});
