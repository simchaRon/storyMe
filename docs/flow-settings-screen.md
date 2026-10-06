# Flow: Settings screen

Server side of settings: [flow-settings.md](flow-settings.md).

## What
The screen at `/settings`. The user changes language, the default educational level and voice, and manages the account.

## Steps
1. The screen loads `GET /api/settings`. If that fails, it shows the error and a "try again" button.
2. Each change is shown at once and saved with `PUT /api/settings`. A short "Saving..." then "Saved" shows. If the server says no, the old value comes back and an error shows.
3. Sections:
   - Language: English / עברית. Also saves `preferred_language`.
   - Default educational level: a slider from 1 to 5. It saves when the finger is lifted. The label under it names the level.
   - Voice: a switch for `voice_enabled`, and "Test voice" which reads a sample sentence aloud in the app language.
   - Profile: the email, Log out, and Delete my account.
4. Delete my account asks "are you sure?" first. After the server deletes the account, the user goes to the login screen.

## Rules
- The voice test uses the device voice (`expo-speech`). It is not the user's own voice. That comes in a later phase. If the device has no voice for the language, a message shows.
- Speech stops when the user leaves the screen.
- The confirm box works on phones and on web.
- Only the dark theme exists. The `theme` setting is kept but not shown.
- Delete account is required by the app stores.

## Files
- `mobile/app/settings.tsx`
- `mobile/src/ui/LanguageSwitch.tsx`, `mobile/src/ui/confirm.ts`
- `mobile/src/api/client.ts` (`getSettings`, `updateSettings`, `deleteAccount`)

## Test
By hand with the backend running: change each setting, reload the page, and check it stayed. Stop the backend and change a setting: the old value must come back with an error. Test the voice in English and Hebrew. Delete a test account.
