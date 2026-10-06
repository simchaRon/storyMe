# Flow: Mobile app (base)

## What
The Expo app in `mobile/`. One code base for iOS, Android and Web. This file covers startup, the API client and error messages. Screens: [flow-auth-screens.md](flow-auth-screens.md), [flow-settings-screen.md](flow-settings-screen.md).

## Steps (what happens at start)
1. `app/_layout.tsx` runs `initLanguage()`. It loads the saved language, or the phone language, and sets the layout direction. If this fails, the app still starts in English.
2. A loading spinner shows until that is done.
3. `AuthProvider` loads the saved token and calls `GET /api/auth/me`. The status becomes:
   - `signedIn`: the server accepted the token.
   - `signedOut`: no token, or the server said 401 (the token is deleted).
   - `offline`: the server could not be reached, or it had an error. The token is kept. The user sees a "try again" screen and is not asked to log in again.
4. Each screen that needs a user is wrapped in `RequireAuth`. It shows a spinner, redirects to `/auth`, or shows the offline screen.

## Rules
- API address comes from `EXPO_PUBLIC_API_URL`.
- Every request stops after 15 seconds and counts as "cannot reach the server".
- A 401 signs the user out only if the token that failed is still the current one. An old request cannot log out someone who just signed in again.
- The token is kept in the secure store on phones. On web it is in local storage. Any script on the page can read it, so keep the web app free of third-party scripts. A safer web login (cookie) is a later task.
- Error messages are translated. `src/api/errors.ts` maps an HTTP status to a text key (0 = no connection, 401, 404 only when a screen gives it a text, 408 = the app gave up waiting, 409, 422, 429, 502/503, 504, 5xx). A screen can give a better text for one status, for example 401 on the login form or 404 for "no Torah story" on the create screen.
- The server's English `detail` text is never shown to users.
- Storage errors never crash the app. In development they are printed.

## Test on a real phone ("cannot reach the server")
1. The phone and the computer must be on the same Wi-Fi.
2. Find the computer's Wi-Fi address: PowerShell `Get-NetIPAddress -AddressFamily IPv4` (use the Wi-Fi one, not `127.0.0.1`). Do not use your public internet address.
3. Create `mobile/.env` (not `.env.example`, the app only reads `.env`) with `EXPO_PUBLIC_API_URL=http://<that address>:8000`.
4. Start the backend so it listens on the network: `.venv\Scripts\python -m uvicorn app.main:app --reload --host 0.0.0.0`.
5. Allow port 8000 in Windows Firewall (PowerShell as Administrator): `New-NetFirewallRule -DisplayName "DreamTale dev 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private`. Remove it when you stop testing: `Remove-NetFirewallRule -DisplayName "DreamTale dev 8000"`.
6. Restart the app server with a clean cache, because `EXPO_PUBLIC_*` values are built into the bundle: `npx expo start -c`.
7. Check from the phone browser: open `http://<that address>:8000/api/health`. It must show `{"status":"ok"}`. If not, the problem is the network or the firewall, not the app.
- Some Wi-Fi networks (guest, school, office) block phone-to-computer traffic. Use a home network or a phone hotspot.
- Android emulator: use `http://10.0.2.2:8000`.

## Files
- `mobile/app/_layout.tsx`: startup.
- `mobile/src/api/client.ts`: `fetch` wrapper, token, `ApiError`, all API calls.
- `mobile/src/api/errors.ts`, `mobile/src/api/errorMessage.ts`: error to text.
- `mobile/src/auth/AuthContext.tsx`: `useAuth()` with `status`, `user`, `signIn`, `signOut`, `retry`.
- `mobile/src/ui/RequireAuth.tsx`: guard for screens.
- `mobile/src/storage.ts`: storage helpers.

## Test
- `cd mobile`, then `npm run typecheck` and `npm test`.
- Build check: `npx expo export --platform web --output-dir ../.tmp-export` (delete the folder after).
- By hand: start the backend, run `npm run web`. Stop the backend and reload: you should see the offline screen, not the login screen.
