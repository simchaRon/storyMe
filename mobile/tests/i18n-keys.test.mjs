// Checks that English and Hebrew have exactly the same keys and no empty text.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const load = (name) => JSON.parse(readFileSync(new URL(`../src/i18n/${name}.json`, import.meta.url), 'utf8'));

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );
}

const en = new Map(flatten(load('en')));
const he = new Map(flatten(load('he')));

test('English and Hebrew have the same keys', () => {
  assert.deepEqual([...en.keys()].sort(), [...he.keys()].sort());
});

test('no text is empty', () => {
  for (const [lang, map] of [['en', en], ['he', he]]) {
    for (const [key, text] of map) assert.ok(String(text).trim().length > 0, `${lang}: ${key} is empty`);
  }
});

test('Hebrew text contains Hebrew letters (except the brand name)', () => {
  for (const [key, text] of he) {
    if (key === 'app.title') continue;
    assert.match(text, /[֐-׿]/, `he: ${key} has no Hebrew letters`);
  }
});

test('placeholders like {{word}} are the same in both languages', () => {
  const names = (text) => [...String(text).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
  for (const [key, text] of en) {
    assert.deepEqual(names(he.get(key)), names(text), `placeholders differ for ${key}`);
  }
});
