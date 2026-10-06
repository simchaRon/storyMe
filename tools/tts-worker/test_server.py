"""Tests for the voice worker's web interface. They use the "fake" model, so nothing is downloaded.

Run:  .venv\Scripts\python -m pytest test_server.py
"""

import io
import os
import tempfile
import wave

os.environ["TTS_MODEL"] = "fake"  # must be set before the server is imported
os.environ.pop("TTS_API_KEY", None)

import av
import numpy as np
import pytest
from fastapi.testclient import TestClient

import server

client = TestClient(server.app)


def tone_wav(seconds: float, rate: int = 16000) -> bytes:
    t = np.arange(int(rate * seconds)) / rate
    samples = (0.3 * np.sin(2 * np.pi * 220 * t) * 32767).astype("<i2")
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(samples.tobytes())
    return out.getvalue()


def encode(fmt: str, codec: str, seconds: float = 6.0, rate: int = 44100) -> bytes:
    """Make a real m4a / webm file, like a phone or a browser records."""
    t = np.arange(int(rate * seconds)) / rate
    samples = (0.3 * np.sin(2 * np.pi * 220 * t) * 32767).astype("<i2").reshape(1, -1)
    path = tempfile.mktemp(suffix="." + fmt)
    try:
        with av.open(path, "w") as container:
            stream = container.add_stream(codec, rate=rate)
            stream.layout = "mono"
            frame = av.AudioFrame.from_ndarray(samples, format="s16", layout="mono")
            frame.sample_rate = rate
            for packet in stream.encode(frame):
                container.mux(packet)
            for packet in stream.encode(None):
                container.mux(packet)
        return open(path, "rb").read()
    finally:
        if os.path.exists(path):
            os.unlink(path)


def say(reference: bytes, text: str = "Hello there", language: str = "en", headers=None):
    return client.post(
        "/synthesize",
        files={"reference": ("ref.bin", reference, "application/octet-stream")},
        data={"text": text, "language": language},
        headers=headers or {},
    )


def test_health():
    r = client.get("/health").json()
    assert r["ok"] is True and r["model"] == "fake"


def test_makes_a_wav_file():
    r = say(tone_wav(6))
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav"
    with wave.open(io.BytesIO(r.content)) as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, 24000)
        assert w.getnframes() > 0


@pytest.mark.parametrize("fmt, codec, rate", [("m4a", "aac", 44100), ("webm", "libopus", 48000), ("mp3", "libmp3lame", 44100)])
def test_reads_what_phones_and_browsers_record(fmt, codec, rate):
    try:
        data = encode(fmt, codec, rate=rate)
    except Exception as e:  # this build of the audio library may lack an encoder. Then there is nothing to test
        pytest.skip(f"cannot make a {fmt} test file here: {e}")
    samples = server.decode_reference(data)
    assert samples.dtype == np.int16 and 5.5 * 24000 < samples.size < 6.5 * 24000  # about 6 s at 24 kHz
    assert say(data).status_code == 200


def test_a_long_sample_is_cut_to_30_seconds():
    assert server.decode_reference(tone_wav(45)).size == 30 * 24000


def test_bad_requests_are_refused_with_422():
    assert say(tone_wav(6), language="he").status_code == 422  # English only
    assert say(tone_wav(6), text="").status_code == 422
    assert say(tone_wav(6), text="x" * 601).status_code == 422
    assert say(b"this is not audio at all").status_code == 422
    assert say(b"").status_code == 422
    assert say(tone_wav(2)).status_code == 422  # shorter than 5 seconds


def test_the_voice_is_prepared_only_when_the_sample_changes(monkeypatch):
    calls = []
    original = server.FakeModel.prepare_conditionals

    def counting(self, path, **kw):
        calls.append(path)
        return original(self, path, **kw)

    monkeypatch.setattr(server.FakeModel, "prepare_conditionals", counting)
    server._prepared_for = None
    first, second = tone_wav(6), tone_wav(7)
    say(first), say(first, "More text"), say(first, "Even more")
    assert len(calls) == 1
    say(second)
    assert len(calls) == 2


def test_a_failed_preparation_is_not_remembered(monkeypatch):
    server._prepared_for = None
    assert say(tone_wav(2)).status_code == 422
    assert server._prepared_for is None
    assert say(tone_wav(6)).status_code == 200  # a good sample works right after


def test_temporary_files_are_removed():
    before = set(os.listdir(tempfile.gettempdir()))
    server._prepared_for = None
    say(tone_wav(6))
    say(tone_wav(2))
    leftovers = [f for f in set(os.listdir(tempfile.gettempdir())) - before if f.endswith(".wav")]
    assert leftovers == []


def test_api_key(monkeypatch):
    monkeypatch.setattr(server, "API_KEY", "secret")
    assert client.get("/health").status_code == 401
    assert say(tone_wav(6)).status_code == 401
    assert say(tone_wav(6), headers={"X-Api-Key": "wrong"}).status_code == 401
    assert say(tone_wav(6), headers={"X-Api-Key": "secret"}).status_code == 200
    assert client.get("/health", headers={"X-Api-Key": "secret"}).status_code == 200


# ---------------------------------------------------------------- the voice stays ready between pieces
def say_by_id(reference_id: str, text: str = "Hello there", headers=None):
    return client.post("/synthesize", data={"text": text, "language": "en", "reference_id": reference_id}, headers=headers or {})


def test_the_next_pieces_do_not_need_the_sample_again():
    import hashlib

    server._prepared_for = None
    sample = tone_wav(6)
    fingerprint = hashlib.sha256(sample).hexdigest()
    assert say_by_id(fingerprint).status_code == 409  # the worker does not have this voice yet
    assert say(sample).status_code == 200  # the first piece sends the sample
    assert say_by_id(fingerprint, "The second piece").status_code == 200  # the next pieces send only the fingerprint
    assert say_by_id("0" * 64).status_code == 409  # another voice: the sample is needed
    assert say_by_id("").status_code == 409


def test_the_fingerprint_sent_with_a_sample_is_not_trusted():
    server._prepared_for = None
    sample = tone_wav(6)
    r = client.post(
        "/synthesize",
        files={"reference": ("ref.bin", sample, "application/octet-stream")},
        data={"text": "Hello", "language": "en", "reference_id": "a-lie"},
    )
    assert r.status_code == 200
    assert say_by_id("a-lie").status_code == 409  # the worker worked out the real fingerprint itself


def test_inspect_measures_the_real_length():
    r = client.post("/inspect", files={"reference": ("ref.bin", tone_wav(12.5), "application/octet-stream")})
    assert r.status_code == 200 and abs(r.json()["seconds"] - 12.5) < 0.1
    assert client.post("/inspect", files={"reference": ("x", b"not audio at all, really not", "application/octet-stream")}).status_code == 422
    assert client.post("/inspect", files={"reference": ("x", b"", "application/octet-stream")}).status_code == 422


def test_inspect_needs_the_key(monkeypatch):
    monkeypatch.setattr(server, "API_KEY", "secret")
    files = {"reference": ("ref.bin", tone_wav(6), "application/octet-stream")}
    assert client.post("/inspect", files=files).status_code == 401
    assert client.post("/inspect", files=files, headers={"X-Api-Key": "secret"}).status_code == 200


def test_only_known_audio_types_are_opened():
    assert server.sniff_format(tone_wav(1)) == "wav"
    assert server.sniff_format(b"<html><body>hello world</body></html>") is None
    playlist = b"#EXTM3U" + bytes([10]) + b"http://example.com/a.mp3" + bytes([10])  # points to a network address
    assert server.sniff_format(playlist) is None
    assert server.sniff_format(b"short") is None
    with pytest.raises(ValueError):
        server.decode_reference(playlist)


def test_a_file_that_takes_too_long_to_read_is_stopped(monkeypatch):
    monkeypatch.setattr(server, "DECODE_TIME_LIMIT", -1.0)  # "too long" at once
    with pytest.raises(ValueError):
        server.decode_reference(tone_wav(6))
    assert say(tone_wav(6)).status_code == 422


def test_five_seconds_is_not_enough():
    assert say(tone_wav(5.0)).status_code == 422
    assert say(tone_wav(5.5)).status_code == 200
