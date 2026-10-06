# Story generation flow

## What
Makes a new bedtime story with Claude and saves it for the user.

## Steps
1. App calls `POST /api/stories/generate` with `keywords` and/or `prompt` (the story idea in free text). At least one of the two is required. `child_age`, `length_minutes`, `educational_level`, `language` and `is_torah_story` are optional.
2. Empty level and language are filled from the user's settings.
3. The backend checks the daily quota and adds one row to `generation_log`. This is saved before the Claude call, so the DB is free while Claude works (it is slow).
4. If Claude succeeds, the story is saved with `chapter_number` 1.
5. If Claude fails, nothing is saved and the quota row is removed, so a failure does not use up the day.

## Rules
- Keywords: 1 to 10 items, 1 to 40 characters each (counted as characters, so an emoji is 1), no new lines, control characters, `<` or `>`. Invisible left-to-right and right-to-left marks are removed first.
- Free text (`prompt`): up to 800 characters (counted as characters). It is cleaned on the server (`app/textclean.py`): look-alike characters are folded first (full-width `＜` becomes `<`), then hidden characters are removed (zero-width characters, direction marks, invisible "tag" characters, control characters; new lines and tabs stay), then `<` and `>` become spaces, and long runs of spaces and blank lines are shortened. Keywords get the same hidden-character cleaning. If the text is empty after cleaning and there are no keywords, the API returns 422. The text is saved with the story.
- A sequel uses the keywords of the first story (none, for a story made only from text) and gets the original free text as background, together with the end of the last chapter. Both are cleaned the same way before they go into the prompt.
- Child age: 1 to 14 (default 6). Length: 1 to 10 minutes (default 3). The story is written for that age and about that length. Both are saved with the story. A sequel uses the same age and length as the first story.
- Level 1 to 5: 1 pure fun, 2 balanced (default), 3 gentle lesson, 4 moral value, 5 deep educational value.
- Torah mode: the story must stay true to the source and must have a `source_reference`.
- Daily quota: `DAILY_STORY_LIMIT` is counted in units per user per UTC day (default 20). A story of 1 to 3 minutes uses 1 unit, 4 to 5 minutes uses 2, and 6 to 10 minutes uses 3, because a longer story costs more. Over the limit returns 429. It counts `generation_log` rows, so deleting stories or restarting the server does not reset it. On PostgreSQL the user row is locked while the quota is checked, so two requests at the same moment cannot both pass.
- If the story cannot be saved (for example the parent was deleted meanwhile), the API returns 409 and the quota is given back.
- Rate limit: 10 per minute per IP (resets on restart).
- Claude errors return 404 (no matching Torah story), 502, 503 or 504. See [flow-story-prompt.md](flow-story-prompt.md).
- Needs `ANTHROPIC_API_KEY`. The model name is `CLAUDE_MODEL`.

## Old database files
Stories made before age, length and free text existed get age 6, 3 minutes and no free text. When the backend starts, it adds the new columns to an old database file by itself (`add_missing_columns` in `database.py`). If two servers start at the same time, the second one does not crash. This is a development helper. Use Alembic before a real deploy.

## Files
`backend/app/routers/stories.py`, `backend/app/services/story_generator.py`, `backend/app/models.py`, `backend/app/schemas.py`

## Test
`.venv\Scripts\python -m pytest tests/test_stories.py` (Claude is faked, no key needed)
