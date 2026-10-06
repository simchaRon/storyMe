# DreamTale AI (storyMe)

A bedtime story app. It writes calm stories for children with the Claude API.
It works in English (left-to-right) and Hebrew (right-to-left).

- Backend: Python, FastAPI, SQLAlchemy (SQLite for dev, PostgreSQL for prod).
- App: Expo (React Native, TypeScript, expo-router) for iOS, Android and Web, in `mobile/`.

## Setup (backend)
1. Open a terminal in `backend/`.
2. Create a virtual env: `python -m venv .venv`
3. Install: `.venv\Scripts\python -m pip install -r requirements.txt` (Windows)
4. Copy `.env.example` to `.env` and fill in:
   - `JWT_SECRET`: random text, at least 32 characters. The app will not start without it.
   - `ANTHROPIC_API_KEY`: your Claude API key.
   - `DAILY_STORY_LIMIT`: stories per user per day (default 20).
   - `MEDIA_DIR`: where voice recordings are saved (default `./media`). Put it on an encrypted disk for real use.
5. Never commit `.env`.
   The app will not start if `JWT_SECRET` is shorter than 32 characters.

## Run (backend)
- Start: `.venv\Scripts\python -m uvicorn app.main:app --reload`
- Try the API: open http://localhost:8000/docs
- Tests: `.venv\Scripts\python -m pytest`

## Setup and run (app)
1. Open a terminal in `mobile/`.
2. Install: `npm install`
3. Optional: copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` (default `http://localhost:8000`).
   Android emulator: `http://10.0.2.2:8000`. Real phone: your computer's network address.
4. Start the backend first (see above).
5. Run: `npm run web`, or `npm start` and open on a phone or emulator.
6. Tests: `npm test` (translations). Type check: `npm run typecheck`.

## Docs
See `docs/DOCS.md`.
