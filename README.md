# VideoMind

An AI-powered video knowledge extraction, study guide generation, and semantic search system.

VideoMind lets users upload a local video or provide a YouTube link, then automatically:
1. Extracts audio
2. Transcribes speech using Groq (Whisper-v3)
3. Generates embeddings using OpenAI for semantic retrieval
4. Enables timestamp-aware Q&A and Chat
5. Generates comprehensive study PDFs

## Architectural Design (In One Word)

**RAG**

*(Retrieval-Augmented Generation. The system orchestrates an event-driven pipeline that ingests media, splits it into semantically embedded chunks, and retrieves the most relevant transcript segments to answer user queries with timestamp-aware accuracy.)*

## Key Features

- **Robust Authentication**: Token-based REST API auth with Google OAuth and Email/Password support.
- **Multiple Upload Channels**: Drag-and-drop local video uploads and direct YouTube URL processing via `yt-dlp`.
- **Cloud Storage (Cloudinary)**: Fully integrated with Cloudinary for fast, scalable, and secure cloud media storage.
- **Background Pipeline**: Asynchronous media processing (Audio extraction, chunking, transcription, embedding).
- **AI-Powered Insights**: Transcript-aware chat assistant with jump-to-timestamp capabilities.
- **Study Guide Generation**: Automated PDF generation mapping the entire video's knowledge.

## Tech Stack

**Frontend**:
- React 19, Vite, React Router DOM
- Built-in dynamic styling with `lucide-react` icons
- Axios, Google OAuth (`@react-oauth/google`)

**Backend**:
- Django 5.0, Django REST Framework
- SQLite / PostgreSQL (via `dj-database-url`)
- **Cloudinary** & `django-cloudinary-storage` for scalable cloud media

**AI & Data Processing**:
- **Groq SDK** and `whisper-large-v3-turbo` for hyper-fast massively parallel transcription
- **OpenAI SDK** (`text-embedding-3-small`) for semantic chunk embedding
- FFmpeg & FFprobe for media manipulation
- Joblib, Pandas, Scikit-learn for vector indexing
- ReportLab for PDF rendering

## Cloudinary Storage Integration

We have transitioned to **Cloudinary** for our primary cloud storage solution. 
- Media files (uploaded videos, generated PDFs) are now safely stored and served from Cloudinary.
- Django leverages `django-cloudinary-storage` with seamless local/cloud fallback based on environment configuration (`USE_CLOUD_STORAGE=True`).
- Optimized video streaming endpoints leverage Cloudinary's dynamic CDN.

## Repository Structure

```text
├── backend/                  # Django REST API and processing daemon
│   ├── api/                  # Models, views, endpoints, auth
│   ├── config/               # Settings (Cloudinary, CORS, DB)
│   ├── video_processor/      # Core pipeline tasks, PDF generation
│   └── requirements.txt      # Python dependencies
├── frontend/                 # React SPAs
│   ├── src/                  # App views, components, API services
│   └── package.json          # Node dependencies
└── Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-/
    ├── embeddings.joblib     # Vector index store
    ├── jsons/                # Transcript JSON outputs
    ├── audios/               # Processed audio chunks
    └── .env                  # Critical Environment file!
```

## How the Pipeline Flows

1. **Ingestion**: Video uploaded via POST directly to Cloudinary or YouTube link downloaded via `yt-dlp`.
2. **Setup**: File size checked; optionally compressed if >50MB via FFmpeg.
3. **Audio Extraction & Chunking**: Video converted to MP3 and split into 10-minute chunks.
4. **Transcription**: Chunks sent to Groq (`whisper-large-v3-turbo`) in parallel via `ThreadPoolExecutor` for rapid transcription.
5. **Embedding**: Text chunked and vectorized using OpenAI API (`text-embedding-3-small`); appended to `embeddings.joblib`.
6. **PDF Generation**: Final comprehensive notes generated and stored contextually in Cloudinary.
7. **Semantic Querying**: User queries trigger semantic similarity matching over the specific video's embedded chunks to generate accurate AI answers.

## Local Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- System Dependencies: `ffmpeg` and `ffprobe` accessible on your PATH

### 1. Environment Variables
Create a file at `Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-/.env`:

```env
# AI Models
GROQ_API_KEY=your_groq_api_key
OPENAI_API_KEY=your_openai_api_key
OPENAI_PDF_MODEL=gpt-4o-mini

# Google Auth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Cloudinary Storage
USE_CLOUD_STORAGE=True
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Optional DB
DATABASE_URL=sqlite:///db.sqlite3
```

### 2. Backend Initialization
```bash
cd backend
python -m venv .venv
# On Windows: .\.venv\Scripts\Activate.ps1
# On MacOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### 3. Frontend Initialization
Open a new terminal session:
```bash
cd frontend
npm install
npm run dev
```

The frontend application will be available at `http://localhost:5173`.

## Typical Developer Workflows

- **Retry a failed video**: `POST /api/videos/{id}/retry/`
- **Regenerate PDF manually**: `GET /api/videos/{id}/pdf/?refresh=true`
- **Backfill YouTube URLs**: `python manage.py backfill_youtube_urls`

## API Overview

The majority of routes use `Authorization: Token <token>`.

- **Auth**: `/api/auth/register`, `/api/auth/login`, `/api/auth/google_login/`
- **Videos**: `/api/videos/`, `/api/videos/{id}/status/`, `/api/videos/upload_youtube/`
- **Chat**: `/api/videos/{id}/query/`, `/api/videos/{id}/ai_chat/`
- **Analytics**: `/api/profile/stats/`

## Deployment & Production
Use the `DEPLOYMENT_GUIDE.md` for the primary deployment walkthrough.
High-level deployment involves routing the backend through Gunicorn, migrating to PostgreSQL, and fully enabling Cloudinary for production media storage.

## Known Limitations

- Uses `joblib` for vector storage; suitable for local and small-to-medium deployments (easily refactorable to Pinecone/PgVector).
- Processing uses in-memory background threads. For horizontal scaling and distributed deployment, Celery + Redis migration is recommended.