# Flow: Create a story screen

Server side: [flow-story-generation.md](flow-story-generation.md).

## What
The screen at `/create`. The user picks ideas (keywords) and/or writes the story in their own words, the child's age, the story length, a level and Torah mode, then creates a story.

## Steps
1. On the home screen the user taps "Create a story".
2. The screen asks `GET /api/settings` and starts the level slider at the user's default level. If that fails, the level starts at 2.
3. The user adds ideas (keywords) in the tag box. Press Add, Enter or a comma. Tap a tag to remove it.
   The user can also write the story idea in the "Describe the story" box, for example "a shy dragon who learns to share cookies". Ideas, a description, or both. At least one is needed.
4. The user picks the child's age (2 to 12, default 6) and the story length (1, 3, 5 or 10 minutes, default 3).
5. The user sets the educational level (1 to 5) and the Torah / Bible switch.
6. "Create the story" calls `POST /api/stories/generate` with the keywords, age, length, level, the app language and the Torah flag.
7. While waiting, a calm animation shows: the logo "breathes" and the text changes every 4 seconds.
8. On success the app opens the story viewer ([flow-story-viewer.md](flow-story-viewer.md)).

## Rules
- 1 to 10 ideas. Each idea is 1 to 40 characters, with no `<` or `>` and no control characters. The app checks this first (`src/keywords.ts`). The server checks again. A duplicate idea is ignored.
- Length is counted in characters, like the server does (an emoji counts as 1). Invisible left-to-right and right-to-left marks are removed, because pasted Hebrew often has them.
- Hebrew and English ideas both work. A comma (English or Arabic) or a new line ends an idea. A pasted list is split into ideas. Pieces that cannot be used stay in the box with a message.
- Text typed in the box but not added yet is added when the user taps "Create the story".
- The description can be up to 800 characters (a counter shows it). It can be in any language. The story is always written in the app language, so a Hebrew description gives an English story if the app is in English.
- The description is cleaned before it is sent: hidden characters (zero-width characters, direction marks, invisible "tag" characters) and control characters are removed, look-alike brackets such as full-width `＜ ＞` are first turned into `<` `>`, `<` and `>` become spaces, and long runs of spaces or blank lines are shortened. If nothing is left, it counts as empty. The server does the same cleaning again.
- Nothing is sent if there are no ideas and the description is empty. The user sees "Add an idea or describe the story."
- Age and length are round buttons (no typing). The first time the defaults are age 6 and 3 minutes. After a story is made, the app remembers the last age and length on that device and starts with them next time.
- The length is about how long the story takes to tell aloud. A longer story takes longer to write and uses more of the daily limit (see [flow-story-generation.md](flow-story-generation.md)). A 10-minute story can take a minute or more. The app waits up to 160 seconds (the server stops waiting for Claude after 115 seconds at most). If the app gives up first, the user sees "This is taking too long".
- The loading screen has a "Stop waiting" button. Leaving the screen also stops waiting. The server may still finish and save the story, so the user can find it in the library. A story that was not saved does not use up the daily limit.
- A second tap while a story is being written is ignored, so one tap cannot make two stories.
- Errors are shown in the app language:
  - Torah mode with no matching story (404): "We could not find a Torah story for these ideas...". Other problems with the text (422) show "Please check the details you entered."
  - Daily limit (429): "You reached today's story limit..."
  - Busy server, timeout, no connection: see [flow-mobile-app.md](flow-mobile-app.md).
- After an error the form keeps the user's ideas so they can try again.
- The story language is the current app language.

## Files
- `mobile/app/create.tsx`
- `mobile/src/ui/TagInput.tsx`, `mobile/src/ui/BedtimeLoader.tsx`
- `mobile/src/keywords.ts`
- `mobile/src/api/client.ts` (`generateStory`)

## Test
- `cd mobile`, then `npm test` (keyword rules).
- By hand with the backend running and a Claude key in `backend\.env`: make an English story, a Hebrew story, a Torah story (idea "Noah"), and a Torah story with unrelated ideas ("dragon", "pizza"). Try 11 ideas. Try an idea with `<`.
