import json
import logging
import re
import subprocess
import tempfile
import threading
import xml.etree.ElementTree as ET
import os
import base64
from html import unescape
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from django.conf import settings
import httpx

from youtube_transcript_api import (
    NoTranscriptFound,
    TranscriptsDisabled,
    YouTubeTranscriptApi,
)

from video_processor.pipeline import _run_embeddings

logger = logging.getLogger(__name__)

SCRIPTS_DIR = Path(settings.BASE_DIR).parent / 'Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-'
JSON_DIR = SCRIPTS_DIR / 'jsons'


class YouTubeAccessBlockedError(Exception):
    """Raised when YouTube blocks server-side subtitle retrieval (bot/auth/rate-limit)."""


def process_youtube_video_async(video_id):
    thread = threading.Thread(target=_process_youtube_sync, args=(video_id,), daemon=True)
    thread.start()


def extract_youtube_video_id(youtube_url):
    parsed = urlparse((youtube_url or '').strip())
    host = (parsed.netloc or '').lower()

    if 'youtu.be' in host:
        return parsed.path.strip('/').split('/')[0] if parsed.path else ''

    if 'youtube.com' in host:
        if parsed.path == '/watch':
            return parse_qs(parsed.query).get('v', [''])[0]
        if parsed.path.startswith('/shorts/'):
            return parsed.path.split('/shorts/', 1)[1].split('/')[0]
        if parsed.path.startswith('/embed/'):
            return parsed.path.split('/embed/', 1)[1].split('/')[0]

    match = re.search(r'(?:v=|youtu\.be/)([A-Za-z0-9_-]{6,})', youtube_url or '')
    return match.group(1) if match else ''


def build_youtube_base_name(title_value, fallback='youtube_video'):
    import pipelIne_api

    raw = (title_value or '').strip() or fallback
    return pipelIne_api.clean_filename(raw)


def _fetch_transcript(video_key):
    preferred_en_codes = ['en', 'en-US', 'en-GB', 'en-IN']

    try:
        return YouTubeTranscriptApi.get_transcript(video_key, languages=preferred_en_codes)
    except (TranscriptsDisabled, NoTranscriptFound):
        # Fall back to transcript discovery instead of failing immediately.
        pass
    except Exception:
        pass

    # Try API default selection (any available language).
    try:
        return YouTubeTranscriptApi.get_transcript(video_key)
    except (TranscriptsDisabled, NoTranscriptFound):
        pass
    except Exception:
        pass

    transcripts = YouTubeTranscriptApi.list_transcripts(video_key)

    try:
        return transcripts.find_transcript(preferred_en_codes).fetch()
    except (NoTranscriptFound, TranscriptsDisabled):
        pass

    try:
        return transcripts.find_generated_transcript(preferred_en_codes).fetch()
    except (NoTranscriptFound, TranscriptsDisabled):
        pass

    # If any transcript can be translated to English, use that.
    for transcript in transcripts:
        try:
            if getattr(transcript, 'is_translatable', False):
                return transcript.translate('en').fetch()
        except Exception:
            continue

    for transcript in transcripts:
        try:
            return transcript.fetch()
        except Exception:
            continue

    raise NoTranscriptFound(video_key, [], {})


def _parse_json3_to_entries(json3_path):
    with open(json3_path, 'r', encoding='utf-8') as fp:
        payload = json.load(fp)

    entries = []
    for event in payload.get('events', []):
        segs = event.get('segs') or []
        text = ''.join(seg.get('utf8', '') for seg in segs).replace('\n', ' ').strip()
        if not text:
            continue

        start_ms = float(event.get('tStartMs', 0.0))
        duration_ms = float(event.get('dDurationMs', 0.0))
        entries.append(
            {
                'start': start_ms / 1000.0,
                'duration': max(0.0, duration_ms / 1000.0),
                'text': text,
            }
        )

    return entries


def _parse_timedtext_xml(xml_text):
    root = ET.fromstring(xml_text)
    entries = []

    for node in root.findall('text'):
        raw = ''.join(node.itertext()).strip()
        text = raw.replace('\n', ' ')
        if not text:
            continue

        start = float(node.attrib.get('start', '0') or 0)
        duration = float(node.attrib.get('dur', '0') or 0)
        entries.append(
            {
                'start': start,
                'duration': max(0.0, duration),
                'text': text,
            }
        )

    return entries


def _fetch_transcript_via_timedtext(video_key):
    """Try YouTube timedtext endpoint without yt-dlp/browser dependencies."""
    lang_candidates = ['en', 'en-US', 'en-GB', 'en-IN']
    base_url = 'https://www.youtube.com/api/timedtext'

    with httpx.Client(timeout=20.0, headers={'User-Agent': 'Mozilla/5.0'}) as client:
        for lang in lang_candidates:
            for kind in (None, 'asr'):
                params = {'v': video_key, 'lang': lang}
                if kind:
                    params['kind'] = kind

                try:
                    resp = client.get(base_url, params=params)
                    if resp.status_code != 200:
                        continue
                    xml_text = (resp.text or '').strip()
                    if not xml_text or '<text' not in xml_text:
                        continue

                    entries = _parse_timedtext_xml(xml_text)
                    if entries:
                        return entries
                except Exception:
                    continue

    raise NoTranscriptFound(video_key, [], {})


def _extract_caption_track_urls_from_watch_html(html_text):
    # Try common player response patterns and decode escaped JSON string content.
    patterns = [
        r'ytInitialPlayerResponse\s*=\s*(\{.+?\});',
        r'"playerResponse":"(\{.+?\})"',
    ]

    player_response = None
    for pattern in patterns:
        match = re.search(pattern, html_text, flags=re.DOTALL)
        if not match:
            continue
        raw = match.group(1)
        try:
            if raw.startswith('{'):
                player_response = json.loads(raw)
            else:
                player_response = json.loads(unescape(raw).encode('utf-8').decode('unicode_escape'))
            break
        except Exception:
            continue

    if not player_response:
        return []

    captions = (((player_response.get('captions') or {}).get('playerCaptionsTracklistRenderer') or {}))
    tracks = captions.get('captionTracks') or []
    return [track.get('baseUrl') for track in tracks if track.get('baseUrl')]


def _fetch_transcript_via_watch_page(video_key):
    """Fetch caption track baseUrl from watch page, then download transcript from that URL."""
    watch_url = f'https://www.youtube.com/watch?v={video_key}'

    with httpx.Client(timeout=20.0, headers={'User-Agent': 'Mozilla/5.0'}) as client:
        resp = client.get(watch_url)
        if resp.status_code != 200:
            raise NoTranscriptFound(video_key, [], {})

        track_urls = _extract_caption_track_urls_from_watch_html(resp.text or '')
        if not track_urls:
            raise NoTranscriptFound(video_key, [], {})

        # Prefer English track when possible.
        english_tracks = [u for u in track_urls if ('lang=en' in u or 'lang%3Den' in u)]
        ordered_tracks = english_tracks + [u for u in track_urls if u not in english_tracks]

        for base_url in ordered_tracks:
            for fmt in ('json3', None):
                try:
                    target = f'{base_url}&fmt={fmt}' if fmt else base_url
                    track_resp = client.get(target)
                    if track_resp.status_code != 200:
                        continue

                    body = (track_resp.text or '').strip()
                    if not body:
                        continue

                    if body.startswith('{'):
                        tmp_payload = json.loads(body)
                        events = tmp_payload.get('events') or []
                        entries = []
                        for event in events:
                            segs = event.get('segs') or []
                            text = ''.join(seg.get('utf8', '') for seg in segs).replace('\n', ' ').strip()
                            if not text:
                                continue
                            entries.append(
                                {
                                    'start': float(event.get('tStartMs', 0.0)) / 1000.0,
                                    'duration': max(0.0, float(event.get('dDurationMs', 0.0)) / 1000.0),
                                    'text': text,
                                }
                            )
                        if entries:
                            return entries
                    elif '<text' in body:
                        entries = _parse_timedtext_xml(body)
                        if entries:
                            return entries
                except Exception:
                    continue

    raise NoTranscriptFound(video_key, [], {})


def _fetch_transcript_via_ytdlp(video_key):
    """Fallback transcript retrieval through yt-dlp subtitle download."""
    url = f'https://www.youtube.com/watch?v={video_key}'
    with tempfile.TemporaryDirectory(prefix='yt_subs_') as tmp_dir:
        output_template = str(Path(tmp_dir) / '%(id)s.%(ext)s')
        cookies_path = os.getenv('YTDLP_COOKIES_PATH', '').strip()
        cookies_b64 = os.getenv('YTDLP_COOKIES_B64', '').strip()
        temp_cookies_file = None

        if not cookies_path and cookies_b64:
            try:
                cookie_text = base64.b64decode(cookies_b64).decode('utf-8', errors='ignore')
                temp_cookies_file = Path(tmp_dir) / 'cookies.txt'
                temp_cookies_file.write_text(cookie_text, encoding='utf-8')
                cookies_path = str(temp_cookies_file)
            except Exception:
                cookies_path = ''

        cmd = [
            'yt-dlp',
            '--no-playlist',
            '--skip-download',
            '--write-auto-subs',
            '--write-subs',
            '--extractor-args',
            'youtube:player_client=android',
            '--sub-langs',
            'en.*,en',
            '--sub-format',
            'json3',
            '-o',
            output_template,
            url,
        ]

        if cookies_path:
            cmd.extend(['--cookies', cookies_path])

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            hint = ''
            err_blob = (result.stderr or result.stdout or '').lower()
            if 'not a bot' in err_blob or 'sign in to confirm' in err_blob:
                hint = (
                    ' YouTube requires authenticated cookies in this environment. '
                    'Set YTDLP_COOKIES_PATH to a mounted cookies.txt file or set YTDLP_COOKIES_B64.'
                )
                raise YouTubeAccessBlockedError(f'yt-dlp subtitle fetch blocked: {result.stderr or result.stdout}{hint}')

            if 'too many requests' in err_blob or 'http error 429' in err_blob:
                raise YouTubeAccessBlockedError(
                    'yt-dlp subtitle fetch blocked due to rate limiting (HTTP 429).'
                )

            raise RuntimeError(f'yt-dlp subtitle fetch failed: {result.stderr or result.stdout}{hint}')

        json3_files = sorted(Path(tmp_dir).glob(f'{video_key}*.json3'))
        if not json3_files:
            raise NoTranscriptFound(video_key, [], {})

        for json3_file in json3_files:
            try:
                entries = _parse_json3_to_entries(json3_file)
                if entries:
                    return entries
            except Exception:
                continue

    raise NoTranscriptFound(video_key, [], {})


def _process_youtube_sync(video_id):
    from api.models import Video
    from video_processor.pdf_gen import generate_pdf

    video = None
    try:
        video = Video.objects.get(id=video_id)
        video.status = 'processing'
        video.processing_stage = 'starting_up'
        video.error_message = None
        video.audio_path = None
        video.save(update_fields=['status', 'processing_stage', 'error_message', 'audio_path'])

        youtube_key = extract_youtube_video_id(video.youtube_url)
        if not youtube_key:
            raise ValueError('Invalid YouTube URL')

        try:
            transcript_entries = _fetch_transcript(youtube_key)
        except (TranscriptsDisabled, NoTranscriptFound):
            logger.warning(
                f'Primary transcript API failed for {youtube_key}; attempting watch-page captions fallback.'
            )
            try:
                transcript_entries = _fetch_transcript_via_watch_page(youtube_key)
            except (TranscriptsDisabled, NoTranscriptFound):
                logger.warning(
                    f'Watch-page fallback failed for {youtube_key}; attempting timedtext fallback.'
                )
                try:
                    transcript_entries = _fetch_transcript_via_timedtext(youtube_key)
                except (TranscriptsDisabled, NoTranscriptFound):
                    logger.warning(
                        f'Timedtext fallback failed for {youtube_key}; attempting yt-dlp subtitle fallback.'
                    )
                    try:
                        transcript_entries = _fetch_transcript_via_ytdlp(youtube_key)
                    except YouTubeAccessBlockedError as blocked_err:
                        logger.error(f'yt-dlp fallback blocked for {youtube_key}: {blocked_err}')
                        raise
                    except Exception as ytdlp_err:
                        logger.error(f'yt-dlp fallback failed for {youtube_key}: {ytdlp_err}')
                        raise NoTranscriptFound(youtube_key, [], {})

        base_name = build_youtube_base_name(video.title, fallback=f'youtube_{video.id}')
        json_filename = f'0_{base_name}.mp3.json'
        json_path = JSON_DIR / json_filename
        JSON_DIR.mkdir(parents=True, exist_ok=True)

        chunks = []
        full_text_parts = []
        last_end = 0.0
        for entry in transcript_entries:
            start = float(entry.get('start', 0.0))
            duration = float(entry.get('duration', 0.0))
            end = float(start + duration)
            text = str(entry.get('text', '')).strip()
            if not text:
                continue
            chunks.append(
                {
                    'number': '0',
                    'title': base_name,
                    'start': start,
                    'end': end,
                    'text': text,
                }
            )
            full_text_parts.append(text)
            last_end = max(last_end, end)

        if not chunks:
            raise NoTranscriptFound(youtube_key, [], {})

        payload = {
            'chunks': chunks,
            'text': ' '.join(full_text_parts).strip(),
        }
        with open(json_path, 'w', encoding='utf-8') as fp:
            json.dump(payload, fp, indent=2)

        video.json_path = str(json_path)
        video.duration_seconds = last_end
        video.processing_stage = 'generating_embeddings'
        video.save(update_fields=['json_path', 'duration_seconds', 'processing_stage'])

        _run_embeddings(video.id, str(json_path), base_name)

        video.processing_stage = 'embedded'
        video.save(update_fields=['processing_stage'])

        video.processing_stage = 'creating_pdf'
        video.save(update_fields=['processing_stage'])

        generate_pdf(video.id)

        video.processing_stage = 'pdf_generated'
        video.status = 'completed'
        video.save(update_fields=['processing_stage', 'status'])

    except (TranscriptsDisabled, NoTranscriptFound):
        logger.error(f'No usable transcript for YouTube video {video_id}', exc_info=True)
        if video:
            video.status = 'failed'
            video.error_message = 'This video has no captions available. Please download and upload the video file directly.'
            video.save(update_fields=['status', 'error_message'])
    except YouTubeAccessBlockedError:
        logger.error(f'YouTube blocked subtitle retrieval for video {video_id}', exc_info=True)
        if video:
            video.status = 'failed'
            video.error_message = (
                'YouTube blocked subtitle retrieval from the server (bot/rate-limit check). '
                'Please try again later or upload the video file directly.'
            )
            video.save(update_fields=['status', 'error_message'])
    except Exception as exc:
        logger.error(f'YouTube transcript pipeline failed for video {video_id}: {exc}', exc_info=True)
        if video:
            video.status = 'failed'
            video.error_message = str(exc)
            video.save(update_fields=['status', 'error_message'])
