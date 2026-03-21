import json
import logging
import re
import subprocess
import tempfile
import threading
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from django.conf import settings

from youtube_transcript_api import (
    NoTranscriptFound,
    TranscriptsDisabled,
    YouTubeTranscriptApi,
)

from video_processor.pipeline import _run_embeddings

logger = logging.getLogger(__name__)

SCRIPTS_DIR = Path(settings.BASE_DIR).parent / 'Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-'
JSON_DIR = SCRIPTS_DIR / 'jsons'


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


def _fetch_transcript_via_ytdlp(video_key):
    """Fallback transcript retrieval through yt-dlp subtitle download."""
    url = f'https://www.youtube.com/watch?v={video_key}'
    with tempfile.TemporaryDirectory(prefix='yt_subs_') as tmp_dir:
        output_template = str(Path(tmp_dir) / '%(id)s.%(ext)s')
        cmd = [
            'yt-dlp',
            '--no-playlist',
            '--skip-download',
            '--write-auto-subs',
            '--write-subs',
            '--sub-langs',
            'en.*,en',
            '--sub-format',
            'json3',
            '-o',
            output_template,
            url,
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f'yt-dlp subtitle fetch failed: {result.stderr or result.stdout}')

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
                f'Primary transcript API failed for {youtube_key}; attempting yt-dlp subtitle fallback.'
            )
            transcript_entries = _fetch_transcript_via_ytdlp(youtube_key)

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
    except Exception as exc:
        logger.error(f'YouTube transcript pipeline failed for video {video_id}: {exc}', exc_info=True)
        if video:
            video.status = 'failed'
            video.error_message = str(exc)
            video.save(update_fields=['status', 'error_message'])
