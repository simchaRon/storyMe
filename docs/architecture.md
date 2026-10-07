# Architecture

```
backend/
  app/
    main.py            App, CORS, rate limit handler, routers
    config.py          Settings from .env
    database.py        Engine, session, SQLite foreign keys on
    models.py          User, UserSettings, Story, GenerationLog (quota), UTC date type
    defaults.py        Default child age (6) and story length (3 minutes)
    middleware.py      Upload size limit, hides link signatures in logs
    textclean.py       Cleaning of text before it goes into a Claude prompt
    schemas.py         Request and response shapes
    security.py        Password hash, JWT, current user
    limiter.py         Rate limiter (slowapi)
    routers/           auth, settings, stories, voice
    services/
      story_generator.py   Talks to Claude
      recording_store.py   Audio files on disk (recordings, voice samples, cloned-voice audio)
      narrator.py          Makes a story into audio with a cloned voice (background job, safety checks)
      media_usage.py       How much audio a user keeps
  tests/               pytest. Claude is faked.
  requirements.txt
  .env.example
docs/                  These docs
tools/voice-test/      Blind rating page for the Hebrew voice test (plain HTML and JS, no install)
tools/tts-worker/      Voice worker: Chatterbox in its own Python 3.11 environment, a small web server (see its README)
```

```
mobile/                Expo app (iOS, Android, Web)
  app/                 Screens (expo-router): _layout, index (home), auth, settings, create, story/[id], record/[id], library, voices, voice/new
  src/
    api/               client.ts (calls, token), errors.ts and errorMessage.ts (error texts)
    auth/              AuthProvider and useAuth()
    i18n/              English and Hebrew text, RTL switch, restart
    ui/                Screen, Header, Logo, Card, Button, LanguageSwitch, LanguageButton, RequireAuth, confirm, TagInput, ChoiceChips, BedtimeLoader, StoryRow, SeriesCard, RecordingsCard, NarrationsCard
    keywords.ts        Keyword rules (same as the backend)
    storyOptions.ts    Age and length choices and defaults (6, 3 minutes)
    library.ts         Groups chapters into series
    speech.ts, speechText.ts   Reading aloud (voice check, short pieces)
    useSpeechRecorder.ts, useAudioPlayback.ts   One microphone hook and one shared audio player
    narration.ts, voiceSample.ts, consent.ts    Helpers for cloned-voice audio
    theme.ts           Colors, sizes, glow
    storage.ts         Safe storage helpers
  tests/               Translation tests, error mapping test
```

- The app is in `mobile/` (not `app/`) because expo-router uses an inner `app/` folder.
- Tables are made by `create_all` on start. This is for development only. Use Alembic before a real Postgres deploy.
- Each route gets one DB session. `get_current_user` uses the same one.
