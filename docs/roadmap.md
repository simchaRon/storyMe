# Roadmap

## Done
- Project folder, README and docs.
- `code-reviewer` agent (`.claude/agents/code-reviewer.md`). The plan, the backend and Phases 2 and 4 were reviewed with it, and the findings were fixed.
- Phase 1, backend: auth, settings, stories, sequels, favorites, daily quota, rate limits, paging. 64 tests pass. Real Claude test passed (English, Hebrew, Torah, sequel).
- Phase 2, app base: Expo app in `mobile/`, English and Hebrew, RTL switch, midnight theme, API client with token, offline state.
- Phase 3, brand and settings: logo (SVG), header, login and register, Settings screen, restart button for the direction change.
- Phase 4, stories: create screen (tag input, level slider, Torah switch, calm loading animation, stop waiting), story viewer (large text, read aloud with the device voice, next chapter).
- Phase 5, library: Past stories and Favorites tabs, series cards, heart, delete with confirm, load more, two columns on wide screens.
- Phase 5 review fixes: favorite errors now show, no duplicate stories between pages, hearts cannot be undone by an older list, the list keeps its size when you come back, deleting the first chapter keeps the series together (backend), bigger delete button, "Try again" keeps loaded pages.
- Story age and length: the child's age (default 6) and the story length (default 3 minutes) can be chosen when creating a story. The story is written for that age and length. Tested with real Claude. Old database files are upgraded by themselves.
- Free text: the user can describe the story in their own words (up to 800 characters), with or without keywords. The text is cleaned on the server and kept inside its own tags in the Claude prompt. Tested with real Claude, including an attempt to break the rules.
- Review fixes for age, length and free text: hidden Unicode and look-alike brackets are removed from user text, the sequel prompt is fenced and gets the original request, Torah mode does not let the free text change the story ("no Torah story" is now status 404, so other errors show the right message), long stories use more of the daily limit, the old-database upgrade survives two servers starting together.
- The app has 53 tests and the backend 113. The app type checks and builds for web.

## Next
- Check the app by eye, on web and on a phone: RTL, colors, Hebrew text, the logo, the slider, typing Hebrew in the idea box, reading aloud in Hebrew, the library. Check that "Restart now" works in a real build (`expo-updates` may need EAS set up).
- Before a store build: set `ios.bundleIdentifier` and `android.package` in `mobile/app.json`.
- Alembic migrations before the first Postgres deploy. Also test on Postgres (tests run on SQLite only).
- Phase 6: voice cloning (a cloned voice reads any story). Not started. Free options are limited: see the voice section in [next-session-plan.md](next-session-plan.md). The family listening test is in [flow-voice-test.md](flow-voice-test.md) and is optional now that "Read it yourself" exists.

## Known limits (from the reviews, not fixed yet)
- There is no second safety check of the story text before it is saved. Safety relies on the prompt (tested on a few cases only).
- Many long stories at the same moment can use up the server threads. A limit of running stories per user, or streaming, would help.
- The IP rate limit is in memory, per process. Behind a proxy all users share one IP. Use Redis and the user id as the key before going public.
- Claude calls are blocking. Many slow requests at once can use up the server threads. Move to `AsyncAnthropic` if traffic grows.
- The quota check and the reservation are two steps, so a burst of parallel calls can pass a few extra.
- Two sequels of one parent get the same chapter number.
- A sequel always uses the age and length of the first story. There is no way yet to change them for the next chapter.
- Hebrew story length was calibrated by word count only. Check it with real Hebrew speech (for example the device voice) and adjust `HEBREW_WORDS_FACTOR` in `story_generator.py` if a 3-minute Hebrew story is clearly shorter or longer.
- The age and length are remembered on the device only, not on the server.
- The library loads pages by position (offset). Many changes from another device at the same time can still show a story late or early. A cursor would fix this.
- If the app stops waiting for a story, the server may still save it (the user finds it in the library).
- `_get_or_create` for settings is in two files and has a rare race. `PUT /settings` should be `PATCH`.
- The web login token is in local storage. A cookie-based login is a later task.
- Recordings are not encrypted by the app. Use an encrypted disk, keep backups short, and write a privacy policy before going public.
