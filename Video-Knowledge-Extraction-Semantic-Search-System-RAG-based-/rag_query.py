import os
import joblib
import numpy as np
import re
import logging
from pathlib import Path
from sklearn.metrics.pairwise import cosine_similarity
from dotenv import load_dotenv
from openai import OpenAI

# Load .env — path relative to this file's directory
load_dotenv(dotenv_path=Path(__file__).parent / '.env')

logger = logging.getLogger(__name__)

# --------------------------
# CONFIG
# --------------------------
EMBEDDING_FILE = "embeddings.joblib"

# OpenAI config — key loaded from environment, never hardcoded
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise EnvironmentError("OPENAI_API_KEY is not set in your environment / .env file")
_openai_client = OpenAI(api_key=OPENAI_API_KEY)
OPENAI_EMBED_MODEL = "text-embedding-3-small"  # 1536-dim vectors
OPENAI_BATCH_SIZE = 2048  # OpenAI allows up to 2048 texts per request


# --------------------------
# OpenAI embedding helpers
# --------------------------
def create_embedding(text):
    """Embed a single query text with OpenAI; returns a plain list[float]."""
    try:
        response = _openai_client.embeddings.create(
            model=OPENAI_EMBED_MODEL,
            input=[text],
        )
        return response.data[0].embedding  # plain Python list[float]
    except Exception as e:
        logger.error(f"OpenAI embedding failed for query '{text[:60]}...': {e}", exc_info=True)
        raise


def create_embeddings_batch(texts):
    """Batch embed texts with OpenAI, handling the 2048-texts-per-request limit."""
    if not texts:
        return []
    all_embeddings = []
    total_batches = (len(texts) + OPENAI_BATCH_SIZE - 1) // OPENAI_BATCH_SIZE
    for batch_num, i in enumerate(range(0, len(texts), OPENAI_BATCH_SIZE), start=1):
        batch = texts[i : i + OPENAI_BATCH_SIZE]
        try:
            response = _openai_client.embeddings.create(
                model=OPENAI_EMBED_MODEL,
                input=batch,
            )
            # response.data is guaranteed to be ordered to match input order
            all_embeddings.extend([item.embedding for item in response.data])
            logger.debug(f"Embedded batch {batch_num}/{total_batches} ({len(batch)} texts).")
        except Exception as e:
            logger.error(
                f"OpenAI embedding failed on batch {batch_num}/{total_batches}: {e}",
                exc_info=True,
            )
            raise
    return all_embeddings


# --------------------------
# Sentence splitting
# --------------------------
def split_into_sentences(text):
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if len(s.strip()) > 20]

# --------------------------
# Second-stage timestamp refinement (uses pre-computed query embedding)
# --------------------------
def refine_timestamp(query_emb, row, sent_embeddings_map=None):
    sentences = split_into_sentences(row["text"])

    if not sentences:
        return float(row["start"]), float(row["end"])

    # Use pre-computed sentence embeddings if available
    row_key = f"{row['title']}_{row['start']}"
    if sent_embeddings_map and row_key in sent_embeddings_map:
        sent_embs = sent_embeddings_map[row_key]
    else:
        sent_embs = np.array(
            create_embeddings_batch(sentences),
            dtype=np.float32
        )

    scores = cosine_similarity(query_emb, sent_embs)[0]
    best_idx = int(np.argmax(scores))

    chunk_start = float(row["start"])
    chunk_end = float(row["end"])
    duration = max(chunk_end - chunk_start, 1.0)

    ratio = best_idx / max(len(sentences), 1)
    refined_start = chunk_start + ratio * duration
    refined_end = refined_start + duration / len(sentences)

    return refined_start, refined_end

# --------------------------
# Search chunks (optimized — minimal API calls)
# --------------------------
def search_chunks(df, query, top_k=3):
    # 1 OpenAI call: embed the query
    query_emb = np.array(create_embedding(query), dtype=np.float32).reshape(1, -1)
    doc_embeddings = np.array(df["embedding"].tolist(), dtype=np.float32)

    scores = cosine_similarity(query_emb, doc_embeddings)[0]
    top_idx = np.argsort(scores)[::-1][:top_k]

    # Collect ALL sentences across top results for batch embedding (1 OpenAI call)
    top_rows = [df.iloc[idx] for idx in top_idx]
    all_sentences = []
    sentence_map = {}  # row_key -> (start_idx, count)

    for row in top_rows:
        sentences = split_into_sentences(row["text"])
        row_key = f"{row['title']}_{row['start']}"
        sentence_map[row_key] = (len(all_sentences), len(sentences))
        all_sentences.extend(sentences)

    # 1 OpenAI call for ALL sentence embeddings
    sent_embeddings_map = {}
    if all_sentences:
        all_embs = np.array(create_embeddings_batch(all_sentences), dtype=np.float32)
        for row in top_rows:
            row_key = f"{row['title']}_{row['start']}"
            start_i, count = sentence_map[row_key]
            if count > 0:
                sent_embeddings_map[row_key] = all_embs[start_i:start_i + count]

    # Refine timestamps using pre-computed embeddings (0 extra API calls)
    results = []
    for i, idx in enumerate(top_idx):
        row = top_rows[i]
        refined_start, refined_end = refine_timestamp(query_emb, row, sent_embeddings_map)

        results.append({
            "score": float(scores[idx]),
            "title": row["title"],
            "start": refined_start,
            "end": refined_end,
            "text": row["text"]
        })

    return results

# --------------------------
# Chat-style answer formatter
# --------------------------
def format_chat_answer(results):
    if not results:
        return "Sorry, I could not find a relevant explanation in the videos."

    def mmss(sec):
        sec = int(sec)
        return f"{sec//60:02d}:{sec%60:02d}"

    first = results[0]

    answer = (
        f"Your query is explained in the video "
        f"\"'{first['title']}'\" around \"{mmss(first['start'])}–{mmss(first['end'])}\", "
        f"where {first['text'].strip().rstrip('.')}. "
    )

    if len(results) > 1:
        second = results[1]
        answer += (
            f"A related explanation also appears around "
            f"{mmss(second['start'])}–{mmss(second['end'])}, "
            f"where {second['text'].strip().rstrip('.')}. "
        )

    return answer.strip()

# --------------------------
# MAIN
# --------------------------
if __name__ == "__main__":
    print("SUCCESS: Loading embeddings...")
    df = joblib.load(EMBEDDING_FILE)
    print(f"SUCCESS: Loaded {len(df)} chunks\n")

    while True:
        query = input("Ask a question (or type 'exit'): ").strip()
        if query.lower() == "exit":
            print("Exiting...")
            break
        if not query:
            continue

        results = search_chunks(df, query)
        chat_answer = format_chat_answer(results)

        print("\n--- ANSWER ---\n")
        print(chat_answer)
