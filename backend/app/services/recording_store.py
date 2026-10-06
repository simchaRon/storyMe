"""Where voice recordings are kept on disk, and checks on what is uploaded.

Files are named by the server (a random name), so a user can never choose a path.
Voice is personal data. Put the media folder on an encrypted disk, keep backups short, and see
docs/flow-voice.md for the rules.
"""

import logging
import time
import uuid
from pathlib import Path
from typing import BinaryIO, Optional

from ..config import settings

log = logging.getLogger(__name__)

CHUNK = 1024 * 1024

# Extension -> content type we send back. The type the client claims is never trusted or used.
CONTENT_TYPES = {
    "m4a": "audio/mp4",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "webm": "audio/webm",
    "ogg": "audio/ogg",
    "aac": "audio/aac",
}


class NotAudio(Exception):
    """The file does not start like audio we accept."""


class TooBig(Exception):
    """The file is bigger than allowed."""


def sniff_extension(data: bytes) -> Optional[str]:
    """Find out what kind of audio a file really is by its first bytes. None means "not audio we accept"."""
    if len(data) < 12:
        return None
    if data[4:8] == b"ftyp":  # MP4 / M4A (what phones record)
        return "m4a"
    if data[:4] == b"\x1aE\xdf\xa3":  # WebM / Matroska (what browsers record)
        return "webm"
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "wav"
    if data[:4] == b"OggS":
        return "ogg"
    if data[0] == 0xFF and data[1] in (0xF1, 0xF9):  # AAC in ADTS
        return "aac"
    if data[:3] == b"ID3" or (data[0] == 0xFF and (data[1] & 0xE0) == 0xE0 and (data[1] & 0x06) != 0):
        return "mp3"
    return None


def _root() -> Path:
    """The folder for all recordings. Not created here, so deleting never makes empty folders."""
    return Path(settings.media_dir).resolve() / "recordings"


def user_dir(user_id: int) -> Path:
    return _root() / str(int(user_id))


def save_stream(user_id: int, source: BinaryIO, max_bytes: int) -> tuple[str, int]:
    """Copy an upload to disk piece by piece (never all in memory). Returns (file name, size).

    Raises NotAudio before anything is written if the first bytes are not audio, and TooBig
    (after removing the partly written file) if the file goes over `max_bytes`.
    """
    head = source.read(64)
    extension = sniff_extension(head)
    if extension is None:
        raise NotAudio()
    folder = user_dir(user_id)
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{extension}"
    path = folder / name
    total = len(head)
    try:
        if total > max_bytes:
            raise TooBig()
        with open(path, "wb") as out:
            out.write(head)
            while True:
                chunk = source.read(CHUNK)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise TooBig()
                out.write(chunk)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return name, total


def path_for(user_id: int, file_name: str) -> Path:
    """The full path of a stored file. Refuses anything that would leave the user's folder."""
    folder = user_dir(user_id).resolve()
    path = (folder / file_name).resolve()
    if path.parent != folder:
        raise ValueError("bad file name")
    return path


def content_type_for(file_name: str) -> str:
    return CONTENT_TYPES.get(file_name.rsplit(".", 1)[-1].lower(), "application/octet-stream")


def delete_files(user_id: int, file_names: list[str]) -> None:
    """Remove files. A missing file is not an error. A real failure is logged and the rest go on.
    The start-up sweep removes anything that is left."""
    for file_name in file_names:
        try:
            path_for(user_id, file_name).unlink(missing_ok=True)
        except (ValueError, OSError):
            log.warning("Could not delete recording file %s of user %s", file_name, user_id, exc_info=True)


def delete_user_folder(user_id: int) -> None:
    folder = user_dir(user_id)
    if not folder.is_dir():
        return
    for child in folder.iterdir():
        try:
            child.unlink(missing_ok=True)
        except OSError:
            log.warning("Could not delete %s of user %s", child.name, user_id, exc_info=True)
    try:
        folder.rmdir()
    except OSError:
        log.warning("Recording folder of user %s is not empty after the delete", user_id)


def sweep_orphans(known: dict[int, set[str]], min_age_seconds: float = 3600) -> list[str]:
    """Delete recording files that no database row points to (left by a crash or a failed delete).

    `known` maps a user id to the file names that have a row. Files younger than `min_age_seconds`
    are kept, because an upload may be writing them right now. Returns the removed paths.
    """
    removed: list[str] = []
    root = _root()
    if not root.is_dir():
        return removed
    now = time.time()
    for folder in root.iterdir():
        if not folder.is_dir() or not folder.name.isdigit():
            continue
        keep = known.get(int(folder.name), set())
        for file in folder.iterdir():
            try:
                if file.is_file() and file.name not in keep and now - file.stat().st_mtime >= min_age_seconds:
                    file.unlink()
                    removed.append(str(file))
            except OSError:
                log.warning("Could not sweep %s", file, exc_info=True)
        try:
            folder.rmdir()  # only works when the folder is empty
        except OSError:
            pass
    if removed:
        log.info("Removed %d orphan recording file(s)", len(removed))
    return removed
