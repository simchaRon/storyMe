# Flow: Stories (list, read, favorite, delete)

Making stories is in [flow-story-generation.md](flow-story-generation.md) and [flow-sequel.md](flow-sequel.md).

## What
Users list their stories, read one, mark favorites and delete.

## Steps
1. `GET /api/stories` lists stories. Newest first. No story text.
2. `GET /api/stories/favorites` lists favorites only.
3. `GET /api/stories/{id}` returns one story with its text.
4. `PATCH /api/stories/{id}/favorite` with `{"is_favorite": true|false}`.
5. `DELETE /api/stories/{id}`.

## Rules
- Every call only sees the user's own stories. Other stories return 404.
- Lists take `limit` (1 to 100, default 20) and `offset`.
- Favorite sets a value. Sending the same value twice gives the same result.
- Deleting a story keeps its sequels. Deleting the first chapter of a series makes the next chapter the new first chapter (see [flow-sequel.md](flow-sequel.md)).
- `/favorites` is declared before `/{id}` so it is not read as an id.

## Files
- `backend/app/routers/stories.py`
- `backend/app/models.py` (`Story`)
- `backend/app/schemas.py` (`StoryOut`, `StorySummaryOut`, `FavoriteIn`)

## Test
`.venv\Scripts\python -m pytest tests/test_stories.py`
