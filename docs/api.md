# API list

All paths start with `/api`. "Auth" means `Authorization: Bearer <token>`.

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | /health | no | Health check |
| POST | /auth/register | no | Make account, get token |
| POST | /auth/login | no | Get token |
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
| POST | /voice/clone | yes | Not built (501) |

Live docs when the server runs: http://localhost:8000/docs

Flows: [auth](flow-auth.md), [settings](flow-settings.md), [story generation](flow-story-generation.md), [sequel](flow-sequel.md), [stories](flow-stories.md), [story prompt](flow-story-prompt.md), [voice](flow-voice.md).
