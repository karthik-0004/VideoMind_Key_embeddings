"""
Range-request aware video streaming view.

Django's default static file serving does NOT support HTTP Range requests,
which means browsers cannot seek within <video> elements.  This module
provides a lightweight view that:

  1.  Parses the ``Range`` header (e.g. ``bytes=12345-``)
  2.  Returns a **206 Partial Content** response with the correct
      ``Content-Range`` / ``Accept-Ranges`` headers so the browser can seek
      to any position in the video.
  3.  Falls back to a normal 200 response when no Range header is present.
"""

import mimetypes
import os
import re

from django.conf import settings
from django.http import (
    FileResponse,
    HttpResponse,
    HttpResponseNotFound,
    StreamingHttpResponse,
)

# How many bytes to send per chunk when streaming a range request
_CHUNK = 8 * 1024 * 1024  # 8 MB


def _read_range(file_path, start, end):
    """Generator that yields *one* chunk of ``file_path[start:end+1]``."""
    with open(file_path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            read_size = min(_CHUNK, remaining)
            data = f.read(read_size)
            if not data:
                break
            remaining -= len(data)
            yield data


def stream_video(request, path):
    """Serve a file from MEDIA_ROOT/videos/<path> with Range support."""

    file_path = os.path.join(settings.MEDIA_ROOT, "videos", path)

    if not os.path.isfile(file_path):
        return HttpResponseNotFound("File not found")

    file_size = os.path.getsize(file_path)
    content_type, _ = mimetypes.guess_type(file_path)
    content_type = content_type or "application/octet-stream"

    range_header = request.META.get("HTTP_RANGE", "")

    if range_header:
        # Parse "bytes=START-END" (END is optional)
        m = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if m:
            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else file_size - 1
            end = min(end, file_size - 1)

            if start > end or start >= file_size:
                resp = HttpResponse(status=416)
                resp["Content-Range"] = f"bytes */{file_size}"
                return resp

            length = end - start + 1

            resp = StreamingHttpResponse(
                _read_range(file_path, start, end),
                status=206,
                content_type=content_type,
            )
            resp["Content-Length"] = str(length)
            resp["Content-Range"] = f"bytes {start}-{end}/{file_size}"
            resp["Accept-Ranges"] = "bytes"
            return resp

    # No Range header → serve the entire file
    resp = FileResponse(open(file_path, "rb"), content_type=content_type)
    resp["Content-Length"] = str(file_size)
    resp["Accept-Ranges"] = "bytes"
    return resp
