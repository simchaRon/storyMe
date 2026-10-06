# Flow: Settings

## What
Each user has settings. The app reads them and changes them.

## Steps
1. `GET /api/settings` returns the settings. If the user has none, defaults are made.
2. `PUT /api/settings` changes only the fields you send.

## Rules
- Defaults: theme `dark`, level 2, voice off, language `en`.
- `theme`: `dark` or `light`.
- `default_educational_level`: 1 to 5. Other numbers return 422.
- `preferred_language`: `en` or `he`. It is saved on the user, not in the settings table.
- New stories use these defaults when the request does not give a level or language.

## Files
- `backend/app/routers/settings.py`
- `backend/app/models.py` (`UserSettings`)
- `backend/app/schemas.py` (`SettingsOut`, `SettingsUpdate`)

## Test
`.venv\Scripts\python -m pytest tests/test_settings.py`
