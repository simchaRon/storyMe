# Defaults for a new story. The app shows the same values.
DEFAULT_CHILD_AGE = 6
DEFAULT_LENGTH_MINUTES = 3


def quota_units(length_minutes: int) -> int:
    """How much of the daily limit a story uses. A long story costs more to write."""
    if length_minutes <= 3:
        return 1
    if length_minutes <= 5:
        return 2
    return 3
