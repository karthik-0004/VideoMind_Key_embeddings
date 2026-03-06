# Video RAG Application
## AI-Powered Video Knowledge Extraction & Semantic Search

A professional full-stack application for transforming videos into searchable knowledge using RAG (Retrieval Augmented Generation).

---

## 🚀 Features

- **Video Upload**: Intuitive drag-and-drop interface
- **AI Processing**: Automatic speech-to-text conversion and embedding generation
- **Semantic Search**: Natural Q&A chat interface with timestamped responses
- **PDF Generation**: AI-enhanced study notes in PDF format
- **User Dashboard**: Activity tracking and statistics
- **Modern UI**: Professional SaaS-style interface

---

## 🛠️ Tech Stack

### Backend
- **Django 5.0** - REST API framework
- **Django REST Framework** - API endpoints
- **Groq API** - Whisper transcription & LLM enhancement
- **Ollama** - Local embeddings (bge-m3 model)
- **SQLite** - Database

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool 
- **React Router** - Navigation
- **Axios** - API communication
- **Lucide React** - Icons

---

## ⚙️ Prerequisites

1. **Python 3.10+**
2. **Node.js 18+**
3. **FFmpeg** - For video processing
4. **Ollama** - For embeddings ([install from ollama.com](https://ollama.com))
5. **Groq API Key** - Get from [console.groq.com](https://console.groq.com)

---

## 📦 Installation

### 1. Clone the Repository

```bash
cd "c:\Users\3541\Desktop\RAG Based by Karthik - Copy"
```

### 2. Set Up Backend

```bash
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Create superuser (optional, for admin access)
python manage.py createsuperuser

# Start backend server
python manage.py runserver
```

Backend will run on: `http://localhost:8000`

### 3. Set Up Frontend

```bash
cd frontend

# Install dependencies (already done)
npm install

# Start dev server
npm run dev
```

Frontend will run on: `http://localhost:5173`

### 4. Start Ollama

```bash
# Pull the embedding model
ollama pull bge-m3

# Ollama should be running (starts automatically on install)
```

---

## 🔑 Environment Variables

The `.env` file should already exist in the parent directory:

```
GROQ_API_KEY=your_groq_api_key_here
```

---

## 🎯 Usage

### 1. Access the Application

Open your browser to: `http://localhost:5173`

### 2. Navigate the Interface

- **Landing Page**: Click "Dashboard" to enter (Google Auth placeholder)
- **Dashboard**: View statistics and recent videos
- **Upload**: Drag & drop videos to upload
- **Processing**: Videos are automatically processed (may take several minutes)
- **Chat**: Click "Chat" on a completed video to ask questions
- **PDF**: Click "PDF" to view/download generated study notes
- **Profile**: View your activity statistics

### 3. Upload a Video

1. Go to "**Upload**" page
2. Drag & drop a video file (or click to browse)
3. Wait for processing stages:
   - Uploading (progress bar)
   - Converting to Audio
   - Transcribing
   - Generating Embeddings
   - Creating PDF
4. Video appears in Dashboard when complete

### 4. Ask Questions

1. Go to **Dashboard**
2. Click **Chat** on a completed video
3. Type questions like:
   - "What are the main topics covered?"
   - "At what timestamp is X explained?"
4. Get timestamped answers

### 5. View PDF

1. Click **PDF** on any completed video
2. View embedded PDF in browser
3. Download using **Download PDF** button

---

## 🏗️ Project Structure

```
RAG Based by Karthik/
├── backend/                    # Django backend
│   ├── api/                    # REST API app
│   │   ├── models.py          # Video, Query, PDF models
│   │   ├── views.py           # API endpoints
│   │   ├── serializers.py     # DRF serializers
│   │   └── admin.py           # Admin config
│   ├── config/                 # Django settings
│   ├── video_processor/        # Processing integration
│   │   ├── pipeline.py        # Video processing
│   │   ├── query.py           # RAG queries
│   │   └── pdf_gen.py         # PDF generation
│   ├── media/                  # Uploads & generated files
│   └── manage.py
│
├── frontend/                   # React frontend
│   ├── src/
│   │   ├── components/        # Reusable components
│   │   │   ├── Button.jsx
│   │   │   ├── Card.jsx
│   │   │   ├── Badge.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   └── AppLayout.jsx
│   │   ├── pages/             # Page components
│   │   │   ├── Landing.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Upload.jsx
│   │   │   ├── Chat.jsx
│   │   │   ├── Profile.jsx
│   │   │   └── PDFViewer.jsx
│   │   ├── services/          # API client
│   │   │   └── api.js
│   │   ├── context/           # React context
│   │   │   └── AuthContext.jsx
│   │   ├── styles/            # Design system
│   │   │   ├── variables.css
│   │   │   └── index.css
│   │   └── App.jsx
│   └── package.json
│
└── Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-/
    ├── pipelIne_api.py        # Original processing script
    ├── rag_query.py           # Original query script
    ├── enhance_and_pdf.py     # Original PDF script
    └── .env                   # Environment variables
```

---

## 🔧 API Endpoints

### Videos
- `GET /api/videos/` - List all videos
- `POST /api/videos/` - Upload new video
- `GET /api/videos/{id}/` - Get video details
- `GET /api/videos/{id}/status/` - Get processing status
- `POST /api/videos/{id}/query/` - Ask question about video
- `GET /api/videos/{id}/pdf/` - Get/generate PDF

### Profile
- `GET /api/profile/stats/` - Get user statistics

### Admin
- `http://localhost:8000/admin/` - Django admin panel

---

## 🎨 Design System

The application uses a professional design system with:
- **Primary Color**: `#3B82F6` (Blue)
- **Font**: Inter (system fallback)
- **Components**: Button, Card, Badge, Sidebar
- **Layouts**: AppLayout with sidebar navigation
- **Animations**: Smooth transitions and hover effects

See `frontend/src/styles/variables.css` for complete design tokens.

---

## 🚧 Future Enhancements

- [ ] **Google Authentication** - OAuth integration
- [ ] **Real-time Updates** - WebSockets for processing status
- [ ] **Video Player** - Embedded player with timestamp jumping
- [ ] **Cloud Storage** - S3/GCS integration
- [ ] **Async Processing** - Celery task queue
- [ ] **Advanced Search** - Filter and sort videos
- [ ] **Multi-language Support** - i18n

---

## 🐛 Troubleshooting

### Backend Issues

**Port 8000 already in use:**
```bash
python manage.py runserver 8080
# Update API_BASE_URL in frontend/src/services/api.js
```

**Database errors:**
```bash
python manage.py migrate --run-syncdb
```

### Frontend Issues

** Module not found:**
```bash
cd frontend
npm install
```

**CORS errors:**
- Ensure backend is running on `http://localhost:8000`
- Check `CORS_ALLOWED_ORIGINS` in `backend/config/settings.py`

### Processing Issues

**Ollama not found:**
```bash
# Check if Ollama is running
curl http://localhost:11434

# Pull the model
ollama pull bge-m3
```

**Groq API errors:**
- Verify `GROQ_API_KEY` in `.env`
- Check API rate limits

---

## 📝 Notes

- **Authentication**: Currently uses placeholder user (`demo_user`). Google Auth will be added in future phase.
- **File Paths**: Backend integrates with existing Python scripts in parent directory
- **Processing Time**: Varies by video length (10-30 minutes typical)
- **Browser Support**: Chrome, Firefox, Edge (latest versions)

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
