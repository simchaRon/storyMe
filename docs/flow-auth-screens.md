# Flow: Login and register screens

## What
One screen (`/auth`) for logging in and for creating an account. The user switches between the two with a link.

## Steps
1. The user opens the app without a valid token. `RequireAuth` redirects to `/auth`.
2. The user types an email and a password.
3. Log in calls `POST /api/auth/login`. Create account calls `POST /api/auth/register` with the current app language as `preferred_language`.
4. On success the token is saved and `/api/auth/me` is called. The user goes to the home screen.
5. A signed-in user who opens `/auth` is sent to the home screen.

## Rules
- Checked before sending: the email has an `@`. For a new account the password has 8 or more characters. Otherwise the form shows a message and sends nothing.
- Server errors are shown in the app language:
  - Login 401: "Wrong email or password."
  - Register 409: "This email is already registered."
  - No connection, too many tries (429) and others: see [flow-mobile-app.md](flow-mobile-app.md).
- Buttons are disabled while the request runs, so the form cannot be sent twice.
- The language switch is on this screen, so a user can pick Hebrew before signing up.
- The password field hides the text and is marked for password managers.

## Files
- `mobile/app/auth.tsx`
- `mobile/src/ui/RequireAuth.tsx`
- `mobile/src/auth/AuthContext.tsx`

## Test
By hand with the backend running: create an account, log out, log in, try a wrong password, try the same email twice, and switch to Hebrew on this screen.
