"""Make a story into audio with a cloned voice. It runs in the background and can take minutes.

The heavy work (the voice model) is done by a separate "voice worker" program (tools/tts-worker),
so the backend stays small. The backend sends the voice sample and one piece of text at a time,
saves the pieces, joins them, and shows progress.

What protects people from misuse (a cloned voice can be used to deceive):
- Only the text of a story the app wrote is read. But the story is written by Claude from the user's own
  words, so it is checked again before it is read aloud: a plain-code check (links, e-mail addresses,
  phone numbers, and text copied word for word from the user's request) and a second Claude check
  ("is this a message to a real person, a request for money, personal data ...?").
- A job has a time limit, a size limit and a limit on the number of pieces.
"""

import hashlib
import io
import logging
import re
import time
import wave
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Callable, Optional, Protocol

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal
from ..models import Narration, NarrationLog, Story, Voice
from ..textclean import clean_free_text
from . import recording_store

log = logging.getLogger(__name__)

PIECE_CHARS = 250  # one piece of text is about 15 seconds of speech
PAUSE_SECONDS = 0.4  # silence between pieces
SAFE_ERROR = "Could not make the audio. Please try again."
CANNOT_READ = "This story cannot be read in a cloned voice."

# What the voice worker sends back. We refuse anything else.
AUDIO_RATE_MIN, AUDIO_RATE_MAX = 8000, 48000
MAX_JOINED_BYTES = 400 * 1024 * 1024


class TtsError(Exception):
    """The voice worker could not make a piece. `message` is safe to show to the user."""

    def __init__(self, message: str = SAFE_ERROR):
        super().__init__(message)
        self.message = message


class TtsClient(Protocol):
    def synthesize(self, reference: bytes, text: str, language: str) -> bytes:
        """Say `text` in the voice of `reference` (a recording). Returns a WAV file."""
        ...

    def inspect(self, reference: bytes) -> float:
        """How many seconds of sound the recording really has."""
        ...


class HttpTtsClient:
    """Talks to the voice worker over HTTP (settings.tts_url). Make one for each job.

    The voice sample is sent with the first piece only. The next pieces send just its fingerprint, and
    the worker keeps the voice ready. If the worker lost it, it says so and the sample is sent again.
    """

    def __init__(self) -> None:
        self._sent: set[str] = set()

    def _post(self, path: str, files: Optional[dict], data: dict) -> tuple[int, bytes, str]:
        headers = {"X-Api-Key": settings.tts_api_key} if settings.tts_api_key else {}
        limit = settings.max_worker_response_mb * 1024 * 1024
        # The timeout is for each wait (connect, read, write). The total time of a job is limited in the runner.
        timeout = httpx.Timeout(settings.tts_timeout_seconds, connect=5.0)
        try:
            with httpx.stream(
                "POST", f"{settings.tts_url.rstrip('/')}{path}", files=files, data=data, headers=headers, timeout=timeout
            ) as response:
                body = bytearray()
                for chunk in response.iter_bytes():
                    body += chunk
                    if len(body) > limit:  # a broken or hijacked worker must not fill the memory
                        log.warning("Voice worker answer is bigger than %s MB", settings.max_worker_response_mb)
                        raise TtsError()
                return response.status_code, bytes(body), response.headers.get("content-type", "")
        except TtsError:
            raise
        except httpx.TimeoutException:
            raise TtsError("The voice worker took too long. Please try again.")
        except httpx.HTTPError:
            raise TtsError("The voice worker is not reachable. Please try again later.")

    def synthesize(self, reference: bytes, text: str, language: str) -> bytes:
        reference_id = hashlib.sha256(reference).hexdigest()
        send_file = reference_id not in self._sent
        for _attempt in range(2):
            files = {"reference": ("reference.bin", reference, "application/octet-stream")} if send_file else None
            status, body, content_type = self._post(
                "/synthesize", files, {"text": text, "language": language, "reference_id": reference_id}
            )
            if status == 409 and not send_file:  # the worker does not have this voice any more
                send_file = True
                continue
            break
        if status == 422:
            raise TtsError("This voice sample could not be used. Please record a new one.")
        if status != 200 or "audio" not in content_type:
            log.warning("Voice worker answered %s", status)
            raise TtsError()
        self._sent.add(reference_id)
        return body

    def inspect(self, reference: bytes) -> float:
        status, body, content_type = self._post(
            "/inspect", {"reference": ("reference.bin", reference, "application/octet-stream")}, {}
        )
        if status == 422:
            raise TtsError("This is not a voice recording we can use.")
        if status != 200 or "json" not in content_type:
            raise TtsError()
        try:
            import json

            return float(json.loads(body)["seconds"])
        except (ValueError, KeyError, TypeError):
            raise TtsError()


# ---------------------------------------------------------------- text and audio helpers
def _cut_at_spaces(text: str, limit: int) -> list[str]:
    out, current = [], ""
    for word in text.split():
        if current and len(current) + 1 + len(word) > limit:
            out.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()
    if current:
        out.append(current)
    return out


def split_for_tts(text: str, limit: int = PIECE_CHARS) -> list[str]:
    """Cut a story into short pieces, at paragraph and sentence ends, so each piece is easy to say."""
    pieces: list[str] = []
    for paragraph in re.split(r"\n{2,}", text):
        paragraph = " ".join(paragraph.split())
        if not paragraph:
            continue
        if len(paragraph) <= limit:
            pieces.append(paragraph)
            continue
        current = ""
        for sentence in re.findall(r"[^.!?]+(?:[.!?]+|$)\s*", paragraph) or [paragraph]:
            sentence = sentence.strip()
            if not sentence:
                continue
            if len(sentence) > limit:  # a very long sentence with no full stop
                if current:
                    pieces.append(current)
                    current = ""
                pieces.extend(_cut_at_spaces(sentence, limit))
            elif current and len(current) + 1 + len(sentence) > limit:
                pieces.append(current)
                current = sentence
            else:
                current = f"{current} {sentence}".strip()
        if current:
            pieces.append(current)
    return pieces


def join_wavs(chunks: list[bytes], pause_seconds: float = PAUSE_SECONDS) -> tuple[bytes, float]:
    """Join WAV files (all mono, 16-bit, the same rate) with a short silence between them.
    Returns (the WAV file, its length in seconds). Raises ValueError for anything that is not as expected.
    The bytes come from the voice worker, so nothing in the headers is trusted."""
    if not chunks:
        raise ValueError("nothing to join")
    params = None
    frames: list[bytes] = []
    total = 0
    for data in chunks:
        try:
            with wave.open(io.BytesIO(data), "rb") as w:
                current = (w.getnchannels(), w.getsampwidth(), w.getframerate())
                if current[0] != 1 or current[1] != 2 or not AUDIO_RATE_MIN <= current[2] <= AUDIO_RATE_MAX:
                    raise ValueError("unexpected audio format")
                if params is None:
                    params = current
                elif current != params:
                    raise ValueError("the pieces have different audio formats")
                # Read only as many bytes as the file really has, whatever the header says.
                body = w.readframes(w.getnframes())
        except (wave.Error, EOFError) as e:
            raise ValueError("the audio is not a valid WAV file") from e
        total += len(body)
        if total > MAX_JOINED_BYTES:
            raise ValueError("the audio is too big")
        frames.append(body)
    _channels, width, rate = params
    silence = b"\x00" * (int(rate * pause_seconds) * width)
    body = silence.join(frames)
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(width)
        w.setframerate(rate)
        w.writeframes(body)
    return out.getvalue(), len(body) / (rate * width)


def story_text(story: Story) -> str:
    """What is read aloud: the title, then the story. Cleaned like any text that goes to a model."""
    return clean_free_text(f"{story.title}\n\n{story.content}")


# ---------------------------------------------------------------- is this story safe to read in someone's voice?
_LINK = re.compile(r"https?://|www\.|\b[\w.+-]+@[\w-]+\.[\w.-]+", re.IGNORECASE)
_PHONE = re.compile(r"(?:\+?\d[\s().-]*){7,}")
VERBATIM_CHARS = 60  # this many characters copied in a row from the user's own request


def _normalize(text: str) -> str:
    return " ".join(re.sub(r"[^\w\s]", " ", text.lower()).split())


def copied_from_request(prompt: Optional[str], text: str, run: int = VERBATIM_CHARS) -> bool:
    """Did the story repeat a long stretch of the user's own request word for word? A request like
    "Grandpa says, word for word: ..." would make a relative's voice say a message of the user's choice."""
    if not prompt:
        return False
    source, target = _normalize(prompt), _normalize(text)
    if len(source) < run or len(target) < run:
        return False
    pieces = {source[i : i + run] for i in range(len(source) - run + 1)}
    return any(target[i : i + run] in pieces for i in range(len(target) - run + 1))


def refuse_reason(story: Story) -> Optional[str]:
    """A plain-code check. Returns a reason when the story must not be read in a cloned voice."""
    text = story_text(story)
    if _LINK.search(text) or _PHONE.search(text):
        return "contains a link, an e-mail address or a phone number"
    if copied_from_request(story.prompt, text):
        return "repeats the request word for word"
    return None


def claude_safety_check(text: str) -> None:
    """A second look by Claude. Raises TtsError(CANNOT_READ) if the story could be used to deceive someone.
    If the check cannot run, the story is not read (fail closed)."""
    from .story_generator import check_narration_safety

    try:
        safe = check_narration_safety(text)
    except Exception:
        log.exception("The safety check could not run")
        raise TtsError("Could not check this story. Please try again later.")
    if not safe:
        raise TtsError(CANNOT_READ)


# ---------------------------------------------------------------- the runner
class NarrationRunner:
    """Makes narrations one at a time in the background (one voice model, one computer)."""

    def __init__(
        self,
        session_factory: Callable[[], Session] = SessionLocal,
        tts_factory: Callable[[], TtsClient] = HttpTtsClient,
        executor: Optional[object] = None,
        safety_check: Callable[[str], None] = claude_safety_check,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.session_factory = session_factory
        self.tts_factory = tts_factory
        self.executor = executor or ThreadPoolExecutor(max_workers=1, thread_name_prefix="narrator")
        self.safety_check = safety_check
        self.clock = clock

    def submit(self, narration_id: int) -> None:
        self.executor.submit(self.run, narration_id)

    def run(self, narration_id: int) -> None:
        """Never raises. Any problem ends as a "failed" narration with a safe message."""
        try:
            self._run(narration_id)
        except Exception:
            log.exception("Narration %s crashed", narration_id)
            self._fail(narration_id, SAFE_ERROR)

    def _fail(self, narration_id: int, message: str) -> None:
        try:
            with self.session_factory() as db:
                n = db.get(Narration, narration_id)
                if n is None or n.status not in ("queued", "running"):
                    return
                n.status, n.error, n.finished_at = "failed", message[:200], datetime.now(timezone.utc)
                if n.progress_done == 0:  # no work was done, so it does not use up the day
                    entry = db.scalar(select(NarrationLog).where(NarrationLog.narration_id == n.id))
                    if entry is not None:
                        entry.refunded = True
                db.commit()
        except Exception:
            log.exception("Could not mark narration %s as failed", narration_id)

    def _run(self, narration_id: int) -> None:
        with self.session_factory() as db:
            n = db.get(Narration, narration_id)
            if n is None or n.status != "queued":
                return  # deleted, or already handled
            voice, story = db.get(Voice, n.voice_id), db.get(Story, n.story_id)
            if voice is None or story is None:
                return
            text = story_text(story)
            pieces = split_for_tts(text)
            if not pieces or len(pieces) > settings.max_narration_pieces:
                n.status, n.error, n.finished_at = "failed", "This story is too long to make into audio.", datetime.now(timezone.utc)
                db.commit()
                return
            reason = refuse_reason(story)  # again, in case the story changed since the request
            n.status, n.progress_total, n.progress_done = "running", len(pieces), 0
            db.commit()
            user_id, language = n.user_id, voice.language
            try:
                reference = recording_store.path_for(voice.user_id, voice.file_name, "voices").read_bytes()
            except OSError:
                return self._fail(narration_id, "The voice sample is missing. Please add the voice again.")
        # The database session is closed while the slow work runs.

        if reason:
            return self._fail(narration_id, CANNOT_READ)
        try:
            self.safety_check(text)
        except TtsError as e:
            return self._fail(narration_id, e.message)

        deadline = self.clock() + settings.narration_deadline_minutes * 60
        client = self.tts_factory()
        wavs: list[bytes] = []
        for number, piece in enumerate(pieces, start=1):
            if self.clock() > deadline:
                return self._fail(narration_id, "This took too long. Please try a shorter story.")
            try:
                wavs.append(client.synthesize(reference, piece, language))
            except TtsError as e:
                return self._fail(narration_id, e.message)
            with self.session_factory() as db:
                n = db.get(Narration, narration_id)
                if n is None:  # the user deleted it (or the voice or the story) while it was running
                    return
                n.progress_done = number
                db.commit()

        try:
            data, seconds = join_wavs(wavs)
        except ValueError:
            log.warning("The voice worker sent audio that could not be joined", exc_info=True)
            return self._fail(narration_id, SAFE_ERROR)
        del wavs
        file_name = recording_store.save_bytes(user_id, data, "wav", "narrations")
        with self.session_factory() as db:
            n = db.get(Narration, narration_id)
            if n is None:
                recording_store.delete_files(user_id, [file_name], "narrations")  # deleted meanwhile
                return
            n.file_name, n.size_bytes, n.duration_seconds = file_name, len(data), seconds
            n.status, n.error, n.finished_at = "done", None, datetime.now(timezone.utc)
            try:
                db.commit()
            except Exception:
                db.rollback()
                recording_store.delete_files(user_id, [file_name], "narrations")
                raise


_runner: Optional[NarrationRunner] = None


def get_narration_runner() -> NarrationRunner:
    """FastAPI dependency. Tests replace it."""
    global _runner
    if _runner is None:
        _runner = NarrationRunner()
    return _runner


def get_tts_client() -> TtsClient:
    """FastAPI dependency for quick calls from a request (checking a voice sample). Tests replace it."""
    return HttpTtsClient()


def recover_after_restart(runner: NarrationRunner, session_factory: Callable[[], Session] = SessionLocal) -> None:
    """At start: work that was running when the server stopped is lost, so mark it failed. Waiting work is queued again."""
    with session_factory() as db:
        for n in db.scalars(select(Narration).where(Narration.status == "running")).all():
            n.status, n.error, n.finished_at = "failed", "The server restarted. Please try again.", datetime.now(timezone.utc)
        db.commit()
        waiting = [n.id for n in db.scalars(select(Narration).where(Narration.status == "queued")).all()]
    for narration_id in waiting:
        runner.submit(narration_id)
