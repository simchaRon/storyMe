# API list

All paths start with `/api`. "Auth" means `Authorization: Bearer <token>`.

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | /health | no | Health check |
| POST | /auth/register | no | Make account, get token |
| POST | /auth/login | no | Get token |
| POST | /auth/forgot-password | no | Send a reset link by e-mail. Always answers 202 with the same text |
| POST | /auth/reset-password | no | Choose a new password with the token from the e-mail (body: token, password) |
| GET | /auth/me | yes | Current user |
| DELETE | /auth/me | yes | Delete account and stories |
| GET | /settings | yes | Read settings |
| PUT | /settings | yes | Change settings |
| POST | /stories/generate | yes | Make a story |
| POST | /stories/sequel | yes | Make the next chapter |
| GET | /stories | yes | List stories (`limit`, `offset`) |
| GET | /stories/favorites | yes | List favorites |
| GET | /stories/{id} | yes | One story with text |
| PATCH | /stories/{id}/favorite | yes | Set favorite on or off |
| DELETE | /stories/{id} | yes | Delete a story |
| POST | /stories/{id}/recordings | yes | Upload a recording (multipart: file, name, duration_seconds, consent) |
| GET | /stories/{id}/recordings | yes | List the recordings of a story |
| GET | /recordings/{id}/url | yes | A 5-minute link to play one recording |
| GET | /recordings/{id}/audio?sig= | link | The audio file (no login header, the signature is the proof) |
| DELETE | /recordings/{id} | yes | Delete a recording and its file |
| GET | /voices/capabilities | yes | Is voice cloning set up? Which languages? Sample length limits |
| POST | /voices | yes | Add a voice (multipart: file, name, duration_seconds, consent, consent_text_version) |
| GET | /voices | yes | List my voices |
| DELETE | /voices/{id} | yes | Delete a voice and all audio made with it |
| POST | /stories/{id}/narrations | yes | Start making an English story into audio in a voice (body: voice_id). Runs in the background |
| GET | /stories/{id}/narrations | yes | List the audio of a story, with progress |
| GET | /narrations/{id}/url | yes | A 5-minute link to play finished audio |
| GET | /narrations/{id}/audio?sig= | link | The audio file |
| DELETE | /narrations/{id} | yes | Delete the audio (stops it if it is still being made) |
| POST | /voice/clone | yes | Old placeholder (501). Use /voices |

Live docs when the server runs: http://localhost:8000/docs

Flows: [auth](flow-auth.md), [settings](flow-settings.md), [story generation](flow-story-generation.md), [sequel](flow-sequel.md), [stories](flow-stories.md), [story prompt](flow-story-prompt.md), [voice](flow-voice.md).
Recordings: [read it yourself](flow-recording.md). Voice cloning: [flow-cloning.md](flow-cloning.md).
