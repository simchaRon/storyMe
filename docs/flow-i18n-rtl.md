# Flow: Languages and right-to-left (RTL)

## What
The app speaks English (left-to-right) and Hebrew (right-to-left). The layout flips with the language.

## Steps
1. Start: `initLanguage()` picks the saved language. If none, it uses the phone language (Hebrew if the phone is Hebrew, else English).
2. The user taps English or עברית in `LanguageSwitch`. That calls `setLanguage(lang)`.
3. `setLanguage` changes the text, saves the choice, and calls `applyDirection(lang)`.
4. `applyDirection`:
   - Web: sets `dir` and `lang` on the page. Changes at once.
   - iOS and Android: sets the native direction. This only shows after the app restarts. `LanguageSwitch` then shows a note and a "Restart now" button.
5. "Restart now" calls `restartApp()`: page reload on web, a reload in development, and `expo-updates` in a real build. If it cannot restart, the note tells the user to close and open the app.

## Rules
- All text comes from `en.json` and `he.json`. Use `t('section.key')`. No text in the code.
- Both files must have the same keys. `npm test` checks this.
- Do not use `left` and `right` in styles. Use `marginStart`, `paddingEnd` and `flexDirection: 'row'`, which flip by themselves.
- Language names (English, עברית) are always shown in their own language.
- On the Settings screen a language change is also saved on the server (`preferred_language`). On the login screen it is saved on the phone only.
- RTL is always allowed on native (`allowRTL(true)`), and forced only for Hebrew.
- Not verified yet: `restartApp()` in a real production build (`expo-updates` may need EAS set up), and that react-native-web flips `flexDirection: 'row'` from the page `dir`. Check both by hand.
- The test `tests/i18n-usage.test.mjs` checks that every key used in the code exists in both languages.

## Language button on every screen
The top bar (`Header`) has a button with the name of the other language (`עברית` in English, `English` in Hebrew). One tap switches the language and the text direction, in the same way as `LanguageSwitch`. If the user is signed in, the choice is also saved (`preferred_language`). On a phone a short note with a "Restart now" button shows under the bar. The sign-in screen keeps its full `LanguageSwitch`. The loading screens of story writing have no bar.

## Files
- `mobile/src/i18n/index.ts` (`initLanguage`, `setLanguage`)
- `mobile/src/i18n/direction.ts` (`applyDirection`, language list)
- `mobile/src/i18n/en.json`, `mobile/src/i18n/he.json`
- `mobile/src/ui/LanguageSwitch.tsx`
- `mobile/src/ui/LanguageButton.tsx` and `Header.tsx`
- `mobile/tests/i18n-keys.test.mjs`

## Test
- `cd mobile`, then `npm test`.
- By hand (web): `npm run web`, tap עברית. The page must turn right-to-left and the text must be Hebrew.
- By hand (phone): switch the language, restart the app, check the direction.
