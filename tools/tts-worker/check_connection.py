"""Check that the backend's HTTP client and the voice worker understand each other.

Run it with the BACKEND's Python (it needs the backend code), while a worker is running:

    ..\\..\\backend\\.venv\\Scripts\\python check_connection.py [worker address] [api key]

Default address: http://127.0.0.1:9000. With the "fake" model it takes a second. With the real model the first
piece takes a long time (the model loads), so the timeout is long.
"""

import io
import os
import sys
import time
import wave

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
sys.path.insert(0, BACKEND)
os.environ.setdefault("JWT_SECRET", "check-connection-secret-0123456789abcdef")  # the backend settings need one

from app.config import settings  # noqa: E402
from app.services.narrator import HttpTtsClient, TtsError  # noqa: E402

address = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:9000"
settings.tts_url = address
settings.tts_api_key = sys.argv[2] if len(sys.argv) > 2 else ""
settings.tts_timeout_seconds = 1800


def sample(seconds: float, rate: int = 24000) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x01\x02" * int(rate * seconds))
    return out.getvalue()


client = HttpTtsClient()

started = time.time()
data = client.synthesize(sample(6), "Once upon a time, a little fox looked up at the moon.", "en")
with wave.open(io.BytesIO(data)) as w:
    print(f"OK: {w.getnframes() / w.getframerate():.1f} s of audio, {w.getframerate()} Hz, in {time.time() - started:.1f} s")

try:
    client.synthesize(sample(2), "Too short sample", "en")
    print("PROBLEM: a 2 second sample was accepted")
    sys.exit(1)
except TtsError as e:
    print("OK: a sample that is too short is refused with a safe message:", e.message)

try:
    client.synthesize(sample(6), "Hello", "he")
    print("PROBLEM: Hebrew was accepted")
    sys.exit(1)
except TtsError:
    print("OK: Hebrew is refused (English only)")
print("All good.")
