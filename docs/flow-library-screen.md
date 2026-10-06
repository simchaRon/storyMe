# Flow: Library screen

Server side: [flow-stories.md](flow-stories.md) (list, favorite, delete) and [flow-sequel.md](flow-sequel.md) (series).

## What
The screen at `/library`. It lists the user's stories in two tabs: "Past stories" and "Favorites". Stories with next chapters are grouped as a series.

## Steps
1. On the home screen the user taps "My library".
2. The screen loads the first 30 stories with `GET /api/stories` (or `/api/stories/favorites` in the Favorites tab). It loads again every time the user comes back to the screen, so a new story shows up.
3. "Past stories" tab:
   - A story with no next chapters is one card.
   - A story with next chapters is one series card ("Series · 3 chapters"). Tap it to show or hide the chapters. Tap a chapter to open it.
4. "Favorites" tab: a flat list of the hearted chapters. A chapter after the first shows a "Chapter N" badge.
5. The heart calls `PATCH /api/stories/{id}/favorite`. The change shows at once. In the Favorites tab an un-hearted story leaves the list.
6. "Delete" asks "are you sure?" and then calls `DELETE /api/stories/{id}`.
7. "Load more" shows when a full page came back. It loads the next 30.
8. An empty tab shows a friendly message. The "Past stories" tab also has a "Create a story" button.

## Rules
- Series are grouped by `root_story_id` (the first chapter's id). A story without it is chapter 1 of its own series. Code: `src/library.ts`.
- Grouping uses only the stories loaded so far. A long series can look short until "Load more" is tapped.
- Deleting a story keeps its next chapters. If the first chapter is deleted, the next chapter becomes the first chapter of the series, so the series stays one card (the server does this).
- Hearts: a tap shows at once. A second tap on the same heart is ignored until the server answers. A list that was requested before the tap cannot undo it. If saving fails, the list reloads from the server and the error shows.
- Old answers are ignored: if the user changes tab quickly, only the newest request updates the list.
- Coming back to the screen (for example from a story) reloads as many stories as were on screen (up to 100), so the list does not shrink.
- Stories that were already loaded are skipped when the next page arrives, so a new story created in between cannot show twice.
- "Load more" is hidden while the list is loading. "Try again" repeats the last thing that failed: a failed "load more" keeps the pages already shown.
- Delete and the heart both have a 48 px touch area. If a story was already deleted (404), the list just refreshes.
- Layout: one column on phones. Two columns on wide screens (800 px and more), up to 1040 px wide.
- Story titles follow the direction of the story's language. Hearts and buttons flip with the app language.

## Files
- `mobile/app/library.tsx`
- `mobile/src/ui/StoryRow.tsx`, `mobile/src/ui/SeriesCard.tsx`
- `mobile/src/library.ts` (grouping)
- `mobile/src/api/client.ts` (`listStories`, `setFavorite`, `deleteStory`)

## Test
- `cd mobile`, then `npm test` (grouping: `tests/library.test.mjs`).
- By hand with the backend running: make 2 stories and a sequel of one. Open the library. You should see one single card and one series card. Open the series, tap a chapter. Heart a chapter and check the Favorites tab. Un-heart it there. Delete a story. On a wide browser window check two columns. Switch to Hebrew and check the layout.
