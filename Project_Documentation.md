# Video Knowledge Extraction & Semantic Search System (RAG-based) - Project Documentation

## 1. Abstract
This project implements an end-to-end "Video RAG" (Retrieval-Augmented Generation) system designed to transform long-form video content into searchable, structured knowledge. By leveraging modern AI technologies—specifically Large Language Models (LLMs), Speech-to-Text (Whisper), and Vector Embeddings (Ollama/BGE-M3)—the system allows users to upload videos, automatically extract transcripts, receive timestamped answers to natural language queries, and generate summarized study notes in PDF format. The solution addresses the challenge of information retrieval from unstructured video data, making it highly applicable for educational and corporate training environments.

## 2. Introduction
### 2.1 Project Objective
The primary objective is to develop a full-stack web application that simplifies the consumption of video content. The system aims to:
-   Automate the transcription of video and audio files from YouTube or local uploads.
-   Enable semantic search within video content (finding *meanings*, not just keywords).
-   Provide precise timestamp-linked answers to user questions (RAG).
-   Generate downloadable, structured study materials (PDFs) from video content.
-   Offer an interactive "AI Chat" experience for deeper engagement with the material using Groq.

### 2.2 Problem Statement
Video is a dominant medium for information sharing, but it is inherently linear and difficult to search. Finding specific information within a 1-hour lecture or meeting recording requires tedious manual scrubbing. Existing tools often lack context-aware search capabilities or fail to provide structured summaries, leading to significant time loss for students and professionals.

## 3. System Analysis
### 3.1 Existing Systems
Traditional video players offer only basic playback controls. Some platforms provide auto-generated captions, but they typically lack:
 -   **Semantic Search**: Ability to answer "Why" or "How" questions.
 -   **Context Retention**: Understanding the full scope of the video for complex queries.
 -   **Document Generation**: Automatically creating study guides.

### 3.2 Proposed System
The proposed "Video RAG System" integrates:
-   **Django Backend**: Robust API to manage uploads, processing pipelines, and user data.
-   **React Frontend**: A modern, responsive UI for seamless user interaction.
-   **Hybrid AI Pipeline**: Combines local embedding models (Ollama) for privacy/speed with powerful cloud LLMs (Groq) for high-quality generation.

## 4. System Architecture
### 4.1 High-Level Architecture
The system follows a typical Client-Server architecture with a specialized "AI Processing Pipeline" layer.

1.  **Client (Frontend)**: React.js application processing user inputs and displaying results.
2.  **Server (Backend)**: Django REST Framework API handling requests and database operations.
3.  **Processing Pipeline**: Asynchronous workers processing video files (FFmpeg -> Whisper -> Embeddings).
4.  **Database**: SQLite/PostgreSQL for relational data (Users, Videos, Queries) and FAISS/Joblib for vector data.

### 4.2 Module Description
#### A. User Interface Module (Frontend)
-   **Dashboard**: Displays user statistics (Total Videos, processing hours) and recent uploads.
-   **Upload Interface**: standardized file upload with progress tracking.
-   **Video Chat Interface**:
    -   *Standard Chat*: Q&A with timestamp jumping.
    -   *AI Help*: Split-screen view with a conversational AI assistant (Groq Llama-3) that knows the video context.
-   **PDF Viewer**: Integrated view for generated study notes.

#### B. API Module (Backend)
-   **VideoViewSet**: Manages CRUD operations for video files. Handles `upload_youtube` requests.
-   **QueryViewSet**: Logs and retrieves user interaction history.
-   **Stats API**: Aggregates usage data for the dashboard.

#### C. AI Processing Pipeline (Backend)
1.  **Audio Extraction**: Uses `ffmpeg-python` to strip audio from video files.
2.  **Transcription**: Uses `Groq Whisper` (via API) to convert audio to text with high accuracy.
3.  **Chunking & Embedding**: text is split into chunks; `Ollama (bge-m3)` generates vector embeddings for each chunk.
4.  **Vector Store**: Embeddings are saved to a local `embeddings.joblib` file for fast retrieval.
5.  **PDF Generation**: `reportlab` generates a structured PDF summary based on the transcript.

### 4.3 Database Schema (Key Models)
-   **Video**: `title`, `file`, `youtube_url`, `status` (uploading/processing/completed), `processing_stage`.
-   **Query**: `question`, `answer`, `timestamp_start`, `timestamp_end`.
-   **PDF**: Link to generated PDF file.
-   **UserProfile**: Aggregated stats (`total_videos`, `total_queries`, etc.).

## 5. Implementation Details
### 5.1 Technology Stack
-   **Frontend**: React 18, Vite, React Router, Axios, Lucide-React (Icons), CSS Variables for theming.
-   **Backend**: Python, Django 5.0, Django REST Framework.
-   **AI/ML**:
    -   **LLM**: Llama-3.3-70b-versatile (via Groq API) for chat and reasoning.
    -   **Transcription**: Whisper-large-v3-turbo (via Groq API).
    -   **Embeddings**: BGE-M3 (via local Ollama instance).
-   **Tools**: FFmpeg (media processing), yt-dlp (YouTube downloading).

### 5.2 Key Algorithms
#### RAG (Retrieval Augmented Generation) Workflow
1.  **Ingest**: User uploads video.
2.  **Process**: Video -> Audio -> Text -> Vectors.
3.  **Query**: User asks "What is X?".
4.  **Retrieve**: System compares user query vector with stored chunk vectors (Cosine Similarity).
5.  **Augment**: Top-k relevant chunks (text + timestamps) are retrieved.
6.  **Generate**: LLM constructs a natural language answer using the retrieved chunks as context.

#### Semantic Search
Instead of matching exact keywords, the system uses high-dimensional vector space to find conceptually similar segments. For example, a search for "money" might retrieve segments discussing "currency", "economics", or "finance".

## 6. Features & Functionality
1.  **YouTube Integration**: Users can paste a YouTube URL to automatically download and process content.
2.  **Interactive Timestamps**: Chat answers include "Clickable Timestamps" (e.g., [02:45]) that instantly seek the video to the relevant moment.
3.  **Dual-Mode Chat**:
    -   **Q&A**: Strict fact-based answers from the video.
    -   **AI Help**: Conversational mode for brainstorming or broader questions based on the video topic.
4.  **Smart PDF Generation**: Automatically creates a "Study Guide" with key points, summaries, and important timestamps.
5.  **User Dashboard**: Visual analytics of learning progress.

## 7. Results and Performance
-   **Accuracy**: The Whisper model provides near-human level transcription accuracy.
-   **Speed**: Groq API enables extremely fast inference, making the chat experience feel real-time.
-   **Scalability**: The modular design allows the background processing (heavy lifting) to be offloaded to separate worker nodes (e.g., Celery) in a future production environment.

## 8. Conclusion
The "Video Knowledge Extraction & Semantic Search System" successfully demonstrates the power of RAG in educational contexts. By automating the extraction of unstructured data and making it semantically searchable, the tool significantly reduces the time required to digest long-form video content. Future enhancements could include multi-language support, real-time collaboration, and cloud-native deployment.

## 9. References
1.  Lewis, P. et al. (2020). *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks*.
2.  OpenAI Whisper Documentation.
3.  Groq API Documentation.
4.  Django REST Framework Documentation.
5.  React.js Official Documentation.
