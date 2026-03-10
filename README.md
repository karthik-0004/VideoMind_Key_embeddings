# VideoMind

## AI-Powered Video Knowledge Extraction & Semantic Search

A full-stack SaaS application that transforms video content into searchable knowledge using RAG (Retrieval Augmented Generation). Upload any video or paste a YouTube link — VideoMind transcribes, embeds, and indexes the content so you can ask natural-language questions and receive timestamped answers, or download AI-generated study PDFs.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 19 + Vite)                  │
│  Landing ─ Login ─ Dashboard ─ Upload ─ Chat ─ StudyRoom ─ PDF     │
│  Google OAuth / Email Auth  │  Axios ─► Token Auth                 │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ REST API (Token Auth)
┌──────────────────────────────────▼──────────────────────────────────┐
│                     BACKEND (Django 5.2 + DRF)                     │
│                                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  Auth    │  │  Video CRUD  │  │  RAG Query   │  │  AI Chat   │  │
│  │  Views   │  │  + Upload    │  │  Engine      │  │  (Groq)    │  │
│  └──────────┘  └──────┬───────┘  └──────┬───────┘  └────────────┘  │
│                        │                 │                           │
│            ┌───────────▼─────────────────▼───────────────┐          │
│            │         VIDEO PROCESSOR (Pipeline)          │          │
│            │                                             │          │
│            │  1. FFmpeg Compress (if >50 MB)              │          │
│            │  2. FFmpeg Extract Audio → MP3               │          │
│            │  3. Groq Whisper Transcribe (10-min chunks)  │          │
│            │  4. OpenAI Embed (text-embedding-3-small)    │          │
│            │  5. PDF Generate (GPT-4o-mini / Groq LLaMA) │          │
│            └─────────────────────────────────────────────┘          │
│                                                                     │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────────────┐  │
│  │  SQLite DB │  │ embeddings   │  │  media/videos  media/pdfs  │  │
│  │  (models)  │  │  .joblib     │  │  audios/  jsons/           │  │
│  └────────────┘  └──────────────┘  └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                    │
   ┌─────▼─────┐     ┌───────▼───────┐    ┌──────▼──────┐
   │  Groq API │     │  OpenAI API   │    │   yt-dlp    │
   │  Whisper  │     │  Embeddings   │    │  (YouTube)  │
   │  LLaMA 3  │     │  GPT-4o-mini  │    │             │
   └───────────┘     └───────────────┘    └─────────────┘
```

---

## End-to-End Workflow

### 1. Authentication

Users sign in via **Google OAuth** or **email/password** registration (Gmail only).

- Frontend receives a JWT credential from Google Sign-In → sends to `POST /api/auth/google_login/`.
- Backend decodes the JWT, creates or retrieves the user, generates a DRF Token, and returns it.
- All subsequent API calls include `Authorization: Token <token>` via an Axios interceptor.
- Sessions are persisted in `localStorage` (`authToken`, `user`).

### 2. Video Upload (Local File)

```
User drops video file on Upload page
  → POST /api/videos/ (multipart/form-data, max 500 MB)
  → Backend validates extension (.mp4, .mov, .avi, .mkv, .webm) + size
  → Creates Video record (status='uploading')
  → Spawns daemon thread: process_video_async(video_id)
  → Returns video ID immediately
  → Frontend polls GET /api/videos/{id}/status/ every 3 seconds
```

### 3. Video Upload (YouTube Link)

```
User pastes YouTube URL on Upload page
  → POST /api/videos/upload_youtube/  {youtube_url, title?}
  → Backend creates in-memory task (UUID), returns task_id
  → Spawns daemon thread running yt-dlp to download the video
  → Frontend polls GET /api/videos/youtube_status/?task_id=... every 1.5 seconds
  → On download complete → creates Video record → triggers processing pipeline
  → Task state transitions: queued → downloading → downloaded → processing → completed
```

### 4. Processing Pipeline (Background Thread)

Each video goes through these stages in a single daemon thread:

| Stage | Processing Stage | What Happens |
|-------|-----------------|--------------|
| 0 | `compressing` | **FFmpeg** compresses videos > 50 MB (libx264, CRF 23, fast preset) |
| 1 | `audio_converted` | **FFmpeg** extracts audio to MP3 |
| 2 | `transcribing` → `transcribed` | Audio split into **10-minute chunks**; each transcribed via **Groq Whisper** (`whisper-large-v3-turbo`) using 3 parallel workers; timestamps are offset-merged |
| 3 | `embedding` → `embedded` | Transcript chunks embedded via **OpenAI** (`text-embedding-3-small`, 1536-dim); delta-only — skips already-embedded chunks; saved to `embeddings.joblib` |
| 4 | `generating_pdf` → `pdf_generated` | Full transcript sent to **OpenAI GPT-4o-mini** (128k context) to produce structured study notes; falls back to **Groq LLaMA 3.3-70b** chunk-by-chunk if OpenAI fails; rendered to PDF via **ReportLab** |
| 5 | `completed` | Video marked complete; appears in Dashboard |

On failure at any stage, the video is marked `status='failed'` with an error message. Users can retry via `POST /api/videos/{id}/retry/`.

### Processing Time Estimates

Approximate end-to-end time from upload to PDF generation (on a modern machine with stable internet):

| | 10-min Video | 20-min Video | 30-min Video |
|---|---|---|---|
| **Upload** (localhost) | ~2–5 s | ~5–10 s | ~8–15 s |
| **Compression** (FFmpeg, if >50 MB) | ~10–20 s | ~20–40 s | ~30–60 s |
| **Audio Extraction** (FFmpeg → MP3) | ~5–10 s | ~8–15 s | ~10–20 s |
| **Transcription** (Groq Whisper, parallel) | ~15–25 s (1 chunk) | ~20–30 s (2 chunks) | ~25–35 s (3 chunks) |
| **Embeddings** (OpenAI, single batch) | ~5–10 s | ~8–15 s | ~10–20 s |
| **PDF Generation** (GPT-4o-mini) | ~15–30 s | ~25–45 s | ~30–60 s |
| **Total** | **~1–2 min** | **~2–3 min** | **~3–5 min** |

**Why it's fast:**

- **Parallel transcription** — Audio is split into 10-minute chunks and transcribed across 3 concurrent workers. A 30-min video produces 3 chunks that are all transcribed simultaneously, so transcription time stays roughly constant regardless of video length.
- **Batch embeddings** — All transcript chunks are embedded in a single OpenAI API call (up to 2048 texts per request), so embedding time barely increases with longer videos.
- **Delta processing** — Only new, un-embedded chunks are sent to the embedding API. Re-processing a video skips already-embedded content.
- **Compression** — Videos over 50 MB are compressed 50–90% smaller before audio extraction, which speeds up every downstream step.

> **Note:** Times depend on network speed (API calls to Groq/OpenAI), video file size, and machine CPU (FFmpeg). Very long videos (1 hour+) take ~12–18 minutes. The Groq API has rate limits that may add delays for back-to-back uploads.

### 5. RAG Query (Semantic Search)

```
User asks: "What is dependency injection?"
  → POST /api/videos/{id}/query/  {question: "..."}
```

**Two-stage ranking:**

1. **Coarse search** — Query embedded via OpenAI `text-embedding-3-small`, then cosine similarity against all chunk embeddings in `embeddings.joblib` (filtered to the current video). Top 3 chunks selected.

2. **Timestamp refinement** — Each top chunk is split into sentences; all sentences batch-embedded in a single API call; the sentence with highest cosine similarity to the query determines the refined timestamp within the chunk.

**Response:** Natural-language answer with `timestamp_start`, `timestamp_end`, and `youtube_url` (if applicable). Timestamps are clickable in the Chat UI — they link to the exact position in the YouTube video.

Total API cost per query: **2 OpenAI calls** (1 query embedding + 1 batch sentence embedding).

### 6. AI Chat (Groq LLaMA)

Separate from RAG queries — the AI Chat panel provides a conversational assistant that has the video's transcript as context.

```
POST /api/videos/{id}/ai_chat/  {message, history}
  → Loads transcript JSON, clips to 12k chars
  → Sends to Groq LLaMA 3.3-70b-versatile with conversation history
  → Returns markdown-formatted reply
```

### 7. PDF Generation

```
GET /api/videos/{id}/pdf/
  → If PDF exists (and no ?refresh=true), return it
  → Otherwise: load transcript → send to OpenAI GPT-4o-mini (full 128k context)
  → Fallback: Groq LLaMA chunk-by-chunk (2400 tokens/chunk, 240 overlap)
  → Fallback: plain beautified text
  → Render via ReportLab with blue theme, code highlighting, callout labels
  → Save to media/pdfs/ and create PDF model record
```

PDFs include: Sections, Topics, Subtopics, Code blocks (auto-detected), Key Takeaways, and semantic callout labels (Concept, Context, Example, Important, etc.).

---

## Tech Stack

### Backend
| Component | Technology |
|-----------|-----------|
| Framework | Django 5.2 + Django REST Framework |
| Auth | Token Auth + Google OAuth (django-allauth) |
| Transcription | Groq Whisper (`whisper-large-v3-turbo`) |
| Embeddings | OpenAI `text-embedding-3-small` (1536-dim) |
| RAG Search | Cosine similarity (scikit-learn) with two-stage ranking |
| AI Chat | Groq LLaMA 3.3-70b-versatile |
| PDF Content | OpenAI GPT-4o-mini (primary) / Groq LLaMA (fallback) |
| PDF Render | ReportLab |
| YouTube Download | yt-dlp |
| Audio/Video | FFmpeg + ffprobe |
| Embedding Store | joblib (pandas DataFrame) |
| Database | SQLite |
| Token Counting | tiktoken |

### Frontend
| Component | Technology |
|-----------|-----------|
| Framework | React 19 |
| Build Tool | Vite |
| Routing | React Router 7 |
| HTTP Client | Axios |
| Google Auth | @react-oauth/google |
| File Upload | react-dropzone |
| Icons | Lucide React |
| JWT Parsing | jwt-decode |

---

## Prerequisites

1. **Python 3.10+**
2. **Node.js 18+**
3. **FFmpeg** and **ffprobe** — must be in PATH
4. **API Keys** (see Environment Variables below)

---

## Installation

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Runs on `http://localhost:8000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`.

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Required — Transcription (Whisper) + AI Chat + PDF fallback
GROQ_API_KEY=your_groq_api_key

# Required — Embeddings (text-embedding-3-small) + PDF content (GPT-4o-mini)
OPENAI_API_KEY=your_openai_api_key

# Required — Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Optional
PDF_ENHANCE_WORKERS=5
```

---

## Project Structure

```
VideoMind/
├── backend/
│   ├── api/
│   │   ├── models.py              # Video, Query, PDF, UserProfile models
│   │   ├── views.py               # VideoViewSet, AuthViewSet, QueryViewSet, UserProfileViewSet
│   │   ├── serializers.py         # DRF serializers (Video, Query, PDF, Auth, DailyVideos)
│   │   ├── urls.py                # Router registration
│   │   └── management/commands/
│   │       └── backfill_youtube_urls.py  # Extract YouTube IDs from filenames
│   ├── config/
│   │   ├── settings.py            # Django config, CORS, allauth, DRF, logging
│   │   ├── urls.py                # Root URL routing + video streaming
│   │   ├── stream.py              # HTTP Range request handler for video/audio seeking
│   │   └── oauth_settings.py      # Google OAuth provider config
│   ├── video_processor/
│   │   ├── pipeline.py            # 5-stage processing pipeline (compress → audio → transcribe → embed → PDF)
│   │   ├── query.py               # RAG query bridge (loads embeddings, calls rag_query, saves results)
│   │   └── pdf_gen.py             # PDF generation with OpenAI/Groq fallback chain
│   ├── media/
│   │   ├── videos/                # Uploaded video files
│   │   └── pdfs/                  # Generated PDF study guides
│   ├── audios/chunks/             # 10-minute audio chunks (temporary)
│   ├── jsons/                     # Transcript JSON files
│   ├── templates/intro.html       # Backend landing page
│   ├── requirements.txt
│   └── manage.py
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                # Routes + context providers
│   │   ├── context/
│   │   │   ├── AuthContext.jsx    # Auth state, token management, Google login
│   │   │   └── ThemeContext.jsx   # Light/dark theme toggle (persisted)
│   │   ├── services/
│   │   │   └── api.js             # Axios client — all API methods with token interceptor
│   │   ├── pages/
│   │   │   ├── Landing.jsx        # Marketing page (particles, animations, pipeline demo)
│   │   │   ├── Login.jsx          # Email/password + Google OAuth login
│   │   │   ├── Dashboard.jsx      # Kanban board (Processing | Ready | Archived) + detail panel
│   │   │   ├── Upload.jsx         # Drag-drop upload + YouTube URL input + progress tracking
│   │   │   ├── Chat.jsx           # RAG Q&A (timestamped answers) + AI assistant side panel
│   │   │   ├── StudyRoom.jsx      # Video player + AI chat + timestamp navigation
│   │   │   ├── History.jsx        # Date-grouped video history with filters
│   │   │   ├── Profile.jsx        # User stats (videos, queries, PDFs, hours)
│   │   │   └── PDFViewer.jsx      # View / download generated PDFs
│   │   ├── components/
│   │   │   ├── TopNav.jsx         # Navigation bar (Overview, Upload Video, Analytics, History)
│   │   │   ├── AppLayout.jsx      # Page wrapper with TopNav
│   │   │   ├── ProcessingScreen.jsx # Full-screen overlay during video processing
│   │   │   ├── AIChatPanel.jsx    # Groq-powered chat panel with markdown rendering
│   │   │   ├── AudioWaveformPlayer.jsx # Audio player with Web Audio API visualization
│   │   │   ├── DailyBucket.jsx    # Date-grouped video list for History page
│   │   │   ├── DateNavigator.jsx  # Quick date filters (Today, Week, Month, Custom)
│   │   │   ├── ProtectedRoute.jsx # Auth guard — redirects to /login if unauthenticated
│   │   │   ├── UploadOnboarding.jsx # First-visit tutorial overlay
│   │   │   ├── Button.jsx / Card.jsx / Badge.jsx  # Reusable UI primitives
│   │   │   └── *.css              # Component styles
│   │   └── styles/
│   │       ├── variables.css      # Design tokens (colors, spacing, typography)
│   │       └── index.css          # Global styles
│   ├── package.json
│   └── vite.config.js
│
└── Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-/
    ├── rag_query.py               # Core semantic search (OpenAI embeddings + cosine similarity)
    ├── pipelIne_api.py            # Standalone pipeline script (original)
    ├── enhance_and_pdf.py         # PDF beautification + ReportLab rendering
    └── embeddings.joblib          # Shared embedding store (pandas DataFrame)
```

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register/` | Register with email + password (Gmail only) |
| POST | `/api/auth/login/` | Email/password login |
| POST | `/api/auth/google_login/` | Google OAuth (accepts JWT credential) |
| POST | `/api/auth/logout/` | Invalidate token |
| GET | `/api/auth/me/` | Current user profile |

### Videos
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/videos/` | List user's videos (paginated) |
| POST | `/api/videos/` | Upload video file (multipart, max 500 MB) |
| GET | `/api/videos/{id}/` | Video details |
| DELETE | `/api/videos/{id}/` | Delete video + files |
| GET | `/api/videos/{id}/status/` | Processing status + stage |
| POST | `/api/videos/{id}/retry/` | Retry failed processing |
| POST | `/api/videos/{id}/query/` | RAG query → timestamped answer |
| POST | `/api/videos/{id}/ai_chat/` | Groq LLaMA chat with transcript context |
| GET | `/api/videos/{id}/pdf/` | Get or generate PDF (`?refresh=true` to regenerate) |
| GET | `/api/videos/{id}/audio/` | Stream audio (supports HTTP Range for seeking) |
| POST | `/api/videos/upload_youtube/` | Start YouTube download task |
| GET | `/api/videos/youtube_status/` | Poll YouTube download progress (`?task_id=...`) |
| GET | `/api/videos/by_date/` | Videos grouped by date (`?filter=today\|week\|month\|all`) |
| GET | `/api/videos/daily_stats/` | Daily video counts (`?days=30`) |
| GET | `/api/videos/date_range/` | Filter by date or date range |

### Queries & Profile
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/queries/` | Query history (`?video_id=...` to filter) |
| GET | `/api/profile/stats/` | User statistics (videos, queries, PDFs, hours) |

### Admin
| URL | Description |
|-----|-------------|
| `http://localhost:8000/admin/` | Django admin panel |

---

## Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Marketing page with particle background, pipeline demo, feature cards, animated terminal |
| `/login` | Login | Email/password + Google OAuth sign-in |
| `/dashboard` | Dashboard | Split-pane Kanban board (Processing / Ready / Archived) with video detail panel |
| `/upload` | Upload | Drag-and-drop file upload or YouTube URL with real-time progress polling |
| `/chat/:id` | Chat | RAG Q&A with timestamped answers + optional AI assistant side panel |
| `/study-room/:id` | Study Room | Video player with custom controls + AI chat + timestamp navigation |
| `/history` | History | Date-grouped video history with quick date filters |
| `/profile` | Profile | User info, statistics, account management |
| `/pdf/:id` | PDF Viewer | View or download generated study PDF |

---

## Data Models

### Video
Core entity tracking video lifecycle from upload through processing to completion.

- `user` — Owner (ForeignKey to Django User)
- `title`, `file` — Metadata and stored file
- `status` — `uploading` → `processing` → `completed` | `failed`
- `processing_stage` — Granular stage tracking (9 stages from `uploaded` to `pdf_generated`)
- `duration_seconds` — Video length
- `audio_path`, `json_path` — Paths to extracted audio and transcript JSON
- `youtube_url` — Source URL if downloaded from YouTube
- `error_message` — Failure details

### Query
User questions about video content, stored with AI answers and timestamp references.

### PDF
One-to-one with Video. Stores generated study guide file and metadata.

### UserProfile
Extended user data: Google ID, avatar, aggregate statistics (videos, queries, PDFs, processing hours).

---

## Troubleshooting

### FFmpeg not found
Ensure `ffmpeg` and `ffprobe` are installed and in your system PATH:
```bash
ffmpeg -version
ffprobe -version
```

### CORS errors
Backend allows origins on ports 5173–5175. If using a different port, add it to `CORS_ALLOWED_ORIGINS` in `backend/config/settings.py`.

### Processing fails at transcription
- Check that `GROQ_API_KEY` is set correctly in `.env`
- Groq has rate limits — very long videos may hit them. The pipeline retries once per chunk.

### Processing fails at embeddings
- Check that `OPENAI_API_KEY` is set correctly in `.env`
- Ensure the key has access to `text-embedding-3-small`

### Database errors
```bash
cd backend
python manage.py migrate --run-syncdb
```

### Port already in use
```bash
python manage.py runserver 8080
# Then update API_BASE_URL in frontend/src/services/api.js
```

---

## Management Commands

```bash
# Backfill YouTube URLs for videos downloaded via yt-dlp
python manage.py backfill_youtube_urls          # Only missing URLs
python manage.py backfill_youtube_urls --all    # Reprocess all
python manage.py backfill_youtube_urls --dry-run # Preview only
```

---

## Notes

- **Processing** runs in daemon threads — no task queue (Celery) required for development.
- **Embeddings** are stored in a shared `embeddings.joblib` file (pandas DataFrame). The pipeline only embeds new chunks (delta updates).
- **YouTube downloads** use in-memory task state — task progress is lost on server restart.
- **File size limits**: 500 MB per video upload, 100 MB in-memory upload buffer.
- **Browser support**: Chrome, Firefox, Edge (latest versions).

---

## 👨‍💻 Development

### Adding New Features

1. Backend: Add endpoints in `backend/api/views.py`
2. Frontend: Create components in `frontend/src/components/`
3. Update API client in `frontend/src/services/api.js`

### Styling

- Global styles: `frontend/src/index.css`
- Design variables: `frontend/src/styles/variables.css`
- Component styles: Co-located`.css` files

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🙏 Acknowledgments

- Original Python scripts by Karthik
- UI design inspired by Linear, Notion, Vercel
- Built with React, Django, and modern web technologies

---

**Happy Learning! 🎓✨**
