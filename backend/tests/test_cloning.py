"""Voice cloning (English). The voice worker and the Claude safety check are replaced by fakes, so no model is needed."""

import io
import itertools
import os
import time
import wave
from pathlib import Path

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.config import Settings, settings
from app.main import app
from app.models import Narration, NarrationLog, Story, Voice
from app.security import create_audio_token
from app.services import narrator, recording_store
from app.services.narrator import (
    CANNOT_READ,
    NarrationRunner,
    TtsError,
    copied_from_request,
    get_narration_runner,
    get_tts_client,
    join_wavs,
    recover_after_restart,
    refuse_reason,
    split_for_tts,
)

CONSENT_VERSION = "2026-10-clone-v1"


def make_wav(seconds=0.3, rate=24000, channels=1):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * channels * int(rate * seconds))
    return buf.getvalue()


_counter = itertools.count(1)
LAST = {}  # the sample bytes of the voice made last


def unique_sample():
    """A real WAV file that differs from every other one (the same file cannot become a voice twice)."""
    return make_wav(0.5 + next(_counter) * 0.001)


class FakeTts:
    """Stands in for the voice worker."""

    def __init__(self):
        self.calls = []  # (reference bytes, text, language)
        self.fail_on = None  # make this piece number (1, 2, ...) fail
        self.after_piece = None  # a function to run after each piece
        self.inspect_seconds = 30.0  # what the worker says the sample's length is
        self.inspect_error = None

    def inspect(self, reference):
        if self.inspect_error:
            raise self.inspect_error
        return self.inspect_seconds

    def synthesize(self, reference, text, language):
        self.calls.append((reference, text, language))
        if self.fail_on == len(self.calls):
            raise TtsError("The voice worker took too long. Please try again.")
        out = make_wav(0.3)
        if self.after_piece:
            self.after_piece(len(self.calls))
        return out


class ManualExecutor:
    """Collects jobs so a test decides when they run (the real one runs them in a background thread)."""

    def __init__(self):
        self.jobs = []
        self.now = 0.0  # the clock the runner sees
        self.safety_error = None  # make the "is this story safe?" check refuse

    def submit(self, fn, *args):
        self.jobs.append((fn, args))

    def run_all(self):
        while self.jobs:
            fn, args = self.jobs.pop(0)
            fn(*args)


@pytest.fixture
def tts(monkeypatch):
    monkeypatch.setattr(settings, "tts_url", "http://worker.test")
    fake = FakeTts()
    app.dependency_overrides[get_tts_client] = lambda: fake
    return fake


@pytest.fixture
def jobs(client, tts):
    executor = ManualExecutor()

    def safety(_text):
        if executor.safety_error:
            raise executor.safety_error

    runner = NarrationRunner(
        session_factory=client.session_factory,
        tts_factory=lambda: tts,
        executor=executor,
        safety_check=safety,
        clock=lambda: executor.now,
    )
    app.dependency_overrides[get_narration_runner] = lambda: runner
    executor.runner = runner
    return executor


def _voice(client, auth, name="Mom", duration="30", consent="true", data=None, mime="audio/wav", version=CONSENT_VERSION):
    data = data if data is not None else unique_sample()
    LAST["sample"] = data
    return client.post(
        "/api/voices",
        headers=auth,
        files={"file": ("sample.wav", data, mime)},
        data={"name": name, "duration_seconds": duration, "consent": consent, "consent_text_version": version},
    )


def _story(client, auth, language=None, prompt=None):
    body = {"keywords": ["moon"]}
    if language:
        body["language"] = language
    if prompt:
        body["prompt"] = prompt
    r = client.post("/api/stories/generate", headers=auth, json=body)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _set_story(client, story_id, content=None, prompt=None):
    with client.session_factory() as db:
        story = db.get(Story, story_id)
        if content is not None:
            story.content = content
        if prompt is not None:
            story.prompt = prompt
        db.commit()


def _narrate(client, auth, story_id, voice_id):
    return client.post(f"/api/stories/{story_id}/narrations", headers=auth, json={"voice_id": voice_id})


def _files(media_dir, kind):
    root = Path(media_dir) / kind
    return sorted(p for p in root.rglob("*") if p.is_file()) if root.exists() else []


def _rows(client, auth, story_id):
    return client.get(f"/api/stories/{story_id}/narrations", headers=auth).json()


LONG = "The little fox looked at the moon. " * 30


# ================================================================ what is possible
def test_capabilities(client, auth, monkeypatch):
    monkeypatch.setattr(settings, "tts_url", "")
    off = client.get("/api/voices/capabilities", headers=auth).json()
    assert off["enabled"] is False and off["languages"] == ["en"]
    monkeypatch.setattr(settings, "tts_url", "http://worker.test")
    on = client.get("/api/voices/capabilities", headers=auth).json()
    assert on["enabled"] is True and on["min_sample_seconds"] == 10 and on["max_sample_seconds"] == 120
    assert client.get("/api/voices/capabilities").status_code == 401


def test_everything_says_503_when_there_is_no_voice_worker(client, auth, monkeypatch):
    sid = _story(client, auth)
    monkeypatch.setattr(settings, "tts_url", "")
    assert _voice(client, auth).status_code == 503
    assert _narrate(client, auth, sid, 1).status_code == 503


def test_a_worker_on_another_computer_needs_a_key():
    base = {"jwt_secret": "x" * 40, "_env_file": None}
    with pytest.raises(ValidationError):
        Settings(tts_url="http://other-computer:9000", **base)
    assert Settings(tts_url="http://other-computer:9000", tts_api_key="k", **base).tts_api_key == "k"
    for url in ("http://localhost:9000", "http://127.0.0.1:9000", "http://[::1]:9000", ""):
        Settings(tts_url=url, **base)  # no key needed on this computer, or when cloning is off


# ================================================================ voices (the samples)
def test_create_list_and_delete_a_voice(client, auth, tts, media_dir):
    r = _voice(client, auth)
    assert r.status_code == 201
    voice = r.json()
    assert (voice["name"], voice["language"], voice["duration_seconds"]) == ("Mom", "en", 30.0)
    assert "file_name" not in voice and "sample_sha256" not in voice
    assert [v["id"] for v in client.get("/api/voices", headers=auth).json()] == [voice["id"]]
    assert len(_files(media_dir, "voices")) == 1
    assert client.delete(f"/api/voices/{voice['id']}", headers=auth).status_code == 204
    assert client.get("/api/voices", headers=auth).json() == [] and _files(media_dir, "voices") == []


def test_what_is_stored_with_a_voice(client, auth, tts):
    voice = _voice(client, auth).json()
    with client.session_factory() as db:
        row = db.get(Voice, voice["id"])
        assert row.consent_at is not None and row.consent_text_version == CONSENT_VERSION
        assert len(row.sample_sha256) == 64 and row.uploaded_from  # the file fingerprint and where it came from


def test_consent_is_required_and_must_be_the_current_text(client, auth, tts, media_dir):
    assert _voice(client, auth, consent="false").status_code == 422
    assert _voice(client, auth, version="").status_code == 422
    assert _voice(client, auth, version="old-text").status_code == 422
    assert _files(media_dir, "voices") == []


def test_the_length_comes_from_the_worker_not_from_the_app(client, auth, tts, media_dir):
    tts.inspect_seconds = 9.9  # the app says 30 s, the worker measured less
    assert _voice(client, auth, duration="30").status_code == 422
    assert _files(media_dir, "voices") == []
    tts.inspect_seconds = 10
    assert _voice(client, auth).status_code == 201
    tts.inspect_seconds = 125  # a little over 120 is allowed (the measuring is not exact)
    assert _voice(client, auth).status_code == 201
    tts.inspect_seconds = 125.1
    assert _voice(client, auth).status_code == 422
    tts.inspect_seconds = 30
    voice = _voice(client, auth, duration="999").status_code  # the app's own number is only checked for sense
    assert voice == 422


@pytest.mark.parametrize("duration", ["-1", "241", "nan", "inf", "abc"])
def test_nonsense_lengths_from_the_app(client, auth, tts, duration):
    assert _voice(client, auth, duration=duration).status_code == 422


def test_when_the_worker_cannot_be_asked_there_is_no_voice(client, auth, tts, media_dir):
    tts.inspect_error = TtsError("The voice worker is not reachable. Please try again later.")
    assert _voice(client, auth).status_code == 503
    tts.inspect_error = TtsError("This is not a voice recording we can use.")
    assert _voice(client, auth).status_code == 422
    assert _files(media_dir, "voices") == []  # nothing is kept from a refused upload


@pytest.mark.parametrize("name", ["", "   ", "x" * 61, "​"])
def test_voice_names(client, auth, tts, name):
    assert _voice(client, auth, name=name).status_code == 422


def test_voice_name_is_tidied(client, auth, tts):
    assert _voice(client, auth, name="‮evil‬  Mom ").json()["name"] == "evil Mom"


def test_not_audio_is_refused(client, auth, tts, media_dir):
    assert _voice(client, auth, data=b"<html><script>alert(1)</script></html>" * 5).status_code == 415
    assert _files(media_dir, "voices") == []


def test_the_same_recording_cannot_become_a_voice_twice(client, auth, auth2, tts, media_dir):
    sample = unique_sample()
    assert _voice(client, auth, data=sample).status_code == 201
    assert _voice(client, auth, data=sample).status_code == 409  # by the same account
    assert _voice(client, auth2, data=sample).status_code == 409  # or by another one
    assert len(_files(media_dir, "voices")) == 1


def test_voice_limits(client, auth, tts, monkeypatch):
    monkeypatch.setattr(settings, "max_voices_per_user", 2)
    assert _voice(client, auth).status_code == 201 and _voice(client, auth).status_code == 201
    assert _voice(client, auth).status_code == 409
    monkeypatch.setattr(settings, "max_voices_per_user", 9)
    monkeypatch.setattr(settings, "max_voice_sample_mb", 0)
    assert _voice(client, auth).status_code == 413  # bigger than the allowed size


def test_a_huge_voice_upload_without_login_is_refused_early(client, tts, monkeypatch):
    monkeypatch.setattr(settings, "max_voice_sample_mb", 1)
    r = client.post("/api/voices", content=b"x" * (2 * 1024 * 1024), headers={"Content-Type": "multipart/form-data; boundary=x"})
    assert r.status_code == 413


def test_voices_belong_to_their_owner(client, auth, auth2, tts):
    voice = _voice(client, auth).json()
    assert client.get("/api/voices", headers=auth2).json() == []
    assert client.delete(f"/api/voices/{voice['id']}", headers=auth2).status_code == 404
    assert client.get("/api/voices").status_code == 401


def test_voice_samples_count_in_the_storage_limit(client, auth, tts, monkeypatch):
    monkeypatch.setattr(settings, "max_user_media_mb", 0)
    assert _voice(client, auth).status_code == 413


# ================================================================ making audio
def test_the_whole_flow(client, auth, tts, jobs, media_dir):
    sid = _story(client, auth)
    voice = _voice(client, auth).json()
    sample = LAST["sample"]
    _set_story(client, sid, content=LONG + "\n\nThe end of the day came.")

    created = _narrate(client, auth, sid, voice["id"])
    assert created.status_code == 201
    n = created.json()
    assert (n["status"], n["voice_name"], n["story_id"]) == ("queued", "Mom", sid)
    assert len(jobs.jobs) == 1

    jobs.run_all()
    done = _rows(client, auth, sid)[0]
    assert done["status"] == "done" and done["error"] is None
    assert done["progress_done"] == done["progress_total"] == len(tts.calls) > 3
    assert done["duration_seconds"] > 1 and done["finished_at"] is not None

    # The worker got the sample itself and short pieces of text, in English.
    assert all(call[0] == sample and call[2] == "en" for call in tts.calls)
    assert all(len(call[1]) <= 250 for call in tts.calls)
    assert tts.calls[0][1].startswith("Story 1")  # the title is read first

    url = client.get(f"/api/narrations/{n['id']}/url", headers=auth).json()["url"]
    audio = client.get(url)
    assert audio.status_code == 200 and audio.headers["content-type"] == "audio/wav"
    with wave.open(io.BytesIO(audio.content)) as w:
        assert w.getframerate() == 24000
    assert client.get(url, headers={"Range": "bytes=0-9"}).status_code == 206
    assert audio.headers["referrer-policy"] == "no-referrer" and "sandbox" in audio.headers["content-security-policy"]
    assert len(_files(media_dir, "narrations")) == 1


def test_asking_twice_gives_the_same_audio(client, auth, tts, jobs):
    sid, voice = _story(client, auth), _voice(client, auth).json()
    first = _narrate(client, auth, sid, voice["id"])
    again = _narrate(client, auth, sid, voice["id"])
    assert again.status_code == 200 and again.json()["id"] == first.json()["id"]
    assert len(jobs.jobs) == 1  # no second job
    jobs.run_all()
    assert _narrate(client, auth, sid, voice["id"]).status_code == 200  # also when it is done


def test_the_database_allows_one_audio_for_a_story_and_voice(client, auth, tts, jobs):
    sid, voice = _story(client, auth), _voice(client, auth).json()
    uid = client.get("/api/auth/me", headers=auth).json()["id"]
    _narrate(client, auth, sid, voice["id"])
    with client.session_factory() as db:
        db.add(Narration(story_id=sid, voice_id=voice["id"], user_id=uid, voice_name="Mom"))
        with pytest.raises(IntegrityError):
            db.commit()


def test_a_finished_audio_whose_file_was_lost_is_made_again(client, auth, tts, jobs, media_dir):
    sid, voice = _story(client, auth), _voice(client, auth).json()
    _narrate(client, auth, sid, voice["id"])
    jobs.run_all()
    for f in _files(media_dir, "narrations"):
        f.unlink()
    again = _narrate(client, auth, sid, voice["id"])
    assert again.status_code == 201 and again.json()["status"] == "queued"
    jobs.run_all()
    assert _rows(client, auth, sid)[0]["status"] == "done" and len(_files(media_dir, "narrations")) == 1


def test_not_ready_audio_has_no_link(client, auth, tts, jobs):
    sid, voice = _story(client, auth), _voice(client, auth).json()
    n = _narrate(client, auth, sid, voice["id"]).json()
    assert client.get(f"/api/narrations/{n['id']}/url", headers=auth).status_code == 409
    token = create_audio_token(n["id"], 1, kind="narration")
    assert client.get(f"/api/narrations/{n['id']}/audio?sig={token}").status_code == 404


def test_hebrew_and_too_long_stories_are_refused(client, auth, tts, jobs, monkeypatch):
    voice = _voice(client, auth).json()
    hebrew = _story(client, auth, language="he")
    assert _narrate(client, auth, hebrew, voice["id"]).status_code == 422
    sid = _story(client, auth)
    monkeypatch.setattr(settings, "max_narration_chars", 20)
    assert _narrate(client, auth, sid, voice["id"]).status_code == 413
    monkeypatch.setattr(settings, "max_narration_chars", 12000)
    monkeypatch.setattr(settings, "max_narration_pieces", 2)
    _set_story(client, sid, content=LONG)
    assert _narrate(client, auth, sid, voice["id"]).status_code == 413  # too many pieces
    assert jobs.jobs == []


def test_a_failed_piece_gives_a_failed_audio_with_a_safe_message(client, auth, tts, jobs, media_dir):
    sid, voice = _story(client, auth), _voice(client, auth).json()
    _set_story(client, sid, content=LONG)
    tts.fail_on = 3
    _narrate(client, auth, sid, voice["id"])
    jobs.run_all()
    failed = _rows(client, auth, sid)[0]
    assert failed["status"] == "failed" and failed["error"] == "The voice worker took too long. Please try again."
    assert failed["progress_done"] == 2
    assert _files(media_dir, "narrations") == []
    # Trying again replaces the failed one.
    tts.fail_on = None
    retry = _narrate(client, auth, sid, voice["id"])
    assert retry.status_code == 201 and retry.json()["status"] == "queued"
    jobs.run_all()
    assert [r["status"] for r in _rows(client, auth, sid)] == ["done"]


def test_a_crash_inside_the_runner_is_a_failed_audio_not_a_lost_job(client, auth, tts, jobs, monkeypatch):
    sid, voice = _story(client, auth), _voice(client, auth).json()

    def boom(_chunks):
        raise RuntimeError("disk full")

    monkeypatch.setattr(narrator, "join_wavs", boom)
    _narrate(client, auth, sid, voice["id"])
    jobs.run_all()
    row = _rows(client, auth, sid)[0]
    assert row["status"] == "failed" and "disk full" not in str(row)


def test_a_voice_sample_that_went_missing_fails_the_audio(client, auth, tts, jobs, media_dir):
    sid, voice = _story(client, auth), _voice(client, auth).json()
    _narrate(client, auth, sid, voice["id"])
    for f in _files(media_dir, "voices"):
        f.unlink()
    jobs.run_all()
    row = _rows(client, auth, sid)[0]
    assert row["status"] == "failed" and "sample is missing" in row["error"]
    assert tts.calls == []


# ================================================================ limits
def test_only_one_audio_is_made_at_a_time_per_user(client, auth, tts, jobs):
    voice = _voice(client, auth).json()
    first, second = _story(client, auth), _story(client, auth)
    assert _narrate(client, auth, first, voice["id"]).status_code == 201
    assert _narrate(client, auth, second, voice["id"]).status_code == 429  # wait for the first
    jobs.run_all()
    assert _narrate(client, auth, second, voice["id"]).status_code == 201


def test_the_daily_limit_cannot_be_beaten_by_deleting(client, auth, tts, jobs, monkeypatch):
    monkeypatch.setattr(settings, "daily_narration_limit", 2)
    voice = _voice(client, auth).json()
    stories = [_story(client, auth) for _ in range(4)]
    for sid in stories[:2]:
        n = _narrate(client, auth, sid, voice["id"])
        assert n.status_code == 201
        jobs.run_all()
        assert client.delete(f"/api/narrations/{n.json()['id']}", headers=auth).status_code == 204  # delete it ...
    assert _narrate(client, auth, stories[2], voice["id"]).status_code == 429  # ... the day is still used up


def test_a_failure_after_work_was_done_still_counts_but_one_before_any_work_does_not(client, auth, tts, jobs, monkeypatch):
    monkeypatch.setattr(settings, "daily_narration_limit", 1)
    voice = _voice(client, auth).json()
    a, b = _story(client, auth), _story(client, auth)
    _set_story(client, a, content=LONG)
    tts.fail_on = 1  # fails before any piece was made: the day is given back
    _narrate(client, auth, a, voice["id"])
    jobs.run_all()
    assert _rows(client, auth, a)[0]["progress_done"] == 0
    tts.fail_on = 3  # fails after two pieces: the work was done, the day stays used
    tts.calls.clear()
    assert _narrate(client, auth, a, voice["id"]).status_code == 201
    jobs.run_all()
    assert _rows(client, auth, a)[0]["progress_done"] == 2
    assert _narrate(client, auth, b, voice["id"]).status_code == 429


def test_the_deadline_stops_a_job_that_takes_too_long(client, auth, tts, jobs, monkeypatch):
    monkeypatch.setattr(settings, "narration_deadline_minutes", 1)
    sid, voice = _story(client, auth), _voice(client, auth).json()
    _set_story(client, sid, content=LONG)
    tts.after_piece = lambda number: setattr(jobs, "now", jobs.now + 120)  # every piece "takes two minutes"
    _narrate(client, auth, sid, voice["id"])
    jobs.run_all()
    row = _rows(client, auth, sid)[0]
    assert row["status"] == "failed" and "too long" in row["error"]
    assert len(tts.calls) == 1  # it did not go on


def test_other_users_cannot_use_my_voice_or_story(client, auth, auth2, tts, jobs):
    sid, voice = _story(client, auth), _voice(client, auth).json()
    sid2, voice2 = _story(client, auth2), _voice(client, auth2).json()
    assert _narrate(client, auth2, sid, voice2["id"]).status_code == 404  # not their story
    assert _narrate(client, auth2, sid2, voice["id"]).status_code == 404  # not their voice
    n = _narrate(client, auth, sid, voice["id"]).json()
    jobs.run_all()
    assert client.get(f"/api/stories/{sid}/narrations", headers=auth2).status_code == 404
    assert client.get(f"/api/narrations/{n['id']}/url", headers=auth2).status_code == 404
    assert client.delete(f"/api/narrations/{n['id']}", headers=auth2).status_code == 404


def test_links_for_recordings_and_narrations_are_not_interchangeable(client, auth, tts, jobs):
    sid, voice = _story(client, auth), _voice(client, auth).json()
    n = _narrate(client, auth, sid, voice["id"]).json()
    jobs.run_all()
    uid = client.get("/api/auth/me", headers=auth).json()["id"]
    recording_token = create_audio_token(n["id"], uid)  # made for a recording
    assert client.get(f"/api/narrations/{n['id']}/audio?sig={recording_token}").status_code == 403
    narration_token = create_audio_token(n["id"], uid, kind="narration")
    assert client.get(f"/api/recordings/{n['id']}/audio?sig={narration_token}").status_code == 403
    login = auth["Authorization"].split(" ")[1]
    assert client.get(f"/api/narrations/{n['id']}/audio?sig={login}").status_code == 403


# ================================================================ misuse: a story that should not be read in someone's voice
def test_a_story_with_a_link_an_email_or_a_phone_number_is_refused(client, auth, tts, jobs):
    voice = _voice(client, auth).json()
    for text in (
        "Call me at 050 123 4567 right now.",
        "Visit www.example.com for more.",
        "Write to pip@example.org please.",
        "Open https://example.com/pay now.",
    ):
        sid = _story(client, auth)
        _set_story(client, sid, content=text)
        r = _narrate(client, auth, sid, voice["id"])
        assert r.status_code == 422 and r.json()["detail"] == CANNOT_READ, text
    assert jobs.jobs == []


def test_a_story_that_repeats_the_users_request_word_for_word_is_refused(client, auth, tts, jobs):
    voice = _voice(client, auth).json()
    message = "Mom I am at the police station please send money to this account right away"
    sid = _story(client, auth, prompt=f"A story where Grandpa says word for word: {message}")
    _set_story(client, sid, content=f"Grandpa looked up and said, {message}. Then he smiled.")
    r = _narrate(client, auth, sid, voice["id"])
    assert r.status_code == 422 and r.json()["detail"] == CANNOT_READ
    # A normal story that only uses a few of the same words is fine.
    ok = _story(client, auth, prompt="A story about a brave fox and the moon")
    _set_story(client, ok, content="The fox was brave. He looked at the moon and smiled.")
    assert _narrate(client, auth, ok, voice["id"]).status_code == 201


def test_the_checks_in_plain_code():
    assert copied_from_request("hello there my friend how are you today", "hello there") is False  # too short to matter
    long = "please say these exact words to the whole family tonight at dinner"  # more than 60 characters
    assert copied_from_request(long, f"He said: {long.upper()}!!") is True  # capitals and punctuation do not hide it
    assert copied_from_request(None, long) is False and copied_from_request("", long) is False

    story = Story(title="A fox", content="The fox ran.", prompt=None)
    assert refuse_reason(story) is None
    story.content = "Mail the fox at fox@example.com"
    assert refuse_reason(story)


def test_the_claude_check_can_refuse_a_story_and_then_nothing_is_read(client, auth, tts, jobs):
    sid, voice = _story(client, auth), _voice(client, auth).json()
    jobs.safety_error = TtsError(CANNOT_READ)
    _narrate(client, auth, sid, voice["id"])
    jobs.run_all()
    row = _rows(client, auth, sid)[0]
    assert row["status"] == "failed" and row["error"] == CANNOT_READ
    assert tts.calls == []  # not one piece was made
    jobs.safety_error = None
    assert _narrate(client, auth, sid, voice["id"]).status_code == 201  # refused before any work: the day is given back


def test_claude_check_fails_closed(monkeypatch):
    from app.services import story_generator

    def make_client(answer=None, error=None):
        class Client:
            def __init__(self, **_):
                self.messages = self

            def create(self, **kwargs):
                if error:
                    raise error
                assert "<story>" in kwargs["messages"][0]["content"]  # the story is fenced in tags
                from types import SimpleNamespace

                return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=answer)])

        return Client

    monkeypatch.setattr(story_generator.anthropic, "Anthropic", make_client('{"safe": true, "reason": ""}'))
    assert story_generator.check_narration_safety("A fox ran.") is True
    narrator.claude_safety_check("A fox ran.")  # no error

    monkeypatch.setattr(story_generator.anthropic, "Anthropic", make_client('{"safe": false, "reason": "asks for money"}'))
    assert story_generator.check_narration_safety("Send money") is False
    with pytest.raises(TtsError) as e:
        narrator.claude_safety_check("Send money")
    assert e.value.message == CANNOT_READ

    monkeypatch.setattr(story_generator.anthropic, "Anthropic", make_client(error=RuntimeError("no network")))
    with pytest.raises(TtsError) as e:  # when the check cannot run, the story is NOT read
        narrator.claude_safety_check("A fox ran.")
    assert "Could not check" in e.value.message and "no network" not in e.value.message


# ================================================================ deleting
def test_deleting_while_it_is_being_made_stops_the_work_and_leaves_no_file(client, auth, tts, jobs, media_dir):
    sid, voice = _story(client, auth), _voice(client, auth).json()
    _set_story(client, sid, content=LONG)
    n = _narrate(client, auth, sid, voice["id"]).json()

    def delete_after_first_piece(number):
        if number == 1:
            assert client.delete(f"/api/narrations/{n['id']}", headers=auth).status_code == 204

    tts.after_piece = delete_after_first_piece
    jobs.run_all()
    assert len(tts.calls) == 1  # it stopped
    assert _rows(client, auth, sid) == []
    assert _files(media_dir, "narrations") == []


def test_deleting_a_voice_removes_its_audio(client, auth, tts, jobs, media_dir):
    sid, voice = _story(client, auth), _voice(client, auth).json()
    _narrate(client, auth, sid, voice["id"])
    jobs.run_all()
    assert len(_files(media_dir, "narrations")) == 1
    assert client.delete(f"/api/voices/{voice['id']}", headers=auth).status_code == 204
    assert _rows(client, auth, sid) == []
    assert _files(media_dir, "narrations") == [] and _files(media_dir, "voices") == []


def test_deleting_a_story_removes_its_audio(client, auth, tts, jobs, media_dir):
    sid, voice = _story(client, auth), _voice(client, auth).json()
    _narrate(client, auth, sid, voice["id"])
    jobs.run_all()
    assert client.delete(f"/api/stories/{sid}", headers=auth).status_code == 204
    assert _files(media_dir, "narrations") == []
    assert len(_files(media_dir, "voices")) == 1  # the voice itself stays


def test_deleting_the_account_removes_everything(client, auth, auth2, tts, jobs, media_dir):
    sid, voice = _story(client, auth), _voice(client, auth).json()
    _narrate(client, auth, sid, voice["id"])
    jobs.run_all()
    sid2, voice2 = _story(client, auth2), _voice(client, auth2).json()
    _narrate(client, auth2, sid2, voice2["id"])
    jobs.run_all()
    assert client.delete("/api/auth/me", headers=auth).status_code == 204
    assert len(_files(media_dir, "narrations")) == 1 and len(_files(media_dir, "voices")) == 1  # only the other user's
    with client.session_factory() as db:  # the log of the deleted account is gone too
        assert db.scalar(select(NarrationLog).where(NarrationLog.user_id == 1)) is None


def test_sweep_works_for_every_kind_of_folder(media_dir):
    folder = Path(media_dir) / "narrations" / "5"
    folder.mkdir(parents=True)
    (folder / "old.wav").write_bytes(b"x")
    (folder / "keep.wav").write_bytes(b"x")
    old = time.time() - 7200
    for f in folder.iterdir():
        os.utime(f, (old, old))
    removed = recording_store.sweep_orphans({5: {"keep.wav"}}, kind="narrations")
    assert [Path(r).name for r in removed] == ["old.wav"]


def test_restart_recovery(client, auth, tts, jobs):
    sid, voice = _story(client, auth), _voice(client, auth).json()
    sid2 = _story(client, auth)
    waiting = _narrate(client, auth, sid, voice["id"]).json()
    jobs.jobs.clear()
    with client.session_factory() as db:
        db.add(Narration(story_id=sid2, voice_id=voice["id"], user_id=1, voice_name="Mom", status="running"))
        db.commit()
    recover_after_restart(jobs.runner, client.session_factory)
    row = _rows(client, auth, sid2)[0]
    assert row["status"] == "failed" and "restarted" in row["error"]
    assert [args for _fn, args in jobs.jobs] == [(waiting["id"],)]  # the waiting one is queued again
    jobs.run_all()
    assert _rows(client, auth, sid)[0]["status"] == "done"


# ================================================================ helpers
def test_split_for_tts():
    assert split_for_tts("") == [] and split_for_tts("  \n\n  ") == []
    assert split_for_tts("Hello there.") == ["Hello there."]
    pieces = split_for_tts("A fox ran. " * 60)
    assert len(pieces) > 1 and all(len(p) <= 250 for p in pieces)
    assert " ".join(pieces).replace("  ", " ") == ("A fox ran. " * 60).strip()
    assert split_for_tts("One.\n\nTwo.") == ["One.", "Two."]  # a paragraph end always ends a piece
    long_no_stop = split_for_tts("word " * 200)
    assert len(long_no_stop) > 1 and all(len(p) <= 250 for p in long_no_stop)
    assert all(len(p) <= 100 for p in split_for_tts("A fox ran. " * 30, limit=100))


def test_join_wavs():
    data, seconds = join_wavs([make_wav(0.5), make_wav(0.5)], pause_seconds=0.25)
    assert abs(seconds - 1.25) < 0.01
    with wave.open(io.BytesIO(data)) as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, 24000)
    with pytest.raises(ValueError):
        join_wavs([])
    with pytest.raises(ValueError):
        join_wavs([make_wav(0.1, rate=24000), make_wav(0.1, rate=16000)])  # mixed formats


@pytest.mark.parametrize(
    "bad",
    [
        b"not a wav file at all",
        b"",
        make_wav(0.1, channels=2),  # stereo: the worker sends mono
        make_wav(0.1, rate=4000),  # a rate nobody should send
        make_wav(0.1, rate=96000),
    ],
    ids=["not a wav", "empty", "stereo", "rate too low", "rate too high"],
)
def test_join_wavs_does_not_trust_what_the_worker_sends(bad):
    with pytest.raises(ValueError):  # always ValueError, never another kind of error
        join_wavs([bad])


def test_a_wav_header_that_lies_about_its_length_does_no_harm():
    good = bytearray(make_wav(0.2))
    good[40:44] = (0xFFFFFFF0).to_bytes(4, "little")  # "the data is 4 GB" (it is not)
    try:
        data, seconds = join_wavs([bytes(good)])
    except ValueError:
        return  # refusing is fine
    assert seconds < 1 and len(data) < 100_000  # it only used the bytes that are really there


def test_the_joined_audio_has_a_size_limit(monkeypatch):
    monkeypatch.setattr(narrator, "MAX_JOINED_BYTES", 1000)
    with pytest.raises(ValueError):
        join_wavs([make_wav(0.5)])


# ================================================================ talking to the worker
class FakeStream:
    """What httpx.stream() gives back."""

    def __init__(self, status=200, body=b"RIFF", content_type="audio/wav", chunks=None):
        self.status_code = status
        self.headers = {"content-type": content_type}
        self._chunks = chunks if chunks is not None else [body]

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def iter_bytes(self):
        yield from self._chunks


@pytest.fixture
def worker(monkeypatch):
    """Replace the network. `worker.answers` is a list of answers (or errors) given one by one."""

    class Worker:
        calls = []
        answers = []

    def fake_stream(method, url, **kw):
        Worker.calls.append(dict(method=method, url=url, **kw))
        answer = Worker.answers.pop(0) if Worker.answers else FakeStream()
        if isinstance(answer, Exception):
            raise answer
        return answer

    Worker.calls, Worker.answers = [], []
    monkeypatch.setattr(settings, "tts_url", "http://worker.test/")
    monkeypatch.setattr(settings, "tts_api_key", "secret-key")
    monkeypatch.setattr(httpx, "stream", fake_stream)
    return Worker


def test_http_client_sends_the_sample_once_and_then_only_its_fingerprint(worker):
    client = narrator.HttpTtsClient()
    assert client.synthesize(b"sample", "Piece one", "en") == b"RIFF"
    assert client.synthesize(b"sample", "Piece two", "en") == b"RIFF"
    first, second = worker.calls
    assert first["url"] == "http://worker.test/synthesize" and first["headers"] == {"X-Api-Key": "secret-key"}
    assert first["files"]["reference"][1] == b"sample" and first["data"]["text"] == "Piece one"
    assert second["files"] is None and second["data"]["reference_id"] == first["data"]["reference_id"]
    assert first["timeout"].read == settings.tts_timeout_seconds and first["timeout"].connect == 5.0


def test_http_client_sends_the_sample_again_when_the_worker_lost_it(worker):
    client = narrator.HttpTtsClient()
    worker.answers = [FakeStream(), FakeStream(409, b"", "application/json"), FakeStream()]
    client.synthesize(b"sample", "One", "en")
    assert client.synthesize(b"sample", "Two", "en") == b"RIFF"
    assert [c["files"] is not None for c in worker.calls] == [True, False, True]


def test_http_client_inspect(worker):
    worker.answers = [FakeStream(200, b'{"seconds": 31.5}', "application/json")]
    assert narrator.HttpTtsClient().inspect(b"sample") == 31.5
    assert worker.calls[0]["url"] == "http://worker.test/inspect"
    for answer, expected in ((FakeStream(422, b"{}", "application/json"), "not a voice recording"), (FakeStream(500, b"x", "text/plain"), "Could not make")):
        worker.answers = [answer]
        with pytest.raises(TtsError) as e:
            narrator.HttpTtsClient().inspect(b"sample")
        assert expected in e.value.message
    worker.answers = [FakeStream(200, b"not json", "application/json")]
    with pytest.raises(TtsError):
        narrator.HttpTtsClient().inspect(b"sample")


def test_the_worker_answer_has_a_size_limit(worker, monkeypatch):
    monkeypatch.setattr(settings, "max_worker_response_mb", 1)
    half = b"x" * (600 * 1024)
    worker.answers = [FakeStream(chunks=[half, half])]  # 1.2 MB, over the 1 MB limit
    with pytest.raises(TtsError):
        narrator.HttpTtsClient().synthesize(b"sample", "Hello", "en")
    worker.answers = [FakeStream(chunks=[half])]
    assert narrator.HttpTtsClient().synthesize(b"sample", "Hello", "en") == half


@pytest.mark.parametrize(
    "problem, expected",
    [
        (httpx.ReadTimeout("slow"), "took too long"),
        (httpx.ConnectError("no"), "not reachable"),
        (FakeStream(422), "could not be used"),
        (FakeStream(500), "Could not make the audio"),
        (FakeStream(200, content_type="text/html"), "Could not make the audio"),
    ],
)
def test_worker_problems_become_safe_messages(worker, problem, expected):
    worker.answers = [problem]
    with pytest.raises(TtsError) as e:
        narrator.HttpTtsClient().synthesize(b"sample", "Hello", "en")
    assert expected in e.value.message
    assert "worker.test" not in e.value.message  # no addresses in what the user sees
