import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AGES, DEFAULT_AGE, DEFAULT_LENGTH, LENGTHS, pickAge, pickLength } from '../src/storyOptions.ts';

test('the defaults are age 6 and 3 minutes, and both are offered', () => {
  assert.equal(DEFAULT_AGE, 6);
  assert.equal(DEFAULT_LENGTH, 3);
  assert.ok(AGES.includes(DEFAULT_AGE));
  assert.ok(LENGTHS.includes(DEFAULT_LENGTH));
});

test('choices are inside what the server accepts (age 1-14, length 1-10)', () => {
  for (const a of AGES) assert.ok(a >= 1 && a <= 14);
  for (const m of LENGTHS) assert.ok(m >= 1 && m <= 10);
});

test('a saved value is used only if it is one of the choices', () => {
  assert.equal(pickAge('9'), 9);
  assert.equal(pickAge('99'), DEFAULT_AGE);
  assert.equal(pickAge('abc'), DEFAULT_AGE);
  assert.equal(pickAge(null), DEFAULT_AGE);
  assert.equal(pickLength('10'), 10);
  assert.equal(pickLength('4'), DEFAULT_LENGTH);
  assert.equal(pickLength(undefined), DEFAULT_LENGTH);
});
