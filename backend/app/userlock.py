"""One lock per user (inside this server process).

Used where a check and a save must happen together, for example "is there room for one more
recording?". On PostgreSQL the code also locks the user row, which covers several servers.
"""

import threading

_locks: dict[int, threading.Lock] = {}
_guard = threading.Lock()


def user_lock(user_id: int) -> threading.Lock:
    with _guard:
        return _locks.setdefault(user_id, threading.Lock())
