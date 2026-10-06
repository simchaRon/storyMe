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


def create_access_token(user_id: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode({"sub": str(user_id), "exp": exp}, settings.jwt_secret, algorithm=ALGORITHM)


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
    return user


# A recording link must stay valid while the audio plays (the player asks for pieces of the file),
# but not much longer: the signature is in the address.
AUDIO_TOKEN_MINUTES = 5
_AUDIO_PURPOSE = "recording-audio"


def _audio_key() -> str:
    """A key made from the login secret, but different from it. A leaked link cannot be used to guess
    the login secret, and a login token can never be a recording link."""
    return hmac.new(settings.jwt_secret.encode(), b"dreamtale/recording-audio/v1", hashlib.sha256).hexdigest()


def create_audio_token(recording_id: int, user_id: int) -> str:
    """A short-lived signature for one recording. It lets an audio player fetch the file without an
    Authorization header (web players cannot send one). It is not an access token: it has no `sub`."""
    exp = datetime.now(timezone.utc) + timedelta(minutes=AUDIO_TOKEN_MINUTES)
    payload = {"purpose": _AUDIO_PURPOSE, "rec": recording_id, "uid": user_id, "exp": exp}
    return jwt.encode(payload, _audio_key(), algorithm=ALGORITHM)


def check_audio_token(token: str, recording_id: int) -> int:
    """Returns the user id the token was made for, or raises 403."""
    forbidden = HTTPException(status.HTTP_403_FORBIDDEN, "This link is not valid or has expired")
    try:
        payload = jwt.decode(
            token, _audio_key(), algorithms=[ALGORITHM], options={"require": ["exp", "rec", "uid", "purpose"]}
        )
        if payload["purpose"] != _AUDIO_PURPOSE or payload["rec"] != recording_id:
            raise forbidden
        return int(payload["uid"])
    except (jwt.PyJWTError, ValueError, TypeError):
        raise forbidden
