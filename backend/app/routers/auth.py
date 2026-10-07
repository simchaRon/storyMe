import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..limiter import limiter
from ..config import settings
from ..models import PasswordReset, User, UserSettings
from ..schemas import ForgotIn, LoginIn, RegisterIn, ResetIn, TokenOut, UserOut
from ..services import recording_store
from ..services.mailer import Mailer, get_mailer, send_reset_email
from ..security import (
    DUMMY_HASH,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def register(request: Request, body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email is already registered")
    user = User(
        email=email,
        hashed_password=hash_password(body.password),
        preferred_language=body.preferred_language,
        settings=UserSettings(),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as e:  # two sign-ups with the same email at the same time
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email is already registered") from e
    return TokenOut(access_token=create_access_token(user.id, user.hashed_password))


@router.post("/login", response_model=TokenOut)
@limiter.limit("10/minute")
def login(request: Request, body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    # Always run one bcrypt check, so timing does not reveal which emails exist.
    ok = verify_password(body.password, user.hashed_password if user else DUMMY_HASH)
    if user is None or not ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    return TokenOut(access_token=create_access_token(user.id, user.hashed_password))


FORGOT_ANSWER = {"detail": "If this e-mail has an account, a link to choose a new password was sent."}


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
def forgot_password(
    request: Request,
    body: ForgotIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    mailer: Mailer = Depends(get_mailer),
):
    """Send a reset link by e-mail. The answer is always the same, so nobody can learn which e-mails have an account.
    The e-mail is sent in the background, so the answer time does not tell either."""
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is not None:
        now = datetime.now(timezone.utc)
        recent = db.scalar(
            select(PasswordReset.id).where(
                PasswordReset.user_id == user.id,
                PasswordReset.created_at > now - timedelta(seconds=settings.reset_cooldown_seconds),
            )
        )
        if recent is None:  # one e-mail per account per minute: nobody can flood a person's inbox
            db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))  # older links stop working
            token = secrets.token_urlsafe(32)
            db.add(
                PasswordReset(
                    user_id=user.id,
                    token_hash=_hash_token(token),
                    expires_at=now + timedelta(minutes=settings.reset_token_minutes),
                )
            )
            db.commit()
            background.add_task(send_reset_email, mailer, user.email, token, user.preferred_language)
    return FORGOT_ANSWER


@router.post("/reset-password")
@limiter.limit("10/minute")
def reset_password(request: Request, body: ResetIn, db: Session = Depends(get_db)):
    """Choose a new password with the token from the e-mail. A token works once."""
    invalid = HTTPException(status.HTTP_400_BAD_REQUEST, "This link is not valid or has expired")
    now = datetime.now(timezone.utc)
    row = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == _hash_token(body.token)))
    if row is None or row.used_at is not None or row.expires_at <= now:
        raise invalid
    # Take the token first. If two requests come together, only one gets it.
    taken = db.execute(
        update(PasswordReset).where(PasswordReset.id == row.id, PasswordReset.used_at.is_(None)).values(used_at=now)
    )
    if taken.rowcount != 1:
        db.rollback()
        raise invalid
    user = db.get(User, row.user_id)
    user.hashed_password = hash_password(body.password)
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    db.commit()
    return {"detail": "Your password was changed. You can log in now."}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = user.id
    db.delete(user)
    db.commit()
    recording_store.delete_user_folder(user_id)  # all of the user's recordings
    return Response(status_code=status.HTTP_204_NO_CONTENT)
