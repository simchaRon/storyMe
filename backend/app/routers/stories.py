from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..defaults import DEFAULT_CHILD_AGE, DEFAULT_LENGTH_MINUTES, quota_units
from ..limiter import limiter
from ..models import GenerationLog, Story, User, UserSettings
from ..schemas import FavoriteIn, SequelIn, StoryGenerateIn, StoryOut, StorySummaryOut
from ..security import get_current_user
from ..services.story_generator import (
    PreviousChapter,
    StoryGenerationError,
    StoryGenerator,
    get_story_generator,
)

router = APIRouter(prefix="/api/stories", tags=["stories"])


def _own_story(db: Session, user: User, story_id: int) -> Story:
    story = db.scalar(select(Story).where(Story.id == story_id, Story.user_id == user.id))
    if story is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Story not found")
    return story


def _reserve_quota(db: Session, user: User, units: int = 1) -> int:
    """Count today's Claude work and add this call. Commits, so the DB is free during the slow call.

    The count uses generation_log, not stories, so deleting stories does not give quota back.
    A longer story uses more units (see `quota_units`).
    """
    # Lock the user row, so two calls at the same time cannot both pass the check (PostgreSQL;
    # SQLite has no row locks, but it writes one request at a time).
    db.execute(select(User.id).where(User.id == user.id).with_for_update())
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    used = db.scalar(
        select(func.coalesce(func.sum(GenerationLog.units), 0)).where(
            GenerationLog.user_id == user.id, GenerationLog.created_at >= start
        )
    )
    if used + units > settings.daily_story_limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Daily story limit reached. Try again tomorrow.")
    entry = GenerationLog(user_id=user.id, units=units)
    db.add(entry)
    db.commit()
    return entry.id


def _release_quota(db: Session, log_id: int) -> None:
    """Give the quota back when Claude failed, so failures do not use up the day."""
    db.rollback()
    entry = db.get(GenerationLog, log_id)
    if entry is not None:
        db.delete(entry)
        db.commit()


def _user_defaults(db: Session, user: User) -> UserSettings:
    if user.settings is None:
        user.settings = UserSettings()
        db.commit()
    return user.settings


def _write_and_save(
    db: Session,
    log_id: int,
    generator: StoryGenerator,
    story_fields: dict,
    **generate_args,
) -> Story:
    """Call Claude, then save the story. On any failure the quota is given back."""
    try:
        result = generator.generate(**generate_args)
    except StoryGenerationError as e:
        _release_quota(db, log_id)
        raise HTTPException(e.http_status, e.message) from e
    except Exception as e:
        _release_quota(db, log_id)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not write the story. Please try again.") from e

    story = Story(
        title=result.title,
        content=result.content,
        source_reference=result.source_reference,
        **story_fields,
    )
    db.add(story)
    try:
        db.commit()
    except IntegrityError as e:  # e.g. the parent story was deleted while Claude was writing
        _release_quota(db, log_id)
        raise HTTPException(status.HTTP_409_CONFLICT, "The story changed while it was being written") from e
    return story


@router.post("/generate", response_model=StoryOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def generate(
    request: Request,
    body: StoryGenerateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    generator: StoryGenerator = Depends(get_story_generator),
):
    defaults = _user_defaults(db, user)
    level = body.educational_level or defaults.default_educational_level
    language = body.language or user.preferred_language
    child_age = body.child_age or DEFAULT_CHILD_AGE
    length_minutes = body.length_minutes or DEFAULT_LENGTH_MINUTES
    prompt = body.prompt or None
    log_id = _reserve_quota(db, user, quota_units(length_minutes))  # commits: no DB transaction is open during the Claude call

    return _write_and_save(
        db,
        log_id,
        generator,
        story_fields=dict(
            user_id=user.id,
            keywords=body.keywords,
            prompt=prompt,
            educational_level=level,
            child_age=child_age,
            length_minutes=length_minutes,
            language=language,
            is_torah_story=body.is_torah_story,
        ),
        keywords=body.keywords,
        level=level,
        language=language,
        is_torah=body.is_torah_story,
        child_age=child_age,
        length_minutes=length_minutes,
        prompt=prompt,
    )


@router.post("/sequel", response_model=StoryOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def sequel(
    request: Request,
    body: SequelIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    generator: StoryGenerator = Depends(get_story_generator),
):
    parent = _own_story(db, user, body.parent_story_id)
    keywords = body.keywords or list(parent.keywords)
    previous = PreviousChapter(title=parent.title, content=parent.content)
    fields = dict(
        user_id=user.id,
        keywords=keywords,
        educational_level=parent.educational_level,
        child_age=parent.child_age,
        length_minutes=parent.length_minutes,
        language=parent.language,
        is_torah_story=parent.is_torah_story,
        parent_story_id=parent.id,
        root_story_id=parent.root_story_id or parent.id,
        chapter_number=parent.chapter_number + 1,
    )
    log_id = _reserve_quota(db, user, quota_units(parent.length_minutes))

    return _write_and_save(
        db,
        log_id,
        generator,
        story_fields=fields,
        keywords=keywords,
        level=fields["educational_level"],
        language=fields["language"],
        is_torah=fields["is_torah_story"],
        previous=previous,
        child_age=fields["child_age"],
        length_minutes=fields["length_minutes"],
        prompt=parent.prompt or None,  # the original request, as background for the next chapter
    )


def _list(db: Session, user: User, limit: int, offset: int, favorites_only: bool):
    q = select(Story).where(Story.user_id == user.id)
    if favorites_only:
        q = q.where(Story.is_favorite.is_(True))
    q = q.order_by(Story.created_at.desc(), Story.id.desc()).limit(limit).offset(offset)
    return db.scalars(q).all()


@router.get("", response_model=list[StorySummaryOut])
def list_stories(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _list(db, user, limit, offset, favorites_only=False)


# Must be declared before "/{story_id}" so "favorites" is not read as an id.
@router.get("/favorites", response_model=list[StorySummaryOut])
def list_favorites(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _list(db, user, limit, offset, favorites_only=True)


@router.get("/{story_id}", response_model=StoryOut)
def get_story(story_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _own_story(db, user, story_id)


@router.patch("/{story_id}/favorite", response_model=StorySummaryOut)
def set_favorite(
    story_id: int, body: FavoriteIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    story = _own_story(db, user, story_id)
    story.is_favorite = body.is_favorite
    db.commit()
    return story


@router.delete("/{story_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_story(story_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    story = _own_story(db, user, story_id)
    # If this is the first chapter of a series, the next chapter becomes the new first chapter.
    # Otherwise the database would clear root_story_id and the series would fall apart.
    later = db.scalars(
        select(Story)
        .where(Story.root_story_id == story.id, Story.user_id == user.id)
        .order_by(Story.chapter_number, Story.id)
    ).all()
    if later:
        new_root, rest = later[0], later[1:]
        new_root.root_story_id = None
        for chapter in rest:
            chapter.root_story_id = new_root.id
    db.delete(story)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
