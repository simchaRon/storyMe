# Plan for the next session (handoff)

Read this file first in a new session. Then read only the flow file for the task you do (see [DOCS.md](DOCS.md)).

## What the project is
DreamTale AI (folder `storyMe`): a bedtime story app for children. Claude writes the stories. English (left-to-right) and Hebrew (right-to-left).
- Backend: Python, FastAPI, SQLAlchemy 2, SQLite for dev, PostgreSQL for prod. In `backend/`.
- App: Expo (React Native, TypeScript, expo-router) for iOS, Android and Web. In `mobile/`.

## Where we are
| Phase | State |
|---|---|
| 1. Backend | Done. 63 tests pass. Reviewed twice with the `code-reviewer` agent. Tried with a real Claude key: works. |
| 2. App base | Done. Reviewed with the `code-reviewer` agent and the findings were fixed. |
| 3. Brand and Settings | Done (logo, login and register, Settings screen, restart button). 7 app tests pass, it type checks and builds for web. Not checked by eye in a browser or on a phone. |
| 4. Story generator and viewer | Built. 11 app tests pass, type checks, builds for web. Real Claude tested on the backend. Not checked by eye in the app yet. |
| 5. Library and favorites | Done (tabs, series cards, heart, delete, load more). Reviewed with the `code-reviewer`, findings fixed. 33 app tests and 66 backend tests pass. Not checked by eye. |
| 6. Voice | "Read it yourself" (a person records a story, the child plays it) is built and reviewed, not tested on a phone. English voice cloning is built and tested with the real model (free, Chatterbox on this computer): [flow-cloning.md](flow-cloning.md). Hebrew cloning is not built. |

## Rules for working here
- Talk in simple English, short sentences. Short replies.
- Read only the files needed. Start from `docs/DOCS.md`, then one flow file.
- After every change, update the docs in the same turn. At the end, say which docs changed.
- Never put keys or passwords in docs. Never commit `.env`.
- Use `npx expo install <package>` for app packages, not `npm install`. Expo changes between versions: check `https://docs.expo.dev/llms.txt` before using an Expo API from memory.
- Run the `code-reviewer` agent after each phase. Fix every [CRITICAL] and [MAJOR] finding.
- Do not run two Claude sessions in this folder at once. Earlier, some docs were written by another process and some files were overwritten.

## How to run
- Backend: in `backend/`, copy `.env.example` to `.env`, set `JWT_SECRET` (32+ characters) and `ANTHROPIC_API_KEY`. Then `.venv\Scripts\python -m uvicorn app.main:app --reload`. Docs page: http://localhost:8000/docs
- Backend tests: `.venv\Scripts\python -m pytest`
- App: in `mobile/`, `npm install`, then `npm run web` or `npm start`. Tests: `npm test`. Type check: `npm run typecheck`.
- The app needs `EXPO_PUBLIC_API_URL` (default `http://localhost:8000`). Android emulator: `http://10.0.2.2:8000`.

## Key facts about the code
- Backend files: see [architecture.md](architecture.md). Endpoints: see [api.md](api.md).
- Story calls use the model in `CLAUDE_MODEL` (default `claude-sonnet-5-5`) with structured JSON output and no retries. The time limit depends on the story length (35 s + 8 s per minute). A story can have keywords, free text, a child age (default 6) and a length (default 3 minutes).
- Quota: `DAILY_STORY_LIMIT` units per user per UTC day (a long story uses 2 or 3 units), counted in `generation_log`. Given back if Claude fails.
- Series: sequels set `parent_story_id`, `root_story_id` and `chapter_number`. Use `root_story_id` to group a series in the library.
- App startup: language is loaded, then the saved token is checked with `/api/auth/me`. See [flow-mobile-app.md](flow-mobile-app.md).
- Use `colors`, `spacing`, `fonts` and `radius` from `mobile/src/theme.ts`. Use `t('key')` for all text, and add each key to both `en.json` and `he.json`.
- In styles use `marginStart` and `paddingEnd`, not `left` and `right`, so RTL works.

## Next steps, in order

### 0. Quick checks (small)
- Open the app on web and on a phone. Check RTL, colors and Hebrew text.
- Real Claude test of the backend: done (works).

### Phase 3: Brand and Settings (DONE, needs a check by eye)
Built: SVG logo, header, login and register screen, Settings screen, restart button. See [flow-auth-screens.md](flow-auth-screens.md) and [flow-settings-screen.md](flow-settings-screen.md). Still to do by hand: open it on web and on a phone, and check the "Restart now" button in a real build.
Use these in Phase 4 and 5: wrap new screens in `RequireAuth`, use `Screen` (it has the header), show errors with `errorMessage(t, e)`, and add new API calls to `mobile/src/api/client.ts`.

### Phase 4: Story generator and viewer (DONE, needs a check by eye)
Built: create screen, story viewer, read aloud with the device voice, next chapter. See [flow-create-story-screen.md](flow-create-story-screen.md) and [flow-story-viewer.md](flow-story-viewer.md). Still to do: run it by hand on web and on a phone, and run the code-reviewer on the new files.

### Phase 5: Library and favorites (DONE, needs a check by eye)
Built and reviewed: library screen, series cards, heart, delete, load more. See [flow-library-screen.md](flow-library-screen.md). Still to do: run it by hand on web and on a phone.

### Before going public
- Alembic migrations. Test on PostgreSQL (tests run on SQLite only).
- Rate limit: use Redis and the user id as the key (now it is per IP, in memory).
- Known limits are listed in [roadmap.md](roadmap.md).
- Privacy: children's data and voice (see below). Write a privacy policy.

## Voice cloning: what is the plan?

### Today
- It is not built. `POST /api/voice/clone` returns 501. The `voice_enabled` setting is saved but nothing uses it. See [flow-voice.md](flow-voice.md).
- Claude (the API we use) writes text. It does not make audio or clone voices. We need a separate voice provider.

### Recommended approach: two steps
1. **Phase 4 (now): device text-to-speech** with `expo-speech`. It is free and works offline. The voice is generic, not the parent's voice. This gives the "listen to the story" feature without risk.
2. **Phase 6 (later): real voice cloning** with a third-party voice service.

### Phase 6 design
Decisions from the owner: there is no provider yet. The user records the voice inside the app. Good Hebrew quality is a must-have. Everybody can record a voice.

1. **Pick a provider with a Hebrew test (a "bake-off"). Do this first. Do not choose from marketing pages.**
   - Why: Hebrew is a weak spot for many voice services. A short web check on 2026-10-06 found only vendor pages and one independent comparison from March 2025 (out of date). It rated these for Hebrew: MiniMax cloning "best", ElevenLabs v3 stock voices "good", Resemble AI and Chatterbox "poor". It did not cover Azure or Cartesia, and it did not test ElevenLabs cloning. Treat all of this as hints, not facts.
   - Notes from that check: ElevenLabs needs its newer model (v3) with the language set to Hebrew, because its older model gave unreadable Hebrew. OpenAI and Google text-to-speech do not offer voice cloning.
   - Candidates to test: ElevenLabs (v3, `language_code: "he"`), MiniMax, Azure Personal Voice (check that Hebrew is supported), and any new service found at the time.
   - Free candidates to add (found 2026-10-06, claims come from model pages, not tested by us):
     - Open-source Hebrew models you host yourself: LightBlue TTS, MamreVoice (says it can clone), a Hebrew adapter for Qwen3-TTS (clones, but needs Hebrew text turned into IPA first, for example with Phonikud). Phonikud is an open-source Hebrew pronunciation tool for TTS.
     - Costs of "free": you need a server with a GPU. Check each licence for commercial use. Check that cloning really works in Hebrew.
     - ElevenLabs free plan: 10,000 characters per month, no commercial use. Sources disagree on whether instant cloning is on the free plan. The Starter plan (about $5 per month) is said to include instant cloning. Check the current price page.
     - Device text-to-speech (`expo-speech`) is free, but it is not a cloned voice, and the Hebrew voice depends on the phone.
   - Test: record 3 different Hebrew voices (a man, a woman, an older person) with a phone, about 1 to 3 minutes each. Clone each voice with each candidate. Make audio for 5 short Hebrew children's story passages with no diacritics (nikud).
   - Judge: 2 or more native Hebrew speakers rate each clip 1 to 5 for clear words, correct stress and pronunciation, natural rhythm, and "sounds like the same person". Also test names and common words that are hard to read without nikud.
   - Pass mark (suggested): average of 4 or more, and no unreadable words. Fail means we do not ship cloning for Hebrew with that service.
   - Also compare: price per character against a typical story length, clone from a short recording, delete-voice option, where data is kept, and the terms for children's apps.
   - Save the results table in `docs/` (for example `docs/voice-provider-test.md`) and write the choice in the roadmap.
   - Fallback if no service passes in Hebrew: Hebrew stories use the best stock Hebrew voice (no cloning) and cloning stays off for Hebrew until a service passes.
2. **Everybody can record, and an account can hold several voices** (for example mom, dad, grandma). Table `voices`: `id`, `user_id`, `name`, `provider_voice_id`, `consent_at`, `created_at`. A suggested limit is 5 voices per account.
3. Backend:
   - `POST /api/voices`: receives the recording, sends it to the provider, saves the provider's voice id. Never keep the raw recording longer than needed.
   - `GET /api/voices`: lists the user's voices. `DELETE /api/voices/{id}`: deletes the voice at the provider and in our database. Also delete all voices when the account is deleted.
   - `POST /api/stories/{id}/audio` with a `voice_id`: makes the audio for a story. Cache the audio file so we pay once per story and voice.
   - Keep the provider key in `.env` only. Add a daily limit for audio, like the story quota. Handle provider errors like the Claude errors (no 500).
4. App:
   - Record screen: the user reads a short script aloud in the app. Show a level meter and a quality check (not too quiet, not too noisy).
   - Consent step before recording (see rules below). Progress state while the voice is being made.
   - Voices list in Settings: add, rename, delete. A voice picker and a play button in the story viewer. If the user has no voice, use device text-to-speech.

### Must-have rules for voice cloning
- A voice is personal (biometric) data. Ask for clear consent before recording. Explain what is stored and for how long.
- Record live in the app only. Do not accept uploaded audio files. This stops people cloning a voice from a video or a call.
- The person who speaks must be the person who agrees. Ask them to read a consent sentence aloud first (for example "I agree that DreamTale AI may make a voice from my recording"). Save the time of the consent. Check on the server that the recording is long enough and has speech. If a provider offers voice verification, use it.
- Every voice belongs to one account. Only that account can use it. Do not let other accounts use or share it.
- Let the user delete the voice at any time. Delete it when the account is deleted.
- Check the rules for children's apps and the app stores before release (for example COPPA and GDPR, and the store rules for apps for kids).
- Do not send children's names or personal details to the voice provider. Send only the story text.

### Still open before Phase 6
- Monthly budget for voice (decides which services are possible).
- Suggested limit of voices per account (5?) and of audio minutes per day.
- Who can judge the Hebrew test (2 or more native speakers)?
- Privacy policy and the age rules for the app stores.

### Update 2026-10-06: free first, the family judges
- The owner decided to start voice work with free services only. The family (native Hebrew speakers) will judge. Guide and rating page: [flow-voice-test.md](flow-voice-test.md), `tools/voice-test/`.
- This computer has no GPU (Intel UHD 620, 32 GB RAM, no ffmpeg). Open-source cloning models such as QwenTTS-he (Apache-2.0, needs Hebrew text turned into IPA first) need a GPU. A free Google Colab GPU is the likely way to try them. Not set up. Do not write code for that model from memory: read its page first.
- A free alternative that needs no cloning and no provider: **"Read it yourself"**. A parent records their reading of a story in the app (expo-audio or expo-av, check the SDK 57 docs), the app keeps the file with the story, and the child plays it in the story viewer. The real voice, perfect Hebrew, free. This fits the tagline "Magical bedtime stories in your voice". Decide this after the family test, or earlier if the owner wants it.
- Free tiers of voice services usually forbid commercial use. A test is fine. A product needs a licence that allows it.

### Update 2026-10-06 (later): "Read it yourself" is built
- The owner chose the no-cloning option. It is built: [flow-recording.md](flow-recording.md). Check it on real phones first.
- Facts found about cloning (official pages, 2026-10-06): the ElevenLabs free plan has **no voice cloning and no API**. Cloning starts at the Starter plan ($6 a month, $1 for the first month at the time). The Cartesia free plan has no cloning either (cloning from its $5 Pro plan, Hebrew support not confirmed). Chatterbox Multilingual (MIT licence, `pip install chatterbox-tts`, Python 3.11, supports Hebrew `he`, clones from a short reference file, runs on CPU but slowly) is the main free open-source option. Its output carries an inaudible watermark. Its Hebrew quality is **not verified**. An older independent test (March 2025) of the first Chatterbox found poor Hebrew, but that was before the multilingual model.
- Free cloning for **English** is easier: open-source models you run yourself (Chatterbox is MIT). Hosted free tiers do not clone. A GPU server costs money. Other open models (XTTS, F5-TTS, OpenVoice) were not checked here: read their licences before use, some forbid commercial use.
- If cloning is wanted later: install Chatterbox in its own folder (several GB), clone from a 20 to 30 second recording, let the family listen (no forms needed), and only then build the app part. Generating a story takes minutes on this computer (no GPU), so it must run in the background and be saved.

### Update 2026-10-07: English voice cloning is built
- Built and committed: [flow-cloning.md](flow-cloning.md). The voice worker is in `tools/tts-worker/` (own Python 3.11 folder, see its README). Start it before using the feature, and set `TTS_URL` in `backend/.env`.
- Real test done: 134 s of audio in 521 s, the owner said it sounds good. The sample was a synthetic practice clip.
- Next: record a real family voice in the app and listen. Check the new screens by eye. Decide what to do about speed. Hebrew cloning still needs a provider (or an open model) and the family test.
- The old dev database had an outdated `voices` table. It was renamed to `backend/dreamtale.db.backup-before-cloning` (not tracked by git). Delete the backup when you do not need it.
