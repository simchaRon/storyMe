import assert from 'node:assert/strict';
import { test } from 'node:test';

import { groupSeries, updateStory } from '../src/library.ts';

const s = (id, root, chapter, minute) => ({
  id,
  root_story_id: root,
  chapter_number: chapter,
  created_at: `2026-10-06T10:${String(minute).padStart(2, '0')}:00+00:00`,
});

test('chapters of one series are grouped, first chapter first', () => {
  // The list from the server is newest first: 3, 2, 1
  const groups = groupSeries([s(3, 1, 3, 30), s(2, 1, 2, 20), s(1, null, 1, 10)]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, 1);
  assert.deepEqual(groups[0].stories.map((x) => x.id), [1, 2, 3]);
});

test('single stories stay alone, and groups are newest first', () => {
  const groups = groupSeries([s(5, null, 1, 50), s(4, 1, 2, 40), s(1, null, 1, 10), s(9, null, 1, 5)]);
  assert.deepEqual(groups.map((g) => g.key), [5, 1, 9]);
  assert.deepEqual(groups[1].stories.map((x) => x.id), [1, 4]);
});

test('a series whose first chapter is not in the list still groups by root', () => {
  const groups = groupSeries([s(3, 1, 3, 30), s(2, 1, 2, 20)]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].stories[0].chapter_number, 2);
});

test('empty list', () => {
  assert.deepEqual(groupSeries([]), []);
});

test('updateStory changes only the chosen story and does not change the old list', () => {
  const list = [{ id: 1, is_favorite: false }, { id: 2, is_favorite: false }];
  const next = updateStory(list, 2, { is_favorite: true });
  assert.deepEqual(next, [{ id: 1, is_favorite: false }, { id: 2, is_favorite: true }]);
  assert.equal(list[1].is_favorite, false);
});

import { applyPending, mergePage } from '../src/library.ts';

test('mergePage adds a page and skips stories we already have', () => {
  const old = [{ id: 3 }, { id: 2 }];
  assert.deepEqual(mergePage(old, [{ id: 2 }, { id: 1 }], false), [{ id: 3 }, { id: 2 }, { id: 1 }]);
  assert.deepEqual(mergePage(old, [{ id: 9 }], true), [{ id: 9 }]);
});

test('groups with the same time are ordered the same way every time', () => {
  const same = (id) => s(id, null, 1, 5);
  assert.deepEqual(groupSeries([same(1), same(2), same(3)]).map((g) => g.key), [3, 2, 1]);
});

test('an invalid date does not break grouping', () => {
  const bad = { id: 1, root_story_id: null, chapter_number: 1, created_at: 'nonsense' };
  assert.equal(groupSeries([bad, s(2, null, 1, 10)]).length, 2);
});

test('updateStory with an unknown id changes nothing', () => {
  const list = [{ id: 1, is_favorite: false }];
  assert.deepEqual(updateStory(list, 99, { is_favorite: true }), list);
});

test('a chapter 2 with no root next to a real series stays separate', () => {
  const groups = groupSeries([s(10, null, 2, 50), s(3, 1, 3, 30), s(1, null, 1, 10)]);
  assert.deepEqual(groups.map((g) => g.key).sort(), [1, 10]);
});

test('applyPending puts a heart change over an older page', () => {
  const pending = new Map([[1, { value: true, doneAt: null }]]);
  const page = [{ id: 1, is_favorite: false }, { id: 2, is_favorite: false }];
  assert.deepEqual(applyPending(page, pending, 1000), [{ id: 1, is_favorite: true }, { id: 2, is_favorite: false }]);
  assert.equal(pending.size, 1); // still on its way, keep it
});

test('applyPending keeps a saved change while an older request is still running', () => {
  const pending = new Map([[1, { value: true, doneAt: 2000 }]]);
  const page = [{ id: 1, is_favorite: false }];
  // The request started at 1000, before the change was saved at 2000: the change wins.
  assert.equal(applyPending(page, pending, 1000)[0].is_favorite, true);
  assert.equal(pending.size, 1);
});

test('applyPending drops a saved change when a newer request already includes it', () => {
  const pending = new Map([[1, { value: true, doneAt: 2000 }]]);
  const page = [{ id: 1, is_favorite: true }];
  assert.equal(applyPending(page, pending, 3000)[0].is_favorite, true);
  assert.equal(pending.size, 0); // the server has it now, no need to remember
});
