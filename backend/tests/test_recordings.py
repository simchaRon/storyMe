import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.middleware import RedactSignatureFilter
from app.models import StoryRecording
from app.security import create_audio_token
from app.services import recording_store
from app.services.story_generator import get_story_generator

M4A = b"\x00\x00\x00\x18ftypM4A \x00\x00\x00\x00" + b"audio-bytes-" * 50
WEBM = b"\x1aE\xdf\xa3" + b"\x00" * 8 + b"webm-audio" * 50
WAV = b"RIFF\x24\x00\x00\x00WAVEfmt " + b"\x00" * 40
NOT_AUDIO = b"<html><script>alert(1)</script></html>" * 5


def _story(client, auth):
    r = client.post("/api/stories/generate", headers=auth, json={"keywords": ["moon"]})
    assert r.status_code == 201
    return r.json()["id"]


def _upload(client, auth, story_id, data=M4A, name="Mom", duration="95.5", consent="true", filename="rec.m4a", mime="audio/mp4"):
    return client.post(
        f"/api/stories/{story_id}/recordings",
        headers=auth,
        files={"file": (filename, data, mime)},
        data={"name": name, "duration_seconds": duration, "consent": consent},
    )


def _files(media_dir):
    root = Path(media_dir) / "recordings"
    return sorted(p for p in root.rglob("*") if p.is_file()) if root.exists() else []


def test_upload_list_and_play(client, auth, media_dir):
    sid = _story(client, auth)
    r = _upload(client, auth, sid)
    assert r.status_code == 201
    rec = r.json()
    assert (rec["name"], rec["duration_seconds"], rec["size_bytes"], rec["story_id"]) == ("Mom", 95.5, len(M4A), sid)
    assert "file_name" not in rec and "path" not in str(rec)  # the server's file name is never shown

    listed = client.get(f"/api/stories/{sid}/recordings", headers=auth).json()
    assert [x["id"] for x in listed] == [rec["id"]]

    url = client.get(f"/api/recordings/{rec['id']}/url", headers=auth).json()
    assert url["url"].startswith(f"/api/recordings/{rec['id']}/audio?sig=") and url["expires_in"] > 0
    audio = client.get(url["url"])  # no Authorization header: a web audio player cannot send one
    assert audio.status_code == 200
    assert audio.content == M4A
    assert audio.headers["content-type"] == "audio/mp4"
    assert audio.headers["x-content-type-options"] == "nosniff"
    assert "no-store" in audio.headers["cache-control"]
    assert len(_files(media_dir)) == 1


def test_audio_supports_range_requests_for_iphones(client, auth):
    sid = _story(client, auth)
    rec = _upload(client, auth, sid).json()
    url = client.get(f"/api/recordings/{rec['id']}/url", headers=auth).json()["url"]
    part = client.get(url, headers={"Range": "bytes=0-9"})
    assert part.status_code == 206
    assert part.content == M4A[:10]
    assert part.headers["content-range"].startswith("bytes 0-9/")


def test_webm_and_wav_are_accepted_and_labelled_correctly(client, auth):
    sid = _story(client, auth)
    webm = _upload(client, auth, sid, data=WEBM, filename="rec.webm", mime="video/webm").json()
    wav = _upload(client, auth, sid, data=WAV, filename="rec.wav", mime="audio/wav").json()
    types = {}
    for rec in (webm, wav):
        url = client.get(f"/api/recordings/{rec['id']}/url", headers=auth).json()["url"]
        types[rec["id"]] = client.get(url).headers["content-type"]
    assert types[webm["id"]] == "audio/webm" and types[wav["id"]] == "audio/wav"


def test_a_file_that_is_not_audio_is_refused_even_if_it_claims_to_be(client, auth, media_dir):
    sid = _story(client, auth)
    r = _upload(client, auth, sid, data=NOT_AUDIO, filename="evil.m4a", mime="audio/mp4")
    assert r.status_code == 415
    assert _files(media_dir) == []
    assert _upload(client, auth, sid, data=b"tiny").status_code == 415


def test_the_user_cannot_choose_the_file_name_or_path(client, auth, media_dir):
    sid = _story(client, auth)
    r = _upload(client, auth, sid, filename="../../../etc/passwd.m4a")
    assert r.status_code == 201
    [stored] = _files(media_dir)
    assert stored.parent.parent.name == "recordings"  # inside recordings/<user id>/
    assert stored.name.endswith(".m4a") and "passwd" not in stored.name


def test_consent_is_required(client, auth, media_dir):
    sid = _story(client, auth)
    assert _upload(client, auth, sid, consent="false").status_code == 422
    assert client.post(f"/api/stories/{sid}/recordings", headers=auth, files={"file": ("a.m4a", M4A, "audio/mp4")}, data={"name": "Mom"}).status_code == 422
    assert _files(media_dir) == []


@pytest.mark.parametrize("name", ["", "   ", "x" * 61, "\u200b\u200f"])
def test_bad_names(client, auth, name):
    assert _upload(client, auth, _story(client, auth), name=name).status_code == 422


def test_name_is_tidied(client, auth):
    rec = _upload(client, auth, _story(client, auth), name="  Grand\u200bma   Ruth ").json()
    assert rec["name"] == "Grandma Ruth"


@pytest.mark.parametrize("duration", ["-1", "3601", "abc"])
def test_bad_duration(client, auth, duration):
    assert _upload(client, auth, _story(client, auth), duration=duration).status_code == 422


def test_size_limit(client, auth, media_dir, monkeypatch):
    monkeypatch.setattr(settings, "max_recording_mb", 1)
    sid = _story(client, auth)
    big = M4A + b"x" * (1024 * 1024)
    assert _upload(client, auth, sid, data=big).status_code == 413
    assert _files(media_dir) == []
    assert _upload(client, auth, sid).status_code == 201


def test_limits_per_story_and_per_user(client, auth, monkeypatch):
    monkeypatch.setattr(settings, "max_recordings_per_story", 2)
    sid = _story(client, auth)
    assert _upload(client, auth, sid).status_code == 201
    assert _upload(client, auth, sid).status_code == 201
    assert _upload(client, auth, sid).status_code == 409
    monkeypatch.setattr(settings, "max_recordings_per_story", 10)
    monkeypatch.setattr(settings, "max_user_media_mb", 0)  # no storage at all
    assert _upload(client, auth, sid).status_code == 413


def test_other_users_cannot_touch_my_recordings(client, auth, auth2):
    sid = _story(client, auth)
    rec = _upload(client, auth, sid).json()
    assert _upload(client, auth2, sid).status_code == 404  # not their story
    assert client.get(f"/api/stories/{sid}/recordings", headers=auth2).status_code == 404
    assert client.get(f"/api/recordings/{rec['id']}/url", headers=auth2).status_code == 404
    assert client.delete(f"/api/recordings/{rec['id']}", headers=auth2).status_code == 404
    assert client.get(f"/api/stories/{sid}/recordings", headers=auth).json()[0]["id"] == rec["id"]


def test_requires_login(client, auth):
    sid = _story(client, auth)
    assert client.get(f"/api/stories/{sid}/recordings").status_code == 401
    assert client.post(f"/api/stories/{sid}/recordings", files={"file": ("a.m4a", M4A, "audio/mp4")}, data={"name": "x", "consent": "true"}).status_code == 401
    assert client.get("/api/recordings/1/url").status_code == 401


def test_audio_link_rules(client, auth, auth2):
    sid = _story(client, auth)
    rec = _upload(client, auth, sid).json()
    other = _upload(client, auth, sid).json()
    rid = rec["id"]
    good = client.get(f"/api/recordings/{rid}/url", headers=auth).json()["url"]
    token = good.split("sig=")[1]

    assert client.get(f"/api/recordings/{rid}/audio").status_code == 422  # no signature at all
    assert client.get(f"/api/recordings/{rid}/audio?sig=nonsense").status_code == 403
    # The link works only for the recording it was made for.
    assert client.get(f"/api/recordings/{other['id']}/audio?sig={token}").status_code == 403
    # A login token is not an audio link.
    login = auth["Authorization"].split(" ")[1]
    assert client.get(f"/api/recordings/{rid}/audio?sig={login}").status_code == 403
    # An expired link.
    expired = jwt.encode({"purpose": "recording-audio", "rec": rid, "uid": 1, "exp": int(time.time()) - 5}, settings.jwt_secret, algorithm="HS256")
    assert client.get(f"/api/recordings/{rid}/audio?sig={expired}").status_code == 403
    # A link made for another user id does not give access to this user's file.
    wrong_user = create_audio_token(rid, 9999)
    assert client.get(f"/api/recordings/{rid}/audio?sig={wrong_user}").status_code == 404


def test_an_audio_link_is_not_a_login(client, auth):
    sid = _story(client, auth)
    rec = _upload(client, auth, sid).json()
    token = client.get(f"/api/recordings/{rec['id']}/url", headers=auth).json()["url"].split("sig=")[1]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_delete_recording_removes_the_file(client, auth, media_dir):
    sid = _story(client, auth)
    rec = _upload(client, auth, sid).json()
    assert len(_files(media_dir)) == 1
    assert client.delete(f"/api/recordings/{rec['id']}", headers=auth).status_code == 204
    assert _files(media_dir) == []
    assert client.get(f"/api/stories/{sid}/recordings", headers=auth).json() == []


def test_deleting_a_story_removes_its_recordings_and_files(client, auth, media_dir):
    keep = _story(client, auth)
    gone = _story(client, auth)
    _upload(client, auth, keep)
    _upload(client, auth, gone)
    _upload(client, auth, gone)
    assert len(_files(media_dir)) == 3
    assert client.delete(f"/api/stories/{gone}", headers=auth).status_code == 204
    assert len(_files(media_dir)) == 1
    assert len(client.get(f"/api/stories/{keep}/recordings", headers=auth).json()) == 1


def test_deleting_the_account_removes_all_recordings(client, auth, auth2, media_dir):
    mine = _story(client, auth)
    theirs = _story(client, auth2)
    _upload(client, auth, mine)
    _upload(client, auth, mine)
    _upload(client, auth2, theirs)
    assert len(_files(media_dir)) == 3
    assert client.delete("/api/auth/me", headers=auth).status_code == 204
    assert len(_files(media_dir)) == 1  # only the other user's file is left
    assert len(client.get(f"/api/stories/{theirs}/recordings", headers=auth2).json()) == 1


def test_deleting_without_recordings_makes_no_folders(client, auth, media_dir):
    sid = _story(client, auth)
    assert client.delete(f"/api/stories/{sid}", headers=auth).status_code == 204
    assert client.delete("/api/auth/me", headers=auth).status_code == 204
    assert not media_dir.exists()


# ---------------------------------------------------------------- upload size is limited before login
def test_a_huge_upload_without_login_is_refused_early(client, monkeypatch, media_dir):
    monkeypatch.setattr(settings, "max_recording_mb", 1)
    headers = {"Content-Type": "multipart/form-data; boundary=x"}
    # It says up front that it is too big.
    big = b"x" * (2 * 1024 * 1024)
    assert client.post("/api/stories/1/recordings", content=big, headers=headers).status_code == 413
    # It does not say (chunked, no Content-Length): the size is counted while it arrives.
    def body():
        for _ in range(40):
            yield b"x" * (64 * 1024)
    assert client.post("/api/stories/1/recordings", content=body(), headers=headers).status_code == 413
    # A small upload with no login still gets the normal answer.
    small = client.post("/api/stories/1/recordings", files={"file": ("a.m4a", M4A, "audio/mp4")}, data={"name": "x", "consent": "true"})
    assert small.status_code == 401
    assert _files(media_dir) == []


def test_a_413_answer_still_has_cors_headers(client, monkeypatch):
    monkeypatch.setattr(settings, "max_recording_mb", 1)
    r = client.post(
        "/api/stories/1/recordings",
        content=b"x" * (2 * 1024 * 1024),
        headers={"Content-Type": "multipart/form-data; boundary=x", "Origin": "http://localhost:8081"},
    )
    assert r.status_code == 413
    assert r.headers.get("access-control-allow-origin") == "http://localhost:8081"  # the web app can read the error


def test_other_requests_are_not_limited(client, auth, monkeypatch):
    monkeypatch.setattr(settings, "max_recording_mb", 1)
    assert client.get("/api/stories", headers=auth).status_code == 200


# ---------------------------------------------------------------- limits cannot be beaten by many uploads at once
@pytest.fixture
def file_client(tmp_path, fake_generator):
    """A client on a real database file. The normal test database shares ONE connection, which cannot
    be used by several requests at the same moment. Real use has a connection for each request."""
    engine = create_engine(f"sqlite:///{tmp_path / 'parallel.db'}", connect_args={"check_same_thread": False, "timeout": 30})

    @event.listens_for(engine, "connect")
    def _fk(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_story_generator] = lambda: fake_generator
    yield TestClient(app)
    app.dependency_overrides.clear()
    engine.dispose()


def test_parallel_uploads_cannot_pass_the_limits(file_client, monkeypatch):
    c = file_client
    token = c.post("/api/auth/register", json={"email": "p@example.com", "password": "password123"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    sid = c.post("/api/stories/generate", headers=headers, json={"keywords": ["moon"]}).json()["id"]

    monkeypatch.setattr(settings, "max_recordings_per_story", 2)
    barrier = threading.Barrier(6)

    def go(_):
        barrier.wait()  # all six start at the same moment
        return _upload(c, headers, sid).status_code

    with ThreadPoolExecutor(6) as pool:
        codes = list(pool.map(go, range(6)))
    assert codes.count(201) == 2 and codes.count(409) == 4, codes
    assert len(c.get(f"/api/stories/{sid}/recordings", headers=headers).json()) == 2


# ---------------------------------------------------------------- consent is stored
def test_consent_time_and_text_version_are_stored(client, auth):
    sid = _story(client, auth)
    rid = _upload(client, auth, sid).json()["id"]
    db = next(app.dependency_overrides[get_db]())
    try:
        rec = db.scalar(select(StoryRecording).where(StoryRecording.id == rid))
        assert rec.consent_at is not None and rec.consent_text_version == "2026-10-v1"
    finally:
        db.close()


# ---------------------------------------------------------------- files and rows stay together
def test_a_failed_save_leaves_no_file(client, auth, media_dir, monkeypatch):
    from sqlalchemy.orm import Session

    sid = _story(client, auth)

    def boom(self):
        raise RuntimeError("database is down")

    monkeypatch.setattr(Session, "commit", boom)
    safe = TestClient(app, raise_server_exceptions=False)
    assert _upload(safe, auth, sid).status_code == 500
    assert _files(media_dir) == []  # the file written before the error was removed


def test_row_without_a_file_gives_404_not_500(client, auth, media_dir):
    sid = _story(client, auth)
    rec = _upload(client, auth, sid).json()
    url = client.get(f"/api/recordings/{rec['id']}/url", headers=auth).json()["url"]
    for f in _files(media_dir):
        f.unlink()
    assert client.get(url).status_code == 404


def test_a_failed_file_delete_is_logged_and_the_delete_still_works(client, auth, media_dir, monkeypatch, caplog):
    sid = _story(client, auth)
    rec = _upload(client, auth, sid).json()
    real_unlink = Path.unlink

    def stuck(self, *a, **k):
        if self.suffix == ".m4a":
            raise PermissionError("in use")
        return real_unlink(self, *a, **k)

    monkeypatch.setattr(Path, "unlink", stuck)
    with caplog.at_level(logging.WARNING):
        assert client.delete(f"/api/recordings/{rec['id']}", headers=auth).status_code == 204
    assert "Could not delete recording file" in caplog.text
    assert len(_files(media_dir)) == 1  # the file is still there ...
    monkeypatch.setattr(Path, "unlink", real_unlink)  # the disk works again
    # ... and the sweep at the next start removes it, because no row points to it.
    old = time.time() - 7200
    for f in _files(media_dir):
        os_utime = __import__("os").utime
        os_utime(f, (old, old))
    removed = recording_store.sweep_orphans({}, min_age_seconds=3600)
    assert len(removed) == 1 and _files(media_dir) == []


def test_account_delete_goes_on_after_one_file_fails(client, auth, media_dir, monkeypatch):
    sid = _story(client, auth)
    for _ in range(3):
        _upload(client, auth, sid)
    real_unlink = Path.unlink
    calls = {"n": 0}

    def first_fails(self, *a, **k):
        if self.suffix == ".m4a":
            calls["n"] += 1
            if calls["n"] == 1:
                raise PermissionError("in use")
        return real_unlink(self, *a, **k)

    monkeypatch.setattr(Path, "unlink", first_fails)
    assert client.delete("/api/auth/me", headers=auth).status_code == 204
    assert len(_files(media_dir)) == 1  # only the one that failed is left, the other two are gone


def test_sweep_keeps_files_with_a_row_and_young_files(media_dir):
    folder = Path(media_dir) / "recordings" / "7"
    folder.mkdir(parents=True)
    keep, orphan_old, orphan_new = folder / "keep.m4a", folder / "old.m4a", folder / "new.m4a"
    for f in (keep, orphan_old, orphan_new):
        f.write_bytes(b"x")
    old = time.time() - 7200
    for f in (keep, orphan_old):
        __import__("os").utime(f, (old, old))
    removed = recording_store.sweep_orphans({7: {"keep.m4a"}}, min_age_seconds=3600)
    assert [Path(r).name for r in removed] == ["old.m4a"]
    assert keep.exists() and orphan_new.exists() and not orphan_old.exists()


# ---------------------------------------------------------------- audio link and answer
def test_audio_answer_headers(client, auth):
    sid = _story(client, auth)
    rec = _upload(client, auth, sid).json()
    url = client.get(f"/api/recordings/{rec['id']}/url", headers=auth).json()["url"]
    h = client.get(url).headers
    assert h["referrer-policy"] == "no-referrer"
    assert h["content-disposition"] == 'inline; filename="recording.m4a"'
    assert "sandbox" in h["content-security-policy"]


def test_range_edge_cases(client, auth):
    sid = _story(client, auth)
    rec = _upload(client, auth, sid).json()
    url = client.get(f"/api/recordings/{rec['id']}/url", headers=auth).json()["url"]
    one = client.get(url, headers={"Range": "bytes=0-0"})
    assert one.status_code == 206 and one.content == M4A[:1]
    tail = client.get(url, headers={"Range": "bytes=-5"})
    assert tail.status_code == 206 and tail.content == M4A[-5:]
    open_end = client.get(url, headers={"Range": f"bytes={len(M4A) - 3}-"})
    assert open_end.status_code == 206 and open_end.content == M4A[-3:]
    assert client.get(url, headers={"Range": f"bytes={len(M4A) + 10}-"}).status_code == 416


def test_link_after_the_recording_or_account_is_deleted(client, auth, auth2):
    sid = _story(client, auth)
    rec = _upload(client, auth, sid).json()
    url = client.get(f"/api/recordings/{rec['id']}/url", headers=auth).json()["url"]
    assert client.get(url).status_code == 200
    assert client.delete(f"/api/recordings/{rec['id']}", headers=auth).status_code == 204
    assert client.get(url).status_code == 404  # the link was valid, but the recording is gone

    sid2 = _story(client, auth2)
    rec2 = _upload(client, auth2, sid2).json()
    url2 = client.get(f"/api/recordings/{rec2['id']}/url", headers=auth2).json()["url"]
    assert client.delete("/api/auth/me", headers=auth2).status_code == 204
    assert client.get(url2).status_code == 404


def test_forged_links_are_refused(client, auth):
    sid = _story(client, auth)
    rid = _upload(client, auth, sid).json()["id"]
    uid = client.get("/api/auth/me", headers=auth).json()["id"]
    payload = {"purpose": "recording-audio", "rec": rid, "uid": uid, "exp": int(time.time()) + 300}
    # Signed with the login secret itself (not the separate key for recordings).
    assert client.get(f"/api/recordings/{rid}/audio?sig={jwt.encode(payload, settings.jwt_secret, algorithm='HS256')}").status_code == 403
    # No signature at all ("alg: none").
    assert client.get(f"/api/recordings/{rid}/audio?sig={jwt.encode(payload, None, algorithm='none')}").status_code == 403
    # Odd values inside a link that is otherwise made by the server: an answer, never a crash.
    from app.security import _audio_key

    odd = dict(payload, uid="not-a-number")
    assert client.get(f"/api/recordings/{rid}/audio?sig={jwt.encode(odd, _audio_key(), algorithm='HS256')}").status_code == 403


def test_signature_is_hidden_in_the_logs():
    record = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %d', ("1.2.3.4:5", "GET", "/api/recordings/7/audio?sig=eyJhbGciOi.secret.part&x=1", "1.1", 200), None)
    assert RedactSignatureFilter().filter(record) is True
    text = record.getMessage()
    assert "secret" not in text and "sig=REDACTED&x=1" in text


# ---------------------------------------------------------------- numbers and names
@pytest.mark.parametrize("duration", ["nan", "inf", "-inf"])
def test_duration_nan_and_inf(client, auth, duration):
    assert _upload(client, auth, _story(client, auth), duration=duration).status_code == 422


def test_names_with_direction_tricks_and_special_characters(client, auth):
    sid = _story(client, auth)
    tricked = _upload(client, auth, sid, name="\u202eevil\u202c Mom").json()
    assert tricked["name"] == "evil Mom"  # the text-direction override is removed
    special = _upload(client, auth, sid, name='A&B <i>"x"').json()
    assert special["name"] == 'A&B <i>"x"'  # kept as text. The app never treats it as HTML


def test_a_polyglot_file_is_served_as_audio_only(client, auth):
    sid = _story(client, auth)
    data = b"\x00\x00\x00\x18ftypmp42<script>alert(1)</script>" + b"\x00" * 40
    rec = _upload(client, auth, sid, data=data).json()
    url = client.get(f"/api/recordings/{rec['id']}/url", headers=auth).json()["url"]
    r = client.get(url)
    assert r.headers["content-type"] == "audio/mp4" and r.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in r.headers["content-security-policy"]
