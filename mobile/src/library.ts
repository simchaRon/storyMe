// No imports on purpose: the tests load this file with plain Node.

type StoryLike = {
  id: number;
  root_story_id: number | null;
  chapter_number: number;
  created_at: string;
};

export type Group<T> = {
  /** The id of the first chapter. All chapters of one series share it. */
  key: number;
  /** Chapters, first chapter first. */
  stories: T[];
  /** Time of the newest chapter, as a number (for sorting). */
  newest: number;
};

/**
 * Put the chapters of one series together. A story with no `root_story_id` is chapter 1 of its own
 * series. Sequels point to the first chapter with `root_story_id`. Groups come newest first.
 * Only the stories we pass in are grouped, so a series can look short if some chapters are not loaded.
 */
export function groupSeries<T extends StoryLike>(stories: T[]): Group<T>[] {
  const map = new Map<number, T[]>();
  for (const story of stories) {
    const key = story.root_story_id ?? story.id;
    const list = map.get(key);
    if (list) list.push(story);
    else map.set(key, [story]);
  }
  const groups: Group<T>[] = [];
  for (const [key, list] of map) {
    list.sort((a, b) => a.chapter_number - b.chapter_number || a.id - b.id);
    const newest = Math.max(...list.map((s) => Date.parse(s.created_at) || 0));
    groups.push({ key, stories: list, newest });
  }
  return groups.sort((a, b) => b.newest - a.newest || b.key - a.key);
}

/** Replace one story in a list (for example after the heart was tapped). */
export function updateStory<T extends { id: number }>(list: T[], id: number, changes: Partial<T>): T[] {
  return list.map((s) => (s.id === id ? { ...s, ...changes } : s));
}

/**
 * Join a new page of stories to the list. With `reset` the page replaces the list.
 * Without it the page is added, and stories we already have are skipped. Pages by offset can
 * repeat a story when a new one was created between two requests.
 */
export function mergePage<T extends { id: number }>(old: T[], page: T[], reset: boolean): T[] {
  if (reset) return page;
  const seen = new Set(old.map((s) => s.id));
  return [...old, ...page.filter((s) => !seen.has(s.id))];
}

/** A heart change that is on its way to the server (or just arrived). */
export type PendingFavorite = { value: boolean; doneAt: number | null };

/**
 * Put heart changes on top of a page from the server. A page that was requested before a change
 * was saved may still have the old value, so the change wins. Changes that were saved before the
 * request started are no longer needed (the server already has them). They are removed from `pending`.
 */
export function applyPending<T extends { id: number; is_favorite: boolean }>(
  page: T[],
  pending: Map<number, PendingFavorite>,
  requestStartedAt: number,
): T[] {
  const result = page.map((s) => {
    const p = pending.get(s.id);
    return p && (p.doneAt === null || p.doneAt >= requestStartedAt) ? { ...s, is_favorite: p.value } : s;
  });
  for (const [id, p] of pending) {
    if (p.doneAt !== null && p.doneAt < requestStartedAt) pending.delete(id);
  }
  return result;
}
