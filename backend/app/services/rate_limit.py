import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, status

from ..models import User
from ..security import get_current_user

# In memory, per process. Good enough for one server; use Redis if we scale out.
GENERATIONS_PER_HOUR = 10
_hits: dict[int, deque[float]] = defaultdict(deque)


def reset() -> None:
    _hits.clear()


def generation_limit(user: User = Depends(get_current_user)) -> User:
    now = time.monotonic()
    window = _hits[user.id]
    while window and now - window[0] > 3600:
        window.popleft()
    if len(window) >= GENERATIONS_PER_HOUR:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many stories. Try again later.")
    window.append(now)
    return user
