# Architecture

```
backend/
  app/
    main.py            App, CORS, rate limit handler, routers
    config.py          Settings from .env
    database.py        Engine, session, SQLite foreign keys on
    models.py          User, UserSettings, Story, GenerationLog (quota), UTC date type
    defaults.py        Default child age (6) and story length (3 minutes)
    schemas.py         Request and response shapes
    security.py        Password hash, JWT, current user
    limiter.py         Rate limiter (slowapi)
    routers/           auth, settings, stories, voice
    services/
      story_generator.py   Talks to Claude
  tests/               pytest. Claude is faked.
  requirements.txt
  .env.example
docs/                  These docs
```

```
mobile/                Expo app (iOS, Android, Web)
  app/                 Screens (expo-router): _layout, index (home), auth, settings, create, story/[id], library
  src/
    api/               client.ts (calls, token), errors.ts and errorMessage.ts (error texts)
    auth/              AuthProvider and useAuth()
    i18n/              English and Hebrew text, RTL switch, restart
    ui/                Screen, Header, Logo, Card, Button, LanguageSwitch, RequireAuth, confirm, TagInput, ChoiceChips, BedtimeLoader, StoryRow, SeriesCard
    keywords.ts        Keyword rules (same as the backend)
    storyOptions.ts    Age and length choices and defaults (6, 3 minutes)
    library.ts         Groups chapters into series
    speech.ts, speechText.ts   Reading aloud (voice check, short pieces)
    theme.ts           Colors, sizes, glow
    storage.ts         Safe storage helpers
  tests/               Translation tests, error mapping test
```

- The app is in `mobile/` (not `app/`) because expo-router uses an inner `app/` folder.
- Tables are made by `create_all` on start. This is for development only. Use Alembic before a real Postgres deploy.
- Each route gets one DB session. `get_current_user` uses the same one.
