from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

is_sqlite = settings.database_url.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}
engine = create_engine(settings.database_url, connect_args=connect_args)

if is_sqlite:

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added after the first version. `create_all` only makes new tables, so an old database file
# would miss them. This adds them (development convenience; use Alembic before a real deploy).
_ADDED_COLUMNS = [
    ("stories", "child_age", "INTEGER NOT NULL DEFAULT 6"),
    ("stories", "length_minutes", "INTEGER NOT NULL DEFAULT 3"),
    ("stories", "prompt", "TEXT"),
    ("generation_log", "units", "INTEGER NOT NULL DEFAULT 1"),
]


def add_missing_columns(bind) -> list[str]:
    """Add the columns above if they are missing. Returns the names that were added.

    Every column is added in its own transaction. If two servers start at the same time, the second
    one may find the column already there. That is fine, so the error is ignored when the column exists.
    """
    added = []
    tables = set(inspect(bind).get_table_names())
    for table, column, ddl in _ADDED_COLUMNS:
        if table not in tables:
            continue
        if column in {c["name"] for c in inspect(bind).get_columns(table)}:
            continue
        try:
            with bind.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            added.append(f"{table}.{column}")
        except (OperationalError, ProgrammingError):
            # Someone else added it a moment ago. Anything else is a real error.
            if column not in {c["name"] for c in inspect(bind).get_columns(table)}:
                raise
    return added
