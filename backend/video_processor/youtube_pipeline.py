import json
import logging
import re
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
    try:
        return YouTubeTranscriptApi.get_transcript(video_key, languages=['en'])
    except (TranscriptsDisabled, NoTranscriptFound):
        raise
    except Exception:
        pass

    transcripts = YouTubeTranscriptApi.list_transcripts(video_key)

    try:
        return transcripts.find_generated_transcript(['en']).fetch()
    except (NoTranscriptFound, TranscriptsDisabled):
        pass

    for transcript in transcripts:
        try:
            return transcript.fetch()
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

        transcript_entries = _fetch_transcript(youtube_key)

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
