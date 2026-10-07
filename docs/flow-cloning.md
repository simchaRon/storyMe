# Flow: Voice cloning (English)

## What
A person records a short voice sample in the app. Later, a cloned copy of that voice reads an English story made in the app. Hebrew is not supported.

It is free. The voice is made by [Chatterbox](https://github.com/resemble-ai/chatterbox) (open source, MIT licence) in a separate program, the voice worker, on your own computer. Voice samples never go to another company.

## Status (read this first)
- Built and tested with a fake voice model: backend, worker, app.
- **Real model (Chatterbox Turbo, CPU only, 4 threads) ran once on 2026-10-07.** Load 28 s, prepare a voice 20 s, then 4.8 s of audio took 18 s (about 3.7 s of work per second of audio). A 5-minute story would take about 20 minutes. The second timing was broken by a clock jump and is ignored. The voice quality was **not listened to yet**: the family should judge it.
- **Full run through the backend (2026-10-07):** a 1966-character story (23 pieces) became 134 s of audio in 521 s (about 3.9 s of work per second of audio). The file is 6.4 MB. The voice sample was a synthetic practice clip, not a real person. Listening to the result: not yet judged. Tested with a fresh database, because an old dev database had an outdated `voices` table (`create_all` does not change tables; delete `backend/dreamtale.db` or use a new `DATABASE_URL` when the models change).
- Setup note: the worker needs `setuptools<81` (the watermark library needs `pkg_resources`). Without it the model fails to load with "NoneType object is not callable".

## Steps
1. The user opens Settings, then "My voices", then adds a voice.
2. The user reads the on-screen English text for 10 to 120 seconds. The user must tick the consent box. The app sends the file, the name, the length and the consent text version.
3. The backend asks the worker for the real length, refuses a sample that was already used, and saves the file.
4. On an English story the user opens "Read in a cloned voice" and taps "Make audio" for a voice.
5. The backend checks the story, then starts a background job. The job cuts the text into pieces of about 250 characters, sends each piece to the worker, and joins the sounds into one WAV file.
6. The app shows progress. When done, the user plays the audio. The play link works for 5 minutes.

## Safety rules
- Consent is required, and the consent text version is saved. Consent is only a tick box. It is **not** checked against the voice.
- Only the user's own stories can be made into audio, and only in English.
- The story text is checked twice before audio is made:
  - Plain code refuses links, e-mail addresses, phone numbers, and text copied from the user's own request (60 characters or more).
  - A second Claude check. If it fails or is unsure, the audio is refused.
- One audio job at a time per user. A daily limit per user (a failed job is refunded only if it failed before the first piece).
- Limits on job time, text size, number of pieces and file size.
- A worker on another computer must have an API key. The play links are signed and last 5 minutes.
- Deleting a voice deletes all audio made with it. Deleting a story deletes its audio. Deleting the account deletes everything. A daily sweep removes files with no database row.
- Every sound carries an inaudible watermark (Perth).

## Settings (backend `.env`)
`TTS_URL`, `TTS_API_KEY`, and the limits in `backend/app/config.py`: `max_voices_per_user` (3), `max_voice_sample_mb` (10), `daily_narration_limit` (5), `max_narration_chars` (12000), `max_narration_pieces` (80), `narration_deadline_minutes` (60), `max_worker_response_mb` (30). Leave `TTS_URL` empty to turn cloning off.

## Known limits
- Anyone could record someone else's voice and tick the box. Checking the speaker or the spoken consent is not built.
- On a computer without a graphics card the voice is made slowly. A long story can take a long time. Ideas: a shorter story, a smaller model, a cloud GPU.
- The audio is a WAV file. It is large.
- Files on disk are not encrypted. Use an encrypted disk for real use.

## Files
- Backend: `backend/app/routers/cloning.py`, `services/narrator.py`, `services/recording_store.py`, `services/media_usage.py`, `userlock.py`, `security.py` (signed links), `models.py` (Voice, Narration, NarrationLog)
- Worker: `tools/tts-worker/` (see its README)
- App: `mobile/app/voices.tsx`, `mobile/app/voice/new.tsx`, `mobile/src/ui/NarrationsCard.tsx`, `useSpeechRecorder.ts`, `useAudioPlayback.ts`, `narration.ts`, `voiceSample.ts`, `consent.ts`

## Test
- Backend: `.venv\Scripts\python -m pytest tests/test_cloning.py` (in `backend`)
- Worker: `.venv\Scripts\python -m pytest test_server.py` (in `tools/tts-worker`)
- App: `npm test` (in `mobile`)
- Real run: see `tools/tts-worker/README.md`.
