# VideoMind

AI-powered video knowledge extraction and semantic search.

VideoMind lets users upload a local video or a YouTube link, then automatically:
1. Extracts audio
2. Transcribes speech
3. Generates embeddings for semantic retrieval
4. Enables timestamp-aware Q&A
5. Generates a study PDF

This README reflects the current codebase state in this workspace.

## Table of Contents

1. Project Status
2. Core Features
3. Architecture
4. Tech Stack
5. Repository Structure
6. How the Data Flows End-to-End
7. Prerequisites
8. Environment Variables (Critical)
9. Local Setup (Step-by-Step)
10. First End-to-End Test Run
11. Processing Stages and Lifecycle
12. API Reference
13. File and Storage Locations
14. Typical Developer Workflows
15. Troubleshooting
16. Known Limitations
17. Deployment Notes

## 1. Project Status

Current implementation status:

- Frontend and backend are integrated and functional for local development.
- Auth supports:
  - Email/password registration and login (Gmail addresses only)
  - Google credential login
- Video ingestion supports:
  - Local file upload
  - YouTube download via background task
- Processing pipeline runs in background daemon threads (no Celery/Redis queue yet).
- Semantic query and AI chat are available.
- PDF generation is available with OpenAI primary and Groq fallback.
- Status updates are available via polling and Server-Sent Events endpoint.

## 2. Core Features

- Authentication with token-based API auth
- Drag-and-drop video upload (supported formats enforced)
- YouTube URL upload with progress polling
- Background pipeline with stage tracking
- Semantic Q&A with timestamped answer metadata
- Transcript-aware AI chat assistant
- PDF generation and download
- History and profile stats
- Retry for failed video processing

## 3. Architecture

```text
Frontend (React + Vite)
  -> Token-authenticated REST calls
Backend (Django + DRF)
  -> Video pipeline orchestration (threaded)
  -> Uses ffmpeg/ffprobe + Groq + OpenAI + yt-dlp

Storage:
  - SQLite for app metadata
  - backend/media/videos for uploaded videos
  - backend/media/pdfs for generated PDFs
  - legacy script directory for transcripts/audio/embeddings:
    Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-
      /jsons
      /audios
      /embeddings.joblib
```

## 4. Tech Stack

Backend:
- Django
- Django REST Framework
- django-cors-headers
- SQLite
- Groq SDK
- OpenAI SDK (used by code paths)
- pandas, numpy, scikit-learn, joblib
- reportlab
- yt-dlp
- ffmpeg, ffprobe

Frontend:
- React
- Vite
- React Router
- Axios
- @react-oauth/google
- react-dropzone
- lucide-react

## 5. Repository Structure

```text
backend/
  api/
    models.py
    serializers.py
    urls.py
    views.py
    management/commands/
  config/
    settings.py
    urls.py
    stream.py
  video_processor/
    pipeline.py
    query.py
    pdf_gen.py
  media/
    videos/
    pdfs/
  templates/
  manage.py

frontend/
  src/
    pages/
    components/
    services/api.js
    context/
    App.jsx
  package.json

Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-/
  pipelIne_api.py
  rag_query.py
  enhance_and_pdf.py
  embeddings.joblib
  audios/
  jsons/
  pdfs/
```

## 6. How the Data Flows End-to-End

### A. Authentication

1. User signs in from frontend.
2. Backend returns DRF token.
3. Frontend stores token in localStorage.
4. Axios adds `Authorization: Token <token>` header on API requests.

### B. Local Video Upload

1. Frontend posts multipart upload to `POST /api/videos/`.
2. Backend validates extension and max file size.
3. Video row created with uploading state.
4. Background thread is launched via `process_video_async(video_id)`.
5. Frontend tracks progress through status endpoint or processing view.

### C. YouTube Upload

1. Frontend posts URL to `POST /api/videos/upload_youtube/`.
2. Backend creates in-memory task id and starts yt-dlp download thread.
3. Frontend polls `GET /api/videos/youtube_status/?task_id=...`.
4. Once downloaded, backend creates a Video record and starts the same pipeline.

### D. Pipeline

1. Optional compress if file > 50 MB.
2. Convert video to MP3.
3. Split audio to 10-minute chunks.
4. Transcribe chunk(s) with Groq Whisper.
5. Merge segments with corrected offsets.
6. Save transcript JSON.
7. Create embeddings (OpenAI text-embedding-3-small) and update `embeddings.joblib`.
8. Generate PDF content and file.
9. Mark video status completed.

### E. Querying

1. Frontend posts question to `POST /api/videos/{id}/query/`.
2. Backend loads cached embeddings (cache invalidates on file change).
3. Filters chunks by cleaned filename for that video.
4. Runs semantic retrieval and returns answer + timestamps.

## 7. Prerequisites

Install these before running:

1. Python 3.10+
2. Node.js 18+
3. ffmpeg and ffprobe on PATH
4. API keys for Groq/OpenAI/Google OAuth

Verify tooling:

```bash
python --version
node --version
ffmpeg -version
ffprobe -version
```

## 8. Environment Variables (Critical)

Important: backend code currently loads `.env` from:

`Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-/.env`

Create this file:

```env
# Required
GROQ_API_KEY=your_groq_api_key
OPENAI_API_KEY=your_openai_api_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Optional
OPENAI_PDF_MODEL=gpt-4o-mini
GROQ_PDF_MODEL=llama-3.3-70b-versatile
PDF_CHUNK_MAX_TOKENS=2400
PDF_CHUNK_OVERLAP_TOKENS=240
PDF_ENHANCE_WORKERS=5
```

## 9. Local Setup (Step-by-Step)

### Step 1: Open workspace root

The root contains both `backend` and `frontend` folders.

### Step 2: Create and activate Python environment

Using venv (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Using conda (optional):

```powershell
conda create -n videomind python=3.11 -y
conda activate videomind
```

### Step 3: Install backend dependencies

```powershell
cd backend
pip install -r requirements.txt
```

If you see `ModuleNotFoundError: No module named 'openai'`, install:

```powershell
pip install openai
```

### Step 4: Run database migrations

```powershell
python manage.py migrate
```

Optional admin user:

```powershell
python manage.py createsuperuser
```

### Step 5: Start backend server

```powershell
python manage.py runserver
```

Backend URLs:
- API base: `http://localhost:8000/api/`
- Admin: `http://localhost:8000/admin/`

### Step 6: Install frontend dependencies

Open a new terminal:

```powershell
cd frontend
npm install
```

### Step 7: Start frontend dev server

```powershell
npm run dev
```

Frontend URL (default): `http://localhost:5173`

### Step 8: Confirm app is live

1. Open frontend URL
2. Register/login
3. Navigate to upload

## 10. First End-to-End Test Run

Follow exactly:

1. Start backend and frontend.
2. Register with a Gmail address or use Google login.
3. Upload a short MP4 file (recommended first test: 1-3 minutes).
4. Wait for processing to finish.
5. Open chat page for that video.
6. Ask a question like: `What are the key points discussed in the first minute?`
7. Open PDF page and verify generated study notes.

Expected first-run outputs:
- A row in videos list
- A transcript JSON file under legacy `jsons/`
- Embedding rows inside `embeddings.joblib`
- PDF file under `backend/media/pdfs/`

## 11. Processing Stages and Lifecycle

Video status values:
- `uploading`
- `processing`
- `completed`
- `failed`

Backend processing stage values used in model and APIs:
- `uploaded`
- `starting_up`
- `compressing`
- `converting_video_to_audio`
- `audio_converted`
- `transcribing`
- `transcribing_audio`
- `transcribed`
- `embedding`
- `generating_embeddings`
- `embedded`
- `generating_pdf`
- `creating_pdf`
- `pdf_generated`

Frontend normalizes these into a 5-step progress UX:
1. `starting_up`
2. `converting_video_to_audio`
3. `transcribing_audio`
4. `generating_embeddings`
5. `creating_pdf`

Status tracking methods:
- Polling: `GET /api/videos/{id}/status/`
- Streaming: `GET /api/videos/{id}/status_stream/?token=<token>` (SSE)

## 12. API Reference

All endpoints are under `/api/`.
Most require token auth header: `Authorization: Token <token>`.

### Auth

- `POST /api/auth/register/`
- `POST /api/auth/login/`
- `POST /api/auth/google_login/`
- `POST /api/auth/logout/`
- `GET /api/auth/me/`

### Videos

- `GET /api/videos/`
- `POST /api/videos/`
- `GET /api/videos/{id}/`
- `DELETE /api/videos/{id}/`
- `GET /api/videos/{id}/status/`
- `GET /api/videos/{id}/status_stream/?token=<token>`
- `POST /api/videos/{id}/retry/`
- `POST /api/videos/{id}/query/`
- `POST /api/videos/{id}/ai_chat/`
- `GET /api/videos/{id}/pdf/`
- `GET /api/videos/{id}/pdf/?refresh=true`
- `GET /api/videos/{id}/audio/?token=<token>`
- `POST /api/videos/upload_youtube/`
- `GET /api/videos/youtube_status/?task_id=<task_id>`
- `GET /api/videos/by_date/`
- `GET /api/videos/daily_stats/`
- `GET /api/videos/date_range/`

### Queries and Profile

- `GET /api/queries/`
- `GET /api/profile/stats/`

## 13. File and Storage Locations

### Django-managed storage

- Uploaded videos: `backend/media/videos/`
- Generated PDFs: `backend/media/pdfs/`
- Database: `backend/db.sqlite3`

### Legacy script storage (still actively used)

- Transcript JSON files: `Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-/jsons/`
- Audio/chunks: `Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-/audios/`
- Embeddings store: `Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-/embeddings.joblib`

## 14. Typical Developer Workflows

### Retry a failed video

API:

```bash
POST /api/videos/{id}/retry/
```

### Regenerate a PDF

API:

```bash
GET /api/videos/{id}/pdf/?refresh=true
```

### Backfill YouTube URLs from filenames

```powershell
cd backend
python manage.py backfill_youtube_urls
python manage.py backfill_youtube_urls --all
python manage.py backfill_youtube_urls --dry-run
```

## 15. Troubleshooting

### ffmpeg or ffprobe not found

Make sure both are installed and discoverable on PATH:

```bash
ffmpeg -version
ffprobe -version
```

### CORS errors from frontend

Update allowed origins in backend settings if frontend uses a non-default port.

### OpenAI key errors during embeddings or PDF

Confirm `OPENAI_API_KEY` exists in the legacy scripts `.env` location.

### Groq errors during transcription or chat

Confirm `GROQ_API_KEY` and retry.

### Processing remains failed

1. Check backend logs
2. Fix key/dependency issue
3. Retry with `POST /api/videos/{id}/retry/`

### Missing openai module

Install manually in active environment:

```powershell
pip install openai
```

### Migration/database issues

```powershell
cd backend
python manage.py migrate --run-syncdb
```

## 16. Known Limitations

- No distributed task queue; background work uses daemon threads in-process.
- YouTube task progress is in-memory and resets when server restarts.
- Embeddings are file-based (`joblib`) rather than vector database.
- SQLite is suitable for local/dev, not high-concurrency production.
- Some stage values in DB are broader than the 5-stage frontend display.

## 17. Deployment Notes

Use `DEPLOYMENT_GUIDE.md` as the primary deployment walkthrough.

High-level deployment requirements:
- Move backend to a persistent server process (e.g., gunicorn).
- Switch from SQLite to managed PostgreSQL.
- Configure production CORS/hosts.
- Set environment variables in hosting platform dashboards.
- Register production origins/redirects in Google OAuth console.

---

If you want, the next update can add:
1. API request/response payload examples for every endpoint
2. A contributor guide with coding standards and commit conventions
3. A production architecture section with Celery/Redis migration plan