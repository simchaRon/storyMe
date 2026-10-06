# Flow: Read it yourself (voice recordings)

## What
A person reads a story aloud in the app. The recording is saved with the story. Later the child can play it, in the real voice of Mom, Dad or Grandma. It is free, it is perfect in Hebrew, and there is no voice cloning and no voice provider.

## Steps
1. On the story screen, the "Voices" card shows the recordings of this story. Tap **Record your voice**.
2. The record screen shows the story text to read from. The user writes whose voice it is (for example "Mom") and turns on the consent switch: "The person reading agrees to be recorded, and that the recording is kept in this app."
3. Tap **Start recording**. The phone asks for the microphone the first time. Read the story calmly. Tap **Stop**. (It also stops by itself after 20 minutes.)
4. The user can **Play** the recording, **Record again**, or **Save**. A recording shorter than 3 seconds is refused.
5. Save uploads the file (`POST /api/stories/{id}/recordings`). The app goes back to the story screen. The new voice is in the list.
6. Tap **Play** on a voice. The app asks the server for a short-lived link (`GET /api/recordings/{id}/url`) and plays it. Tap **Stop** to stop. **Delete** removes the recording (it asks first).

## Rules
- A story can have up to 5 recordings (`MAX_RECORDINGS_PER_STORY` in the code). One recording is up to 25 MB (about 20 minutes). One user can keep up to 300 MB in total.
- **Consent:** the server refuses a recording unless consent is sent. It stores the time and the version of the consent text (`2026-10-v1`). Change the version when the text on the record screen changes.
- **Only the owner:** every call checks that the story or recording belongs to the logged-in user. Others get 404.
- **What is stored:** the server only accepts real audio. It looks at the first bytes of the file (m4a, webm, wav, mp3, ogg, aac), not at the name or the type the app claims. The file gets a random name. The user never chooses a path.
- **Size is limited while the upload arrives** (`MaxBodySizeMiddleware`), before the login check and also for uploads with no size header. Without this, anyone could fill the disk. In production also set the web server limit, for example `client_max_body_size 26m;` in nginx.
- **Play link:** the link has a signature in the address, valid for 5 minutes, for one recording and one user. It is made with a key that is different from the login secret. The server writes the link into its log without the signature (`sig=REDACTED`). The answer carries `Referrer-Policy: no-referrer`, `nosniff`, and a sandbox policy. A login token is never a play link and a play link is never a login token.
- **Delete:** deleting a recording, a story or the account removes the files too. If a file cannot be removed, the problem is logged and the delete goes on. When the server starts, it removes files that no recording points to and are older than 1 hour (`sweep_orphans`).
- **On the phone:** the temporary recording file is deleted after it was saved, after "Record again", and when the user leaves the screen. The microphone is stopped when the user leaves the screen, even while it was still getting ready.
- Playing a recording stops the device voice ("Read aloud") and the other way round. Leaving the story screen (for example to record) stops a playing recording. If a recording does not start in 15 seconds, the app shows "Could not play the recording".

## Privacy and operations (read before going public)
- A voice is personal data, and these are family voices. Tell users what is kept, for how long (until they delete it) and where.
- Files are **not encrypted by the app**. Put `MEDIA_DIR` on an encrypted disk or volume. Keep backups short, because a backup keeps a deleted voice until the backup expires. Write the backup time in the privacy policy.
- `MEDIA_DIR` (default `./media` next to the backend) is ignored by git. On a server, point it to storage that is not deleted when the app is updated.
- Moving to object storage (S3 and similar) is a later task. The code that touches files is in `services/recording_store.py`.
- A privacy policy and an age rule for the app stores are still needed.

## Known limits
- The per-user lock that stops parallel uploads from passing the limits works inside one server process. On PostgreSQL the user row is also locked, which covers several servers.
- A weak connection can time out after the server already saved the recording. The user taps Save again and gets a second copy. They can delete one. There is no "same upload" key yet.
- Only the first bytes of the file are checked. A strange file that starts like audio would be accepted, but it is only ever served as audio with a sandbox policy, and only to its owner.
- Not tested on a real phone yet, only by code. Please test on iPhone and Android: record, play, record again, leave in the middle of recording, deny the microphone.
- The recording is not a clone. Each new story needs a new reading.

## Files
- Server: `backend/app/routers/recordings.py`, `backend/app/services/recording_store.py`, `backend/app/middleware.py`, `backend/app/security.py` (`create_audio_token`, `check_audio_token`), `backend/app/models.py` (`StoryRecording`).
- App: `mobile/app/record/[id].tsx`, `mobile/src/ui/RecordingsCard.tsx`, `mobile/src/recordingFile.ts`, `mobile/src/audioFormat.ts`, `mobile/src/api/client.ts`.
- Settings: `MEDIA_DIR`, `MAX_RECORDING_MB`, `MAX_RECORDINGS_PER_STORY`, `MAX_USER_MEDIA_MB` (see `backend/app/config.py`).

## Test
- Server: `cd backend`, then `.venv\Scripts\python -m pytest tests/test_recordings.py` (44 tests: upload rules, a huge upload with no login, parallel uploads, play links, Range requests, deletes, orphan sweep, log redaction).
- App: `cd mobile`, then `npm test` and `npm run typecheck`.
- By hand (phone and web), with the backend running: make a story, record it, play it, record a second voice, delete one, delete the story and check the folder `backend/media/recordings` is empty, delete the account.
