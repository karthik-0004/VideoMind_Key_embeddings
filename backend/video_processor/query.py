"""
Query Processing Integration
Wraps existing rag_query.py logic with performance optimizations
"""
import sys
from pathlib import Path
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

# Add the existing scripts directory to Python path
SCRIPTS_DIR = Path(settings.BASE_DIR).parent / 'Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-'
sys.path.insert(0, str(SCRIPTS_DIR))

# Module-level cache for embeddings (avoids reloading 8MB+ file on every query)
_embeddings_cache = None
_embeddings_file_mtime = None


def query_video(video_id, question):
    """
    Query a video using RAG with optimized caching
    Returns dict with answer and timestamp info
    """
    from api.models import Video
    import rag_query
    import joblib
    import pipelIne_api
    
    global _embeddings_cache, _embeddings_file_mtime
    
    video = Video.objects.get(id=video_id)
    
    if video.status != 'completed':
        raise ValueError("Video processing not complete")
    
    # Load embeddings with caching
    embedding_file = SCRIPTS_DIR / 'embeddings.joblib'
    
    # Check if we need to reload (file changed or no cache)
    current_mtime = embedding_file.stat().st_mtime if embedding_file.exists() else None
    
    if _embeddings_cache is None or _embeddings_file_mtime != current_mtime:
        logger.info("Loading embeddings from disk (cache miss or file updated)")
        df = joblib.load(str(embedding_file))
        _embeddings_cache = df
        _embeddings_file_mtime = current_mtime
    else:
        logger.info("Using cached embeddings (cache hit)")
        df = _embeddings_cache
    
    # Filter to this video's chunks using cleaned filename (more reliable than title)
    video_filename = Path(video.file.name).name
    base_name = pipelIne_api.clean_filename(video_filename.rsplit('.', 1)[0])
    
    # Match on the exact base_name used during processing
    df_video = df[df['title'] == base_name]
    
    if len(df_video) == 0:
        logger.warning(f"No chunks found for base_name '{base_name}', using all chunks")
        df_video = df
    else:
        logger.info(f"Found {len(df_video)} chunks for video '{base_name}'")
    
    # Search chunks (this includes timestamp refinement via Ollama)
    # NOTE: Timestamp refinement adds API calls but improves precision
    results = rag_query.search_chunks(df_video, question, top_k=3)
    
    # Format answer
    answer = rag_query.format_chat_answer(results)
    
    # Extract timestamp from top result
    timestamp_start = results[0]['start'] if results else None
    timestamp_end = results[0]['end'] if results else None
    
    return {
        'answer': answer,
        'timestamp_start': timestamp_start,
        'timestamp_end': timestamp_end,
        'raw_results': results,
    }
