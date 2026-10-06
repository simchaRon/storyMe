# Sequel flow

## What
Makes the next chapter of an existing story.

## Steps
1. App calls `POST /api/stories/sequel` with `parent_story_id`. `keywords` is optional.
2. The backend loads the parent. It must belong to the user, else 404.
3. It checks the daily quota.
4. It sends the title and the last 2500 characters of the parent to Claude as context.
5. The new story copies level, language and Torah mode from the parent. It uses the parent's keywords if none are sent.
6. It saves `parent_story_id`, `root_story_id` (the first story of the series) and `chapter_number` (parent + 1).

## Rules
- `root_story_id` groups all chapters. The library (Phase 5) will use it to show one card per series.
- If a story is deleted, its sequels stay. Their `parent_story_id` becomes empty.
- If the first chapter is deleted, the next chapter becomes the first chapter of the series: its `root_story_id` is cleared and later chapters point to it. A new sequel then joins the same series. Chapter numbers do not change (chapter 2 stays chapter 2).
- Two sequels of one parent get the same chapter number.
- The quota, rate limit and Claude errors are the same as in [flow-story-generation.md](flow-story-generation.md).

## Files
`backend/app/routers/stories.py`, `backend/app/services/story_generator.py`

## Test
`.venv\Scripts\python -m pytest tests/test_stories.py -k sequel`
