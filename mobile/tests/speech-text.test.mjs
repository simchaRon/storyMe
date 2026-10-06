import assert from 'node:assert/strict';
import { test } from 'node:test';

import { speechParts, splitLong } from '../src/speechText.ts';

test('short paragraphs stay whole and the title comes first', () => {
  assert.deepEqual(speechParts('Title', 'One.\n\nTwo.'), ['Title', 'One.', 'Two.']);
});

test('a long paragraph is cut into short pieces at sentence ends', () => {
  const sentence = 'The little fox looked at the moon. ';
  const parts = splitLong(sentence.repeat(30));
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= 350, `piece too long: ${p.length}`);
  assert.equal(parts.join(' ').replace(/\s+/g, ' ').trim(), sentence.repeat(30).replace(/\s+/g, ' ').trim());
});

test('a long text without punctuation is cut at spaces', () => {
  const parts = splitLong('word '.repeat(400).trim());
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= 700);
});

test('Hebrew text is cut too, and empty text gives nothing', () => {
  const sentence = 'השועל הקטן הביט בירח הגדול. ';
  const parts = splitLong(sentence.repeat(30));
  assert.ok(parts.length > 1);
  assert.deepEqual(splitLong('   '), []);
});
