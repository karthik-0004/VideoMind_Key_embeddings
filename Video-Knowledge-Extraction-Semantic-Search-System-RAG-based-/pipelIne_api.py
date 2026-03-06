import os
import json
import time
import subprocess
import requests
import pandas as pd
import joblib
from groq import Groq
from dotenv import load_dotenv
load_dotenv()

# --------------------------
# CONFIG
# --------------------------
VIDEO_DIR = "videos"
AUDIO_DIR = "audios"
JSON_DIR = "jsons"
CHUNKS_DIR = os.path.join(AUDIO_DIR, "chunks")

EMBEDDING_FILE = "embeddings.joblib"

OLLAMA_EMBED_URL = "http://localhost:11434/api/embed"
OLLAMA_MODEL = "bge-m3"

CHUNK_SECONDS = 600  # 10 minutes

# --------------------------
# ENV KEYS (SAFE)
# --------------------------
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise RuntimeError("ERROR: GROQ_API_KEY not set in environment")

groq_client = Groq(api_key=GROQ_API_KEY)

# --------------------------
# Utility
# --------------------------
def ensure_dirs():
    os.makedirs(AUDIO_DIR, exist_ok=True)
    os.makedirs(JSON_DIR, exist_ok=True)
    os.makedirs(CHUNKS_DIR, exist_ok=True)

def clean_filename(name: str) -> str:
    bad_chars = ['\\', '/', ':', '*', '?', '"', '<', '>', '|']
    for ch in bad_chars:
        name = name.replace(ch, "")
    return name.strip()

def run_cmd(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def get_audio_duration_seconds(audio_path: str) -> float:
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        audio_path
    ]
    return float(subprocess.check_output(cmd).decode().strip())

# --------------------------
# Ollama Embeddings
# --------------------------
def create_embeddings(text_list):
    r = requests.post(
        OLLAMA_EMBED_URL,
        json={"model": OLLAMA_MODEL, "input": text_list},
        timeout=300
    )
    r.raise_for_status()
    return r.json()["embeddings"]

# --------------------------
# 1) Video -> MP3
# --------------------------
def convert_videos_to_mp3_incremental():
    if not os.path.exists(VIDEO_DIR):
        print(f"ERROR: Videos folder not found: {VIDEO_DIR}")
        return

    for file in os.listdir(VIDEO_DIR):
        if not file.lower().endswith((".mp4", ".mkv", ".mov", ".avi", ".webm")):
            continue

        base = clean_filename(os.path.splitext(file)[0])
        if "#" in base:
            tutorial_name, tutorial_number = base.split("#", 1)
        else:
            tutorial_name, tutorial_number = base, "0"

        output_mp3 = f"{tutorial_number}_{tutorial_name.strip()}.mp3"
        output_path = os.path.join(AUDIO_DIR, output_mp3)

        if os.path.exists(output_path):
            continue

        print(f"Converting video: {file}")
        run_cmd(["ffmpeg", "-y", "-i", os.path.join(VIDEO_DIR, file), output_path])

# --------------------------
# Split MP3 into chunks
# --------------------------
def split_audio_ffmpeg(input_path):
    base = os.path.splitext(os.path.basename(input_path))[0]
    pattern = os.path.join(CHUNKS_DIR, f"{base}_part_%03d.mp3")

    for f in os.listdir(CHUNKS_DIR):
        if f.startswith(base) and f.endswith(".mp3"):
            os.remove(os.path.join(CHUNKS_DIR, f))

    run_cmd([
        "ffmpeg", "-y",
        "-i", input_path,
        "-f", "segment",
        "-segment_time", str(CHUNK_SECONDS),
        "-c", "copy",
        pattern
    ])

    return sorted(
        os.path.join(CHUNKS_DIR, f)
        for f in os.listdir(CHUNKS_DIR)
        if f.startswith(base) and f.endswith(".mp3")
    )

# --------------------------
# 2) MP3 -> JSON (Groq Whisper)
# --------------------------
def transcribe_new_audios_to_json_groq():
    for audio in os.listdir(AUDIO_DIR):
        if not audio.lower().endswith(".mp3"):
            continue

        audio_path = os.path.join(AUDIO_DIR, audio)
        json_path = os.path.join(JSON_DIR, f"{audio}.json")

        if os.path.exists(json_path):
            continue

        base = os.path.splitext(audio)[0]
        number, title = (base.split("_", 1) + ["0"])[:2]

        print(f"Transcribing audio: {audio}")
        parts = split_audio_ffmpeg(audio_path)

        all_chunks, full_text, offset = [], "", 0.0

        for idx, part in enumerate(parts, start=1):
            print(f"   -> Part {idx}/{len(parts)}")

            with open(part, "rb") as f:
                for attempt in range(3):
                    try:
                        result = groq_client.audio.transcriptions.create(
                            file=f,
                            model="whisper-large-v3-turbo",
                            response_format="verbose_json",
                        )
                        break
                    except Exception as e:
                        print(f"WARNING: Retry {attempt+1}: {e}")
                        time.sleep(2)
                else:
                    raise RuntimeError("ERROR: Transcription failed")

            for seg in result.segments:
                all_chunks.append({
                    "number": number,
                    "title": title,
                    "start": float(seg["start"]) + offset,
                    "end": float(seg["end"]) + offset,
                    "text": seg["text"].strip()
                })

            full_text += result.text.strip() + " "
            offset += get_audio_duration_seconds(part)

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump({"chunks": all_chunks, "text": full_text.strip()}, f, indent=2)

        for p in parts:
            os.remove(p)

        print(f"SUCCESS: Saved JSON: {json_path}")

# --------------------------
# 3) JSON -> Embeddings (Incremental)
# --------------------------
def update_embeddings_joblib_incremental():
    if os.path.exists(EMBEDDING_FILE):
        df_existing = joblib.load(EMBEDDING_FILE)
        next_id = int(df_existing["chunk_id"].max()) + 1 if len(df_existing) else 0
        embedded_keys = set(df_existing["title"].astype(str) + "__" + df_existing["start"].astype(str))
    else:
        df_existing = pd.DataFrame()
        next_id = 0
        embedded_keys = set()

    rows = []

    for file in os.listdir(JSON_DIR):
        if not file.endswith(".json"):
            continue

        content = json.load(open(os.path.join(JSON_DIR, file), encoding="utf-8"))
        chunks = content.get("chunks", [])

        new_chunks = [c for c in chunks if f'{c["title"]}__{c["start"]}' not in embedded_keys]
        if not new_chunks:
            continue

        texts = [c["text"] for c in new_chunks]
        embeddings = create_embeddings(texts)

        for c, emb in zip(new_chunks, embeddings):
            c["chunk_id"] = next_id
            c["embedding"] = emb
            rows.append(c)
            next_id += 1

    if rows:
        df_new = pd.DataFrame(rows)
        df_final = pd.concat([df_existing, df_new], ignore_index=True) if len(df_existing) else df_new
        joblib.dump(df_final, EMBEDDING_FILE)
        print(f"SUCCESS: Updated embeddings: {EMBEDDING_FILE}")
    else:
        print("SUCCESS: No new embeddings to add")

# --------------------------
# MAIN
# --------------------------
def run_incremental_pipeline():
    ensure_dirs()
    start = time.time()

    convert_videos_to_mp3_incremental()
    transcribe_new_audios_to_json_groq()
    update_embeddings_joblib_incremental()

    t = int(time.time() - start)
    print(f"SUCCESS: Pipeline complete! Time: {t//3600:02d}:{(t%3600)//60:02d}:{t%60:02d}")

if __name__ == "__main__":
    run_incremental_pipeline()
