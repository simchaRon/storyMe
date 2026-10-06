"""Small pieces that sit around the whole app."""

import logging
import re

from fastapi import HTTPException
from fastapi.responses import JSONResponse

from .config import settings

# Only the recording upload gets this check. Other requests are small JSON.
_UPLOAD_PATH = re.compile(r"^/api/stories/\d+/recordings$")
_OVERHEAD = 64 * 1024  # form fields and boundaries around the file


class MaxBodySizeMiddleware:
    """Refuse a too-big upload while it arrives, before the body is saved and before login is checked.

    FastAPI reads the whole form first and checks the login after. Without this, anyone could send
    gigabytes (also in chunks, with no Content-Length) and fill the disk. The size comes from
    `settings.max_recording_mb` and is read on every request.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST" or not _UPLOAD_PATH.match(scope["path"]):
            return await self.app(scope, receive, send)

        limit = settings.max_recording_mb * 1024 * 1024 + _OVERHEAD
        declared = dict(scope["headers"]).get(b"content-length", b"")
        if declared.isdigit() and int(declared) > limit:
            response = JSONResponse({"detail": "The recording is too big"}, status_code=413)
            return await response(scope, receive, send)

        received = 0

        async def guarded_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    # An HTTPException is passed on as it is (a 413 answer). Other errors would become a 400.
                    raise HTTPException(413, "The recording is too big")
            return message

        await self.app(scope, guarded_receive, send)


_SIGNATURE = re.compile(r"(sig=)[^&\s\"]+")


class RedactSignatureFilter(logging.Filter):
    """The link to a recording has a secret signature in the address. Do not write it into the logs."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = _SIGNATURE.sub(r"\1REDACTED", record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(_SIGNATURE.sub(r"\1REDACTED", a) if isinstance(a, str) else a for a in record.args)
        return True
