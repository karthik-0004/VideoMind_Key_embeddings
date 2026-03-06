"""
Video Processing Pipeline Integration
Wraps existing pipelIne_api.py logic
"""
import os
import sys
import time
import threading
import shutil
import subprocess
import json
from pathlib import Path
from django.conf import settings
import logging
from dotenv import load_dotenv
import httpx

# Load .env from the RAG scripts directory
_ENV_PATH = Path(settings.BASE_DIR).parent / 'Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-' / '.env'
load_dotenv(dotenv_path=_ENV_PATH)

logger = logging.getLogger(__name__)

# Add the existing scripts directory to Python path
SCRIPTS_DIR = Path(settings.BASE_DIR).parent / 'Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-'
sys.path.insert(0, str(SCRIPTS_DIR))


def process_video_async(video_id):
    """
    Process video asynchronously (runs in thread for now, should be Celery in production)
    """
    thread = threading.Thread(target=_process_video_sync, args=(video_id,))
    thread.daemon = True
    thread.start()


def _process_video_sync(video_id):
    """
    Actual video processing logic - processes individual video file directly
    """
    from api.models import Video, PDF
    import pipelIne_api
    from groq import Groq
    import joblib
    import pandas as pd
    
    video = None
    try:
        video = Video.objects.get(id=video_id)
        logger.info(f"Starting video processing for video ID: {video_id}, file: {video.file.name}")
        
        # Update status
        video.status = 'processing'
        video.processing_stage = 'uploaded'
        video.save()
        
        # Get the uploaded video file path (Django media file)
        video_path = Path(video.file.path)
        video_filename = video_path.name
        logger.info(f"Django video path: {video_path}")
        
        # Ensure the original script directories exist
        logger.info("Ensuring directories exist...")
        pipelIne_api.ensure_dirs()
        
        # Define paths for processing
        audio_dir = SCRIPTS_DIR / 'audios'
        json_dir = SCRIPTS_DIR / 'jsons'
        chunks_dir = audio_dir / 'chunks'
        
        # Clean filename for audio/json
        base_name = pipelIne_api.clean_filename(video_filename.rsplit('.', 1)[0])
        audio_filename = f"0_{base_name}.mp3"
        audio_path = audio_dir / audio_filename
        json_filename = f"{audio_filename}.json"
        json_path = json_dir / json_filename
        
        logger.info(f"Output paths - Audio: {audio_path}, JSON: {json_path}")

        # ── Step 0: Compress Video ──────────────────────────────────────────
        COMPRESS_THRESHOLD_MB = 50
        file_size_mb = video_path.stat().st_size / (1024 * 1024)

        if file_size_mb > COMPRESS_THRESHOLD_MB:
            logger.info(f"Step 0/5: Compressing video ({file_size_mb:.1f} MB > {COMPRESS_THRESHOLD_MB} MB threshold)...")
            video.processing_stage = 'compressing'
            video.save()

            compressed_path = video_path.with_suffix('.compressed.mp4')
            try:
                subprocess.run([
                    "ffmpeg", "-y",
                    "-i", str(video_path),
                    "-vcodec", "libx264",
                    "-crf", "23",
                    "-preset", "fast",
                    str(compressed_path)
                ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

                # Swap in-place: replace original with compressed
                new_size_mb = compressed_path.stat().st_size / (1024 * 1024)
                reduction_pct = (1 - new_size_mb / file_size_mb) * 100
                logger.info(
                    f"  Compressing video: {file_size_mb:.0f}MB → {new_size_mb:.0f}MB "
                    f"({reduction_pct:.0f}% reduction)"
                )
                compressed_path.replace(video_path)  # atomic rename on same filesystem
                # Refresh the path object after replacement
                video_path = Path(video.file.path)

            except Exception as compress_err:
                logger.warning(
                    f"  Compression failed ({compress_err}). Continuing with original file."
                )
                # Clean up temp file if it exists
                if compressed_path.exists():
                    compressed_path.unlink(missing_ok=True)
        else:
            logger.info(
                f"Step 0/5: Skipping compression — file is {file_size_mb:.1f} MB "
                f"(≤ {COMPRESS_THRESHOLD_MB} MB threshold)."
            )

        # ── Step 1: Convert to MP3 ─────────────────────────────────────────
        logger.info("Step 1/5: Converting video to audio...")
        video.processing_stage = 'audio_converted'
        video.save()
        
        if not audio_path.exists():
            logger.info(f"Converting {video_filename} to MP3...")
            subprocess.run([
                "ffmpeg", "-y", "-i", str(video_path), str(audio_path)
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            logger.info("Audio conversion complete")
        else:
            logger.info("Audio file already exists, skipping conversion")
        
        # Save audio path to model
        video.audio_path = str(audio_path)
        video.save()
        
        # Step 2/5: Transcribe using Groq
        logger.info("Step 2/5: Transcribing audio to text...")
        video.processing_stage = 'transcribing'
        video.save()
        
        if not json_path.exists():
            logger.info("Splitting audio into chunks...")
            # Split audio into 10-minute chunks
            chunk_pattern = str(chunks_dir / f"{base_name}_part_%03d.mp3")
            subprocess.run([
                "ffmpeg", "-y",
                "-i", str(audio_path),
                "-f", "segment",
                "-segment_time", "600",
                "-c", "copy",
                chunk_pattern
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            # Get all chunk files
            chunk_files = sorted(chunks_dir.glob(f"{base_name}_part_*.mp3"))
            logger.info(f"Created {len(chunk_files)} audio chunks")

            # Use a shared httpx client with a timeout so API calls never hang indefinitely
            _http_client = httpx.Client(timeout=httpx.Timeout(120.0, connect=10.0))
            groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"), http_client=_http_client)

            # ── Language Detection (first chunk only) ────────────────────────
            LANG_DETECT_MODEL = "whisper-large-v3-turbo"
            ENGLISH_MODEL     = "whisper-large-v3-turbo"   # distil-whisper-large-v3-en decommissioned by Groq
            MULTILANG_MODEL   = "whisper-large-v3-turbo"   # 99 languages

            detected_language = "english"  # safe default
            if chunk_files:
                logger.info("  Detecting language from first chunk...")
                try:
                    with open(chunk_files[0], "rb") as _f:
                        _probe = groq_client.audio.transcriptions.create(
                            file=_f,
                            model=LANG_DETECT_MODEL,
                            response_format="verbose_json",
                        )
                    detected_language = (getattr(_probe, 'language', None) or "english").lower().strip()
                    logger.info(f"  Language detection complete: {detected_language}")
                except Exception as _lang_err:
                    logger.warning(f"  Language detection failed ({_lang_err}), defaulting to multilingual model.")
                    detected_language = "unknown"

            if detected_language == "english":
                chosen_model = ENGLISH_MODEL
                logger.info(f"  Detected language: English → using {chosen_model}")
            else:
                chosen_model = MULTILANG_MODEL
                logger.info(f"  Detected language: {detected_language.title()} → using {chosen_model}")

            # ── Pre-compute chunk durations (sequential, deterministic) ──────
            # Must be done before parallel transcription so offsets are correct.
            chunk_durations = []
            for cf in chunk_files:
                _dur_cmd = [
                    "ffprobe", "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    str(cf)
                ]
                chunk_durations.append(
                    float(subprocess.check_output(_dur_cmd).decode().strip())
                )

            # Compute cumulative time offsets per chunk: chunk[i] starts at sum(durations[:i])
            chunk_offsets = [0.0]
            for d in chunk_durations[:-1]:
                chunk_offsets.append(chunk_offsets[-1] + d)

            # ── Parallel Transcription via ThreadPoolExecutor ─────────────────
            PARALLEL_WORKERS = 3   # Safe for Groq free-tier RPM
            MAX_RETRIES      = 1   # One retry per failed chunk

            logger.info(
                f"  Transcribing {len(chunk_files)} chunk(s) in parallel "
                f"(workers={PARALLEL_WORKERS}, model={chosen_model})..."
            )

            # Results stored in a fixed-size list so merge order == chunk order
            chunk_results = [None] * len(chunk_files)

            def _transcribe_chunk(args):
                """Transcribe a single chunk; retry once on failure."""
                idx, chunk_file = args
                last_err = None
                for attempt in range(MAX_RETRIES + 1):
                    try:
                        with open(chunk_file, "rb") as _f:
                            result = groq_client.audio.transcriptions.create(
                                file=_f,
                                model=chosen_model,
                                response_format="verbose_json",
                            )
                        logger.info(
                            f"  Chunk {idx + 1}/{len(chunk_files)} transcribed"
                            + (f" (after retry)" if attempt > 0 else "")
                        )
                        return idx, result
                    except Exception as e:
                        last_err = e
                        if attempt < MAX_RETRIES:
                            logger.warning(
                                f"  Chunk {idx + 1}/{len(chunk_files)} failed "
                                f"(attempt {attempt + 1}), retrying once... Error: {e}"
                            )
                        else:
                            logger.error(
                                f"  Chunk {idx + 1}/{len(chunk_files)} failed after "
                                f"{MAX_RETRIES + 1} attempt(s): {e}"
                            )
                            raise

            from concurrent.futures import ThreadPoolExecutor, as_completed
            with ThreadPoolExecutor(max_workers=PARALLEL_WORKERS) as executor:
                futures = {
                    executor.submit(_transcribe_chunk, (i, cf)): i
                    for i, cf in enumerate(chunk_files)
                }
                for future in as_completed(futures):
                    chunk_idx, result = future.result()   # raises if transcription failed
                    chunk_results[chunk_idx] = result

            # ── Merge results in correct chunk order with proper offsets ──────
            all_chunks = []
            full_text  = ""
            for chunk_idx, result in enumerate(chunk_results):
                offset = chunk_offsets[chunk_idx]
                for seg in result.segments:
                    # Groq returns segment objects (not dicts), so use getattr with dict fallback
                    seg_start = float(seg["start"] if isinstance(seg, dict) else seg.start)
                    seg_end   = float(seg["end"]   if isinstance(seg, dict) else seg.end)
                    seg_text  = (seg["text"] if isinstance(seg, dict) else seg.text).strip()
                    all_chunks.append({
                        "number": "0",
                        "title":  base_name,
                        "start":  seg_start + offset,
                        "end":    seg_end   + offset,
                        "text":   seg_text
                    })
                full_text += result.text.strip() + " "

            # ── Clean up chunk files ─────────────────────────────────────────
            for cf in chunk_files:
                try:
                    cf.unlink(missing_ok=True)
                except Exception:
                    pass   # non-fatal

            # Save JSON
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump({"chunks": all_chunks, "text": full_text.strip()}, f, indent=2)

            logger.info(f"Transcription complete ({len(all_chunks)} segments), saved to {json_path}")
            video.processing_stage = 'transcribed'
            video.save()
        else:
            logger.info("JSON file already exists, skipping transcription")
            video.processing_stage = 'transcribed'
            video.save()
        
        # Step 3/5: Generate embeddings (OpenAI text-embedding-3-small, 1536-dim)
        logger.info("Step 3/5: Generating embeddings...")
        video.processing_stage = 'embedding'
        video.save()

        # Load or create embeddings dataframe
        embedding_file = SCRIPTS_DIR / 'embeddings.joblib'
        if embedding_file.exists():
            df_existing = joblib.load(str(embedding_file))
            next_id = int(df_existing["chunk_id"].max()) + 1 if len(df_existing) else 0
            embedded_keys = set(df_existing["title"].astype(str) + "__" + df_existing["start"].astype(str))
        else:
            df_existing = pd.DataFrame()
            next_id = 0
            embedded_keys = set()

        # Load JSON and check for new chunks
        with open(json_path, encoding="utf-8") as f:
            content = json.load(f)

        chunks = content.get("chunks", [])
        new_chunks = [c for c in chunks if f'{c["title"]}__{c["start"]}' not in embedded_keys]

        if new_chunks:
            logger.info(f"Generating embeddings for {len(new_chunks)} new chunks...")
            texts = [c["text"] for c in new_chunks]

            # --- OpenAI client setup ---
            from openai import OpenAI as _OpenAI
            OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
            if not OPENAI_API_KEY:
                raise EnvironmentError("OPENAI_API_KEY is not set in environment / .env")
            openai_client = _OpenAI(
                api_key=OPENAI_API_KEY,
                timeout=120.0,  # prevent indefinite hangs
            )
            OPENAI_EMBED_MODEL = "text-embedding-3-small"  # 1536-dim vectors
            OPENAI_BATCH_SIZE = 2048  # OpenAI allows up to 2048 texts per request

            # --- batch embedding ---
            embeddings = []
            total_batches = (len(texts) + OPENAI_BATCH_SIZE - 1) // OPENAI_BATCH_SIZE
            for batch_num, i in enumerate(range(0, len(texts), OPENAI_BATCH_SIZE), start=1):
                batch = texts[i : i + OPENAI_BATCH_SIZE]
                logger.info(f"  Embedding batch {batch_num}/{total_batches} ({len(batch)} texts)...")
                try:
                    response = openai_client.embeddings.create(
                        model=OPENAI_EMBED_MODEL,
                        input=batch,
                    )
                    # response.data is ordered to match input order
                    embeddings.extend([item.embedding for item in response.data])
                    logger.info(f"  Batch {batch_num}/{total_batches} embedded successfully.")
                except Exception as embed_err:
                    logger.error(
                        f"  OpenAI embedding failed on batch {batch_num}/{total_batches}: {embed_err}",
                        exc_info=True,
                    )
                    raise

            # Save embeddings BEFORE moving to next step
            rows = []
            for c, emb in zip(new_chunks, embeddings):
                c["chunk_id"] = next_id
                c["embedding"] = emb
                rows.append(c)
                next_id += 1

            df_new = pd.DataFrame(rows)
            df_final = pd.concat([df_existing, df_new], ignore_index=True) if len(df_existing) else df_new
            joblib.dump(df_final, str(embedding_file))
            logger.info(f"Embeddings updated, total chunks: {len(df_final)}")
        else:
            logger.info("No new chunks to embed")

        video.processing_stage = 'embedded'
        video.save()
        logger.info("Embeddings generation complete")
        
        # Step 4/5: Generate PDF
        logger.info("Step 4/5: Generating PDF...")
        video.processing_stage = 'generating_pdf'
        video.save()

        from . import pdf_gen
        logger.info(f"Calling generate_pdf for video {video.id}")
        pdf_gen.generate_pdf(video_id)
        logger.info("PDF generation complete")

        # Only mark as pdf_generated AFTER it actually succeeded
        video.processing_stage = 'pdf_generated'
        video.save()
        
        # Mark as completed
        video.status = 'completed'
        video.save()
        logger.info(f"Video processing completed successfully for video ID: {video_id}")
        
    except Exception as e:
        error_message = str(e)
        logger.error(f"Error processing video {video_id}: {error_message}", exc_info=True)

        if video:
            video.status = 'failed'
            if 'OPENAI_API_KEY' in error_message:
                video.error_message = (
                    "OpenAI API key is missing. "
                    "Set OPENAI_API_KEY in your .env file and restart the server."
                )
            elif 'openai' in error_message.lower() or 'RateLimitError' in type(e).__name__:
                video.error_message = (
                    f"OpenAI embedding error: {error_message}"
                )
            else:
                video.error_message = error_message
            video.save()


