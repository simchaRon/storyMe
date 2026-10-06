from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, UserSettings
from ..schemas import SettingsOut, SettingsUpdate
from ..security import get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _out(user: User, s: UserSettings) -> SettingsOut:
    return SettingsOut(
        theme=s.theme,
        default_educational_level=s.default_educational_level,
        voice_enabled=s.voice_enabled,
        preferred_language=user.preferred_language,
    )


def _get_or_create(user: User, db: Session) -> UserSettings:
    if user.settings is None:
        user.settings = UserSettings()
        db.commit()
    return user.settings


@router.get("", response_model=SettingsOut)
def get_settings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _out(user, _get_or_create(user, db))


@router.put("", response_model=SettingsOut)
def update_settings(
    body: SettingsUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    s = _get_or_create(user, db)
    data = body.model_dump(exclude_unset=True, exclude_none=True)
    if "preferred_language" in data:
        user.preferred_language = data.pop("preferred_language")
    for key, value in data.items():
        setattr(s, key, value)
    db.commit()
    return _out(user, s)
