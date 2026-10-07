# Flow: Auth

## What
Users sign up and log in with email and password. They get a JWT token. The app sends the token on every call.

## Steps
1. `POST /api/auth/register` makes the user and default settings. It returns a token.
2. `POST /api/auth/login` checks the password. It returns a token.
3. The app sends `Authorization: Bearer <token>`.
4. `GET /api/auth/me` returns the user.
5. `DELETE /api/auth/me` deletes the account and all its stories.

## Rules
- Email is saved in lower case. A used email returns 409, also when two sign-ups arrive at the same time.
- Password: 8 to 72 bytes. bcrypt cannot use more than 72 bytes.
- Wrong email and wrong password give the same 401 message. Login always runs one bcrypt check, so timing does not show which emails exist.
- Token: HS256, expires after `JWT_EXPIRE_MINUTES`. It needs `sub` and `exp`.
- The app does not start if `JWT_SECRET` is shorter than 32 characters.
- Rate limit: 10 per minute per IP on register and login.

## Files
- `backend/app/routers/auth.py`
- `backend/app/security.py` (hashing, token, `get_current_user`)
- `backend/app/schemas.py` (`RegisterIn`, `LoginIn`, `TokenOut`, `UserOut`)
- `backend/app/limiter.py`

## Test
`cd backend` then `.venv\Scripts\python -m pytest tests/test_auth.py`
- Forgot password: `POST /api/auth/forgot-password` and `POST /api/auth/reset-password`. See [flow-password-reset.md](flow-password-reset.md).
