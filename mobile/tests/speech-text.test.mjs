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

test('speechPlan: one piece per sentence, with the pause after each', async () => {
  const { speechPlan } = await import('../src/speechText.ts');
  const plan = speechPlan('כותרת', 'שָׁלוֹם, עוֹלָם. מַה שְׁלוֹמְךָ? טוֹב!\n\nפסקה שנייה.');
  assert.deepEqual(
    plan.map((p) => p.text),
    ['כותרת', 'שָׁלוֹם, עוֹלָם.', 'מַה שְׁלוֹמְךָ?', 'טוֹב!', 'פסקה שנייה.'],
  );
  assert.ok(plan[0].pauseAfterMs > plan[1].pauseAfterMs); // title pause is the longest
  assert.ok(plan[2].pauseAfterMs < plan[1].pauseAfterMs); // ? is shorter than .
  assert.ok(plan[3].pauseAfterMs > plan[1].pauseAfterMs); // end of paragraph is longer
  assert.ok(plan[4].pauseAfterMs > plan[1].pauseAfterMs);
});

test('speechPlan: nikud is kept, quotes stay with their sentence, empty text gives nothing', async () => {
  const { speechPlan } = await import('../src/speechText.ts');
  const plan = speechPlan('', '"וַאי!" אָמַר נִמְרוֹד.');
  assert.deepEqual(plan.map((p) => p.text), ['"וַאי!"', 'אָמַר נִמְרוֹד.']);
  assert.deepEqual(speechPlan('  ', ' \n\n '), []);
});
