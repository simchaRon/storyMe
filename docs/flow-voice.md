# Flow: Voice (placeholder)

## What
A hook for voice cloning in the future. It is not built.

## Steps
`POST /api/voice/clone` (needs login) returns 501 "not available yet".

## Rules
- The `voice_enabled` setting is saved, but nothing uses it yet.
- Phase 4 will use device text-to-speech first.
- Decided: users record in the app, an account can hold several voices, and Hebrew quality is a must-have. The provider is not chosen. It must pass a Hebrew listening test first.
- Real voice cloning needs a third-party voice service. Claude does not make audio. The plan, privacy rules and open decisions are in [next-session-plan.md](next-session-plan.md).
- The Hebrew listening test (free services first, the family rates) is in [flow-voice-test.md](flow-voice-test.md).
- A free way to hear a story in a real voice, with no cloning, is built: [flow-recording.md](flow-recording.md).

## Files
- `backend/app/routers/voice.py`

## Test
`.venv\Scripts\python -m pytest tests/test_settings.py -k voice`
