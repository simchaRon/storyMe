import hashlib
import hmac
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import User

ALGORITHM = "HS256"
bearer = HTTPBearer(auto_error=False)

# A real hash to check against when the email is unknown. Keeps login timing equal.
DUMMY_HASH = bcrypt.hashpw(b"dummy-password", bcrypt.gensalt()).decode()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode())
    except ValueError:
        return False


def _password_version(hashed_password: str) -> str:
    """A short fingerprint of the password hash. It changes when the password changes."""
    return hashlib.sha256(hashed_password.encode("utf-8")).hexdigest()[:16]


def create_access_token(user_id: int, password_hash: str | None = None) -> str:
    """The login token. With `password_hash` it also carries the password fingerprint ("pwv"):
    after a password reset, tokens made before the reset stop working."""
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    claims = {"sub": str(user_id), "exp": exp}
    if password_hash is not None:
        claims["pwv"] = _password_version(password_hash)
    return jwt.encode(claims, settings.jwt_secret, algorithm=ALGORITHM)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED, "Invalid or missing token", headers={"WWW-Authenticate": "Bearer"}
    )
    if creds is None:
        raise unauthorized
    try:
        payload = jwt.decode(
            creds.credentials,
            settings.jwt_secret,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, ValueError):
        raise unauthorized
    user = db.get(User, user_id)
    if user is None:
        raise unauthorized
    pwv = payload.get("pwv")
    if pwv is not None and not hmac.compare_digest(str(pwv), _password_version(user.hashed_password)):
        raise unauthorized  # the password was changed after this token was made
    return user


# A recording link must stay valid while the audio plays (the player asks for pieces of the file),
# but not much longer: the signature is in the address.
AUDIO_TOKEN_MINUTES = 5
# A link works for one kind of audio only: a recording link cannot open a narration and the other way round.


def _audio_key() -> str:
    """A key made from the login secret, but different from it. A leaked link cannot be used to guess
    the login secret, and a login token can never be a recording link."""
    return hmac.new(settings.jwt_secret.encode(), b"dreamtale/recording-audio/v1", hashlib.sha256).hexdigest()


def create_audio_token(item_id: int, user_id: int, kind: str = "recording") -> str:
    """A short-lived signature for one audio file ("recording" or "narration"). It lets an audio player
    fetch the file without an Authorization header (web players cannot send one). It is not an access
    token: it has no `sub`."""
    exp = datetime.now(timezone.utc) + timedelta(minutes=AUDIO_TOKEN_MINUTES)
    payload = {"purpose": f"{kind}-audio", "rec": item_id, "uid": user_id, "exp": exp}
    return jwt.encode(payload, _audio_key(), algorithm=ALGORITHM)


def check_audio_token(token: str, item_id: int, kind: str = "recording") -> int:
    """Returns the user id the token was made for, or raises 403."""
    forbidden = HTTPException(status.HTTP_403_FORBIDDEN, "This link is not valid or has expired")
    try:
        payload = jwt.decode(
            token, _audio_key(), algorithms=[ALGORITHM], options={"require": ["exp", "rec", "uid", "purpose"]}
        )
        if payload["purpose"] != f"{kind}-audio" or payload["rec"] != item_id:
            raise forbidden
        return int(payload["uid"])
    except (jwt.PyJWTError, ValueError, TypeError):
        raise forbidden
