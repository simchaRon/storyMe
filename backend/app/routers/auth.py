from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..limiter import limiter
from ..models import User, UserSettings
from ..schemas import LoginIn, RegisterIn, TokenOut, UserOut
from ..services import recording_store
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
    return TokenOut(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenOut)
@limiter.limit("10/minute")
def login(request: Request, body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    # Always run one bcrypt check, so timing does not reveal which emails exist.
    ok = verify_password(body.password, user.hashed_password if user else DUMMY_HASH)
    if user is None or not ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    return TokenOut(access_token=create_access_token(user.id))


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
