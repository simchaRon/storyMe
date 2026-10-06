"""Voice worker: says a piece of text in the voice of a short recording (voice cloning, English).

It is a small separate web server. The backend sends it a voice sample and some text, and it
answers with a WAV file. Run it with:

    .venv\Scripts\python -m uvicorn server:app --host 127.0.0.1 --port 9000

Settings (environment variables):
    TTS_MODEL    "turbo" (default, faster) or "standard" (slower, more controls) or "fake" (a beep, for tests)
    TTS_API_KEY  if set, every request must send it in the X-Api-Key header
    TTS_DEVICE   "cpu" (default) or "cuda" if there is an NVIDIA graphics card
    PRELOAD      "1" to load the model when the server starts, not at the first request

The voice sample is decoded here (phones send m4a, browsers send webm), so the backend needs no audio tools.
"""

import hashlib
import hmac
import io
import logging
import math
import os
import tempfile
import threading
import time
import wave
from contextlib import asynccontextmanager
from typing import Optional

import av
import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response

log = logging.getLogger("tts-worker")

MODEL_NAME = os.environ.get("TTS_MODEL", "turbo")
API_KEY = os.environ.get("TTS_API_KEY", "")
DEVICE = os.environ.get("TTS_DEVICE", "cpu")

MAX_TEXT_CHARS = 600  # the backend sends about 250 characters at a time
MAX_REFERENCE_BYTES = 15 * 1024 * 1024
REFERENCE_SECONDS = 30  # the model uses only the first part of a sample. More does not help
INSPECT_SECONDS = 300  # the longest sample we measure
MIN_REFERENCE_SECONDS = 5.0  # the model needs more than 5 seconds
DECODE_TIME_LIMIT = 20.0  # seconds. A strange file must not keep us busy
SAMPLE_RATE = 24000  # what the model works with


_lock = threading.Lock()  # one piece at a time. The model is big and the computer is shared
_decode_slots = threading.Semaphore(2)  # at most two files are decoded at the same time
_model = None
_prepared_for: Optional[str] = None  # hash of the sample the model is ready for


# ---------------------------------------------------------------- the model
class FakeModel:
    """For tests: a short quiet beep instead of speech. Needs no download."""

    sr = SAMPLE_RATE

    def prepare_conditionals(self, path, **_):
        with wave.open(path, "rb") as w:
            if w.getnframes() / w.getframerate() <= 5.0:
                raise AssertionError("Audio prompt must be longer than 5 seconds!")

    def generate(self, text, **_):
        import torch

        seconds = min(0.05 * len(text), 20.0)
        t = torch.arange(int(self.sr * seconds)) / self.sr
        return (0.1 * torch.sin(2 * math.pi * 220 * t)).unsqueeze(0)


def load_model():
    global _model
    if _model is None:
        log.info("Loading the %s model on %s ...", MODEL_NAME, DEVICE)
        if MODEL_NAME == "fake":
            _model = FakeModel()
        elif MODEL_NAME == "standard":
            from chatterbox.tts import ChatterboxTTS

            _model = ChatterboxTTS.from_pretrained(device=DEVICE)
        else:
            from chatterbox.tts_turbo import ChatterboxTurboTTS

            _model = ChatterboxTurboTTS.from_pretrained(device=DEVICE)
        log.info("Model ready")
    return _model




@asynccontextmanager
async def lifespan(_app):
    if os.environ.get("PRELOAD") == "1":
        load_model()
    yield


app = FastAPI(title="DreamTale voice worker", lifespan=lifespan)


# ---------------------------------------------------------------- audio helpers
def sniff_format(data: bytes) -> Optional[str]:
    """What kind of audio is this, by its first bytes? Returns the name FFmpeg uses, or None."""
    if len(data) < 12:
        return None
    if data[4:8] == b"ftyp":
        return "mp4"  # m4a (what phones record)
    if data[:4] == bytes([0x1A, 0x45, 0xDF, 0xA3]):  # EBML header: WebM / Matroska
        return "matroska,webm"  # webm (what browsers record)
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "wav"
    if data[:4] == b"OggS":
        return "ogg"
    if data[0] == 0xFF and data[1] in (0xF1, 0xF9):
        return "aac"
    if data[:3] == b"ID3" or (data[0] == 0xFF and (data[1] & 0xE0) == 0xE0 and (data[1] & 0x06) != 0):
        return "mp3"
    return None


def decode_reference(data: bytes, seconds: int = REFERENCE_SECONDS) -> np.ndarray:
    """Any common audio file (wav, m4a, mp3, webm, ogg) -> mono 16-bit samples at 24 kHz, at most `seconds` long.

    The file comes from a user, so: only the formats above are opened (chosen from the first bytes, not from a
    name), at most two files are decoded at once, and decoding stops after DECODE_TIME_LIMIT seconds."""
    fmt = sniff_format(data)
    if fmt is None:
        raise ValueError("not a kind of audio we accept")
    chunks: list[np.ndarray] = []
    total = 0
    limit = SAMPLE_RATE * seconds
    started = time.monotonic()
    with _decode_slots:
        with av.open(io.BytesIO(data), format=fmt) as container:
            stream = next((s for s in container.streams if s.type == "audio"), None)
            if stream is None:
                raise ValueError("no audio in the file")
            resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
            for frame in container.decode(stream):
                if time.monotonic() - started > DECODE_TIME_LIMIT:
                    raise ValueError("the file takes too long to read")
                for out in resampler.resample(frame):
                    samples = out.to_ndarray().reshape(-1)
                    chunks.append(samples)
                    total += samples.size
                if total >= limit:
                    break
    if not chunks:
        raise ValueError("the file has no sound")
    return np.concatenate(chunks)[:limit]


def to_wav_bytes(samples_16bit: np.ndarray, rate: int) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(samples_16bit.astype("<i2").tobytes())
    return out.getvalue()


def float_to_16bit(wav) -> np.ndarray:
    """The model returns a float tensor (1, N) between -1 and 1."""
    arr = wav.squeeze(0).detach().cpu().numpy() if hasattr(wav, "detach") else np.asarray(wav).reshape(-1)
    return (np.clip(arr, -1.0, 1.0) * 32767).astype(np.int16)


# ---------------------------------------------------------------- web interface
def _check_key(key: Optional[str]) -> None:
    if API_KEY and not hmac.compare_digest(key or "", API_KEY):
        raise HTTPException(401, "wrong key")


@app.get("/health")
def health(x_api_key: Optional[str] = Header(default=None)):
    _check_key(x_api_key)
    return {"ok": True, "model": MODEL_NAME, "device": DEVICE, "loaded": _model is not None}


def _read_reference(upload: UploadFile) -> bytes:
    data = upload.file.read(MAX_REFERENCE_BYTES + 1)
    if not data or len(data) > MAX_REFERENCE_BYTES:
        raise HTTPException(422, "the voice sample is empty or too big")
    return data


@app.post("/inspect")
def inspect(reference: UploadFile = File(...), x_api_key: Optional[str] = Header(default=None)):
    """How many seconds of sound does a recording have? (The backend does not trust the length the app sends.)"""
    _check_key(x_api_key)
    data = _read_reference(reference)
    try:
        samples = decode_reference(data, seconds=INSPECT_SECONDS)
    except Exception:
        raise HTTPException(422, "the voice sample is not audio we can read")
    return {"seconds": round(samples.size / SAMPLE_RATE, 2)}


@app.post("/synthesize")
def synthesize(
    text: str = Form(...),
    language: str = Form("en"),
    reference_id: str = Form(""),
    reference: Optional[UploadFile] = File(None),
    x_api_key: Optional[str] = Header(default=None),
):
    """Say `text` in a cloned voice.

    The first call for a voice sends the sample (`reference`). The next calls can send only its fingerprint
    (`reference_id`, the SHA-256 of the file): the worker keeps the voice ready. If it does not have that
    voice, it answers 409 and the caller sends the sample again."""
    _check_key(x_api_key)
    if language != "en":
        raise HTTPException(422, "only English is supported")
    text = " ".join(text.split())
    if not 1 <= len(text) <= MAX_TEXT_CHARS:
        raise HTTPException(422, f"the text must be 1 to {MAX_TEXT_CHARS} characters")

    samples = None
    if reference is not None:
        data = _read_reference(reference)
        key = hashlib.sha256(data).hexdigest()  # the fingerprint is always worked out here, never trusted
        try:
            samples = decode_reference(data)
        except Exception:
            raise HTTPException(422, "the voice sample is not audio we can read")
        if samples.size / SAMPLE_RATE <= MIN_REFERENCE_SECONDS:
            raise HTTPException(422, "the voice sample is too short")
    else:
        key = reference_id

    with _lock:
        model = load_model()
        global _prepared_for
        if samples is None and (not key or _prepared_for != key):
            raise HTTPException(409, "send the voice sample again")
        if samples is not None and _prepared_for != key:  # the sample changed: get the voice ready
            path = None
            try:
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                    path = f.name
                    f.write(to_wav_bytes(samples, SAMPLE_RATE))
                model.prepare_conditionals(path)
            except AssertionError:  # for example: the sample is shorter than 5 seconds
                _prepared_for = None
                raise HTTPException(422, "the voice sample is too short")
            except Exception:
                _prepared_for = None
                log.exception("Could not prepare the voice")
                raise HTTPException(500, "could not prepare the voice")
            finally:
                if path:
                    try:
                        os.unlink(path)
                    except OSError:
                        pass
            _prepared_for = key
        try:
            wav = model.generate(text)
        except Exception:
            log.exception("Could not make speech")
            raise HTTPException(500, "could not make speech")
        pcm = float_to_16bit(wav)
    return Response(content=to_wav_bytes(pcm, model.sr), media_type="audio/wav")
