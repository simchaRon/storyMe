"""An old database file (made before child_age and length_minutes existed) must be upgraded."""

from sqlalchemy import create_engine, inspect, text

from app.database import add_missing_columns


def test_old_stories_table_gets_the_new_columns():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE stories (id INTEGER PRIMARY KEY, title VARCHAR(255))"))
        conn.execute(text("INSERT INTO stories (id, title) VALUES (1, 'old story')"))
        conn.execute(text("CREATE TABLE generation_log (id INTEGER PRIMARY KEY, user_id INTEGER)"))
        conn.execute(text("INSERT INTO generation_log (id, user_id) VALUES (1, 1)"))

    added = add_missing_columns(engine)

    assert added == ["stories.child_age", "stories.length_minutes", "stories.prompt", "generation_log.units"]
    with engine.connect() as conn:
        row = conn.execute(text("SELECT title, child_age, length_minutes, prompt FROM stories")).one()
    assert tuple(row) == ("old story", 6, 3, None)  # old stories get the defaults

    with engine.connect() as conn:
        assert conn.execute(text("SELECT units FROM generation_log")).scalar_one() == 1  # old rows count as 1

    # Running it again changes nothing.
    assert add_missing_columns(engine) == []
    assert {c["name"] for c in inspect(engine).get_columns("stories")} >= {"child_age", "length_minutes", "prompt"}


def test_missing_table_is_ignored():
    assert add_missing_columns(create_engine("sqlite://")) == []


def test_two_servers_starting_together_do_not_crash(monkeypatch):
    """The second server may look, see a column missing, and then find that the first server just added it.

    We copy that: the first look at each table hides the new columns, but they are really there, so
    the ALTER TABLE fails with "duplicate column". That must not crash the start.
    """
    import app.database as database

    engine = create_engine("sqlite://")
    assert database.add_missing_columns(engine) == []  # no tables yet: nothing to do
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE stories (id INTEGER PRIMARY KEY, title VARCHAR(255))"))
        conn.execute(text("CREATE TABLE generation_log (id INTEGER PRIMARY KEY, user_id INTEGER)"))
    assert len(database.add_missing_columns(engine)) == 4  # the "first server" adds everything

    real_inspect = database.inspect
    attempts = []
    seen_tables = set()

    class HidesNewColumnsAtFirstLook:
        def __init__(self, real):
            self.real = real

        def get_table_names(self):
            return self.real.get_table_names()

        def get_columns(self, table):
            columns = self.real.get_columns(table)
            if table not in seen_tables:
                seen_tables.add(table)
                attempts.append(table)
                return [c for c in columns if c["name"] in ("id", "title", "user_id")]
            return columns

    monkeypatch.setattr(database, "inspect", lambda bind: HidesNewColumnsAtFirstLook(real_inspect(bind)))
    assert database.add_missing_columns(engine) == []  # did not crash, and added nothing new
    assert attempts == ["stories", "generation_log"]  # we really did try to add them again
