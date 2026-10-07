# Flow: Forgot password

## What
A user who forgot the password asks for a link by e-mail. The link opens a page where they choose a new password.

The app has no user names. The user logs in with an e-mail address, so the reset also uses the e-mail.

## Steps
1. On the login screen the user taps **Forgot your password?** (it is always shown in login mode).
2. The screen `/forgot-password` asks for the e-mail and calls `POST /api/auth/forgot-password`.
3. The screen always shows the same message: "If this email has an account, a link was sent." It never says if the e-mail exists.
4. If the account exists, the backend makes a random token, saves only its **hash**, and sends an e-mail in the background. The link is `<APP_BASE_URL>/reset-password?token=...`. The e-mail is in the language of the account (English or Hebrew).
5. The link opens the screen `/reset-password`. The user types the new password twice. The app calls `POST /api/auth/reset-password`.
6. The backend checks the token, saves the new password (bcrypt), and deletes all reset links of that user. The user logs in with the new password.

## Rules
- The answer of `forgot-password` is always the same (202), so nobody can find out which e-mails have an account. The e-mail is sent in the background, so the answer time does not tell either.
- The token is random (32 bytes). Only its SHA-256 hash is in the database. A stolen database cannot reset a password.
- A link works **once** and for 30 minutes (`RESET_TOKEN_MINUTES`). Two requests at the same moment cannot both use it.
- A new request cancels the older link.
- One reset e-mail per account per minute (`RESET_COOLDOWN_SECONDS`), so nobody can flood a person's inbox. The IP limits are 5 requests per minute for `forgot-password` and 10 for `reset-password`.
- The new password follows the same rules as at sign-up (8 to 72 bytes).
- After a reset, the login tokens that were made before it stop working. A token carries a short fingerprint of the password hash (`pwv`), and the server compares it. Tokens from before this feature have no fingerprint and keep working until they expire.
- A mail error is only written to the log. The user still gets the same answer.
- Deleting the account deletes its reset links.

## Set up the e-mail
In `backend/.env`:
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=DreamTale AI <no-reply@example.com>
APP_BASE_URL=http://localhost:8081
```
- Use any SMTP service. For a family test, a Gmail account with an "app password" works. Never put the password in docs or in git.
- `APP_BASE_URL` is where the web app is. The link in the e-mail points there. The reset page opens in the browser (the web version of the app). A deep link into the phone app (scheme `dreamtale://`) is not done.
- With no `SMTP_HOST`, nothing is sent. For local tests only, set `DEV_LOG_RESET_LINKS=true`: the e-mail, with the link, is written to the backend log (`backend-dev.log` if you started it that way). Do not use this in production.

## Files
- Backend: `backend/app/routers/auth.py`, `backend/app/services/mailer.py`, `backend/app/models.py` (`PasswordReset`), `backend/app/security.py` (`pwv`), `backend/app/schemas.py`, `backend/app/config.py`
- App: `mobile/app/forgot-password.tsx`, `mobile/app/reset-password.tsx`, `mobile/app/auth.tsx` (the link), `mobile/src/api/client.ts`

## Test
- Backend: `.venv\Scripts\python -m pytest tests/test_password_reset.py` (14 tests: same answer for unknown e-mail, one use, expiry, cooldown, old logins stop, language of the e-mail, and more).
- By hand: set `DEV_LOG_RESET_LINKS=true`, restart the backend, tap "Forgot your password?", find the link in the log, open it, choose a new password, log in.

## Known limits
- Not tried with a real SMTP server yet.
- The link opens in the browser, not in the phone app.
- The rate limit is per IP and in memory (see the known limits in the [roadmap](roadmap.md)).
