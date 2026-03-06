"""
API Views for Video RAG Application
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.authtoken.models import Token
from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.utils import timezone
from django.core.files import File
from pathlib import Path
from .models import Video, Query, PDF, UserProfile
from .serializers import (
    VideoSerializer, VideoListSerializer, QuerySerializer,
    PDFSerializer, UserProfileSerializer, DailyVideosSerializer,
    RegisterSerializer, LoginSerializer, GoogleLoginSerializer
)
import os
import logging
import shutil
import tempfile
import threading
import uuid
import re
from datetime import datetime, timedelta
from django.db.models import Count
from django.db.models.functions import TruncDate
from collections import OrderedDict
from urllib.parse import urlparse

logger = logging.getLogger(__name__)
YOUTUBE_DOWNLOAD_TASKS = {}
YOUTUBE_DOWNLOAD_LOCK = threading.Lock()


@method_decorator(csrf_exempt, name='dispatch')
class VideoViewSet(viewsets.ModelViewSet):
    """ViewSet for Video operations"""
    
    queryset = Video.objects.all()
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    authentication_classes = [TokenAuthentication, SessionAuthentication]
    
    def get_authenticators(self):
        # Skip auth for audio endpoint (HTML audio elements can't send headers)
        # Check request path because self.action isn't set during initialize_request()
        if hasattr(self, 'request') and self.request and '/audio/' in self.request.path:
            return []
        return super().get_authenticators()
    
    def get_permissions(self):
        if getattr(self, 'action', None) == 'audio' or (
            hasattr(self, 'request') and self.request and '/audio/' in self.request.path
        ):
            return [AllowAny()]
        return super().get_permissions()
    
    def get_serializer_class(self):
        if self.action == 'list':
            return VideoListSerializer
        return VideoSerializer
    
    def get_queryset(self):
        if self.action == 'audio':
            return Video.objects.all()
        return Video.objects.filter(user=self.request.user)

    def _validate_video_file(self, file_name, file_size):
        """Validate uploaded/downloaded video metadata"""
        max_size = 500 * 1024 * 1024  # 500MB
        if file_size > max_size:
            raise ValueError(f"File too large. Max size is {max_size / (1024*1024):.0f}MB")

        allowed_extensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm']
        file_ext = os.path.splitext(file_name)[1].lower()
        if file_ext not in allowed_extensions:
            raise ValueError(f"Invalid file type. Allowed: {', '.join(allowed_extensions)}")

    def _is_youtube_url(self, value):
        """Check if URL is from YouTube"""
        try:
            parsed = urlparse(value)
            host = (parsed.netloc or '').lower()
            return any(domain in host for domain in ['youtube.com', 'youtu.be'])
        except Exception:
            return False

    def _update_youtube_task(self, task_id, **updates):
        """Thread-safe update for YouTube download task state"""
        with YOUTUBE_DOWNLOAD_LOCK:
            if task_id in YOUTUBE_DOWNLOAD_TASKS:
                YOUTUBE_DOWNLOAD_TASKS[task_id].update(updates)

    def _parse_progress_percent(self, value):
        """Convert yt-dlp progress value to integer percent"""
        if value is None:
            return None

        if isinstance(value, (int, float)):
            return max(0, min(100, int(float(value))))

        text = str(value)
        match = re.search(r"(\d+(?:\.\d+)?)%", text)
        if not match:
            return None

        return max(0, min(100, int(float(match.group(1)))))

    def _run_youtube_download_task(self, task_id, youtube_url, custom_title, user_id):
        """Background task that downloads YouTube video and triggers processing"""
        temp_dir = None
        downloaded_path = None

        try:
            import yt_dlp

            temp_dir = tempfile.mkdtemp(prefix='yt_download_')
            info_ref = {}

            def progress_hook(progress_data):
                status_value = progress_data.get('status')

                if status_value == 'downloading':
                    percent_value = self._parse_progress_percent(progress_data.get('_percent_str'))
                    if percent_value is None:
                        total_bytes = progress_data.get('total_bytes') or progress_data.get('total_bytes_estimate')
                        downloaded_bytes = progress_data.get('downloaded_bytes')
                        if total_bytes and downloaded_bytes is not None:
                            percent_value = int((downloaded_bytes / total_bytes) * 100)

                    self._update_youtube_task(
                        task_id,
                        status='downloading',
                        message='Downloading from YouTube...',
                        progress=percent_value if percent_value is not None else 0,
                    )

                if status_value == 'finished':
                    filename = progress_data.get('filename')
                    if filename:
                        info_ref['downloaded_path'] = filename

                    self._update_youtube_task(
                        task_id,
                        status='downloaded',
                        message='Download complete. Uploading to application...',
                        progress=100,
                    )

            ydl_opts = {
                'format': 'best[ext=mp4]/best',
                'outtmpl': os.path.join(temp_dir, '%(title).200B [%(id)s].%(ext)s'),
                'noplaylist': True,
                'quiet': True,
                'no_warnings': True,
                'progress_hooks': [progress_hook],
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(youtube_url, download=True)
                downloaded_path = info_ref.get('downloaded_path') or ydl.prepare_filename(info)

            if not downloaded_path or not os.path.exists(downloaded_path):
                downloaded_files = [
                    os.path.join(temp_dir, name)
                    for name in os.listdir(temp_dir)
                    if os.path.isfile(os.path.join(temp_dir, name))
                ]
                if not downloaded_files:
                    raise ValueError('Failed to download video from YouTube')
                downloaded_path = downloaded_files[0]

            file_name = os.path.basename(downloaded_path)
            file_size = os.path.getsize(downloaded_path)
            self._validate_video_file(file_name, file_size)

            user = User.objects.get(id=user_id)
            final_title = custom_title or info.get('title') or os.path.splitext(file_name)[0]

            video = Video(user=user, title=final_title, status='uploading', youtube_url=youtube_url)
            with open(downloaded_path, 'rb') as downloaded_file:
                video.file.save(file_name, File(downloaded_file), save=False)
            video.save()

            from video_processor.pipeline import process_video_async
            process_video_async(video.id)

            self._update_youtube_task(
                task_id,
                status='processing',
                message='Uploaded. Processing video...',
                progress=100,
                video_id=video.id,
                title=video.title,
                user_id=user.id,
            )

            logger.info(f"YouTube download task {task_id} created video ID: {video.id}")

        except ValueError as e:
            logger.error(f"YouTube upload validation error in task {task_id}: {e}")
            self._update_youtube_task(task_id, status='failed', message=str(e), progress=0, error=str(e))
        except ImportError:
            logger.error("yt-dlp is not installed")
            error_message = 'YouTube downloader dependency is missing on server'
            self._update_youtube_task(task_id, status='failed', message=error_message, progress=0, error=error_message)
        except Exception as e:
            logger.error(f"Error during YouTube upload task {task_id}: {e}", exc_info=True)
            self._update_youtube_task(task_id, status='failed', message=str(e), progress=0, error=str(e))
        finally:
            if temp_dir and os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)
    
    def perform_create(self, serializer):
        """Handle video upload with proper error handling and logging"""
        try:
            # Validate file
            if 'file' not in self.request.data:
                raise ValueError("No file provided")
            
            uploaded_file = self.request.data['file']
            
            self._validate_video_file(uploaded_file.name, uploaded_file.size)
            
            logger.info(f"Uploading video: {uploaded_file.name}, size: {uploaded_file.size} bytes")
            
            video = serializer.save(user=self.request.user, status='uploading')
            logger.info(f"Video created with ID: {video.id}, file path: {video.file.path}")
            
            # Trigger background processing
            # TODO: Move to Celery task for production
            from video_processor.pipeline import process_video_async
            process_video_async(video.id)
            
        except ValueError as e:
            logger.error(f"Validation error during upload: {e}")
            raise
        except Exception as e:
            logger.error(f"Error during video upload: {e}", exc_info=True)
            raise

    @action(detail=False, methods=['post'])
    def upload_youtube(self, request):
        """Start YouTube download and return a task ID for progress polling"""
        youtube_url = (request.data.get('youtube_url') or '').strip()
        custom_title = (request.data.get('title') or '').strip()

        if not youtube_url:
            return Response({'error': 'youtube_url is required'}, status=status.HTTP_400_BAD_REQUEST)

        if not self._is_youtube_url(youtube_url):
            return Response({'error': 'Only YouTube links are supported'}, status=status.HTTP_400_BAD_REQUEST)

        task_id = str(uuid.uuid4())
        with YOUTUBE_DOWNLOAD_LOCK:
            YOUTUBE_DOWNLOAD_TASKS[task_id] = {
                'task_id': task_id,
                'status': 'queued',
                'message': 'Queued for download...',
                'progress': 0,
                'video_id': None,
                'title': custom_title or '',
                'error': None,
                'user_id': request.user.id,
                'created_at': datetime.now().isoformat(),
            }

        thread = threading.Thread(
            target=self._run_youtube_download_task,
            args=(task_id, youtube_url, custom_title, request.user.id),
            daemon=True,
        )
        thread.start()

        return Response(
            {
                'task_id': task_id,
                'status': 'queued',
                'message': 'Queued for download...',
                'progress': 0,
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=False, methods=['get'])
    def youtube_status(self, request):
        """Get YouTube download task progress and resulting video id"""
        task_id = (request.query_params.get('task_id') or '').strip()
        if not task_id:
            return Response({'error': 'task_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        with YOUTUBE_DOWNLOAD_LOCK:
            task = YOUTUBE_DOWNLOAD_TASKS.get(task_id)

        if not task:
            return Response({'error': 'Task not found'}, status=status.HTTP_404_NOT_FOUND)

        if task.get('user_id') != request.user.id:
            return Response({'error': 'Task not found'}, status=status.HTTP_404_NOT_FOUND)

        return Response(task)
    
    @action(detail=False, methods=['get'])
    def by_date(self, request):
        """Get videos grouped by upload date"""
        # Get query parameters
        filter_type = request.query_params.get('filter')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        single_date = request.query_params.get('date')
        days = request.query_params.get('days', 30)  # Default to last 30 days
        today = timezone.localdate()
        yesterday = today - timedelta(days=1)
        
        # Filter videos
        queryset = Video.objects.filter(user=request.user)

        if filter_type == 'today':
            queryset = queryset.filter(upload_date__date=today)
        elif filter_type == 'yesterday':
            queryset = queryset.filter(upload_date__date=yesterday)
        elif single_date:
            queryset = queryset.filter(upload_date__date=single_date)
        elif filter_type == 'all':
            pass
        elif start_date and end_date:
            queryset = queryset.filter(upload_date__date__gte=start_date, upload_date__date__lte=end_date)
        elif start_date:
            queryset = queryset.filter(upload_date__date__gte=start_date)
        elif filter_type == 'week':
            queryset = queryset.filter(upload_date__date__gte=today - timedelta(days=6))
        elif filter_type == 'month':
            queryset = queryset.filter(upload_date__date__gte=today - timedelta(days=29))
        else:
            # Default: last N days
            window_start = today - timedelta(days=max(1, int(days)) - 1)
            queryset = queryset.filter(upload_date__date__gte=window_start)
        
        # Group by date
        videos_by_date = {}
        for video in queryset.order_by('-upload_date'):
            date_key = video.upload_date.date().isoformat()
            if date_key not in videos_by_date:
                videos_by_date[date_key] = []
            videos_by_date[date_key].append(video)
        
        # Format response
        result = []
        
        for date_str, videos in videos_by_date.items():
            date_obj = datetime.fromisoformat(date_str).date()
            
            # Human-readable date
            if date_obj == today:
                display_date = "Today"
            elif date_obj == yesterday:
                display_date = "Yesterday"
            else:
                display_date = date_obj.strftime("%B %d, %Y")
            
            result.append({
                'date': date_str,
                'display_date': display_date,
                'count': len(videos),
                'videos': VideoListSerializer(videos, many=True).data
            })
        
        return Response(result)
    
    @action(detail=False, methods=['get'])
    def daily_stats(self, request):
        """Get daily conversion statistics"""
        days = int(request.query_params.get('days', 30))
        start_date = timezone.localdate() - timedelta(days=days)
        
        # Get videos grouped by date with counts
        stats = Video.objects.filter(
            user=request.user,
            upload_date__date__gte=start_date
        ).annotate(
            date=TruncDate('upload_date')
        ).values('date').annotate(
            count=Count('id')
        ).order_by('-date')
        
        # Format response
        result = []
        today = timezone.localdate()
        yesterday = today - timedelta(days=1)
        
        for stat in stats:
            date_obj = stat['date']
            
            if date_obj == today:
                display_date = "Today"
            elif date_obj == yesterday:
                display_date = "Yesterday"
            else:
                display_date = date_obj.strftime("%B %d, %Y")
            
            result.append({
                'date': date_obj.isoformat(),
                'display_date': display_date,
                'count': stat['count']
            })
        
        return Response(result)
    
    @action(detail=False, methods=['get'])
    def date_range(self, request):
        """Get videos for a specific date or date range"""
        date = request.query_params.get('date')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        queryset = Video.objects.filter(user=request.user)
        
        if date:
            # Single date
            queryset = queryset.filter(upload_date__date=date)
        elif start_date and end_date:
            # Date range
            queryset = queryset.filter(upload_date__date__gte=start_date, upload_date__date__lte=end_date)
        else:
            return Response(
                {'error': 'Please provide either date or start_date and end_date'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        videos = queryset.order_by('-upload_date')
        return Response(VideoListSerializer(videos, many=True).data)
    
    def destroy(self, request, *args, **kwargs):
        """Delete video and associated files"""
        video = self.get_object()
        
        try:
            # Delete the video file if it exists
            if video.file:
                try:
                    video_file_path = video.file.path
                    if os.path.exists(video_file_path):
                        os.remove(video_file_path)
                        logger.info(f"Deleted video file: {video_file_path}")
                except Exception as e:
                    logger.warning(f"Could not delete video file: {e}")
            
            # Delete associated PDF if exists
            try:
                if hasattr(video, 'pdf') and video.pdf:
                    pdf_file_path = video.pdf.file.path
                    if os.path.exists(pdf_file_path):
                        os.remove(pdf_file_path)
                        logger.info(f"Deleted PDF file: {pdf_file_path}")
                    video.pdf.delete()
            except Exception as e:
                logger.warning(f"Could not delete PDF: {e}")
            
            # Delete the database record
            video_id = video.id
            video.delete()
            logger.info(f"Deleted video record ID: {video_id}")
            
            return Response(
                {'message': 'Video deleted successfully'},
                status=status.HTTP_204_NO_CONTENT
            )
        
        except Exception as e:
            logger.error(f"Error deleting video: {e}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        """Get processing status of a video"""
        video = self.get_object()
        return Response({
            'id': video.id,
            'status': video.status,
            'processing_stage': video.processing_stage,
            'error_message': video.error_message,
        })

    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        """Retry processing a failed video from where it left off."""
        video = self.get_object()
        if video.status != 'failed':
            return Response(
                {'error': 'Only failed videos can be retried'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        video.status = 'processing'
        video.error_message = None
        video.save()

        from video_processor.pipeline import process_video_async
        process_video_async(video.id)

        return Response({'id': video.id, 'status': 'processing', 'message': 'Retrying...'})
    
    @action(detail=True, methods=['get', 'head'])
    def audio(self, request, pk=None):
        """Stream the extracted audio file with full HTTP Range Request support.

        Browsers need 206 Partial Content + Accept-Ranges: bytes to seek/scrub.
        Django's FileResponse does NOT handle Range headers — this does.
        """
        # ── Auth via query-param token (HTML <audio> elements can't set headers) ──
        token_key = request.query_params.get('token')
        if not token_key:
            return Response({'error': 'Token required'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            token = Token.objects.get(key=token_key)
        except Token.DoesNotExist:
            return Response({'error': 'Invalid token'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            video = Video.objects.get(pk=pk)
        except Video.DoesNotExist:
            return Response({'error': 'Video not found'}, status=status.HTTP_404_NOT_FOUND)

        if video.user != token.user:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        if not video.audio_path:
            return Response(
                {'error': 'No audio file available for this video'},
                status=status.HTTP_404_NOT_FOUND
            )

        audio_file = Path(video.audio_path)
        if not audio_file.exists():
            return Response(
                {'error': 'Audio file not found on disk'},
                status=status.HTTP_404_NOT_FOUND
            )

        from django.http import StreamingHttpResponse
        import mimetypes

        file_size = audio_file.stat().st_size
        content_type = mimetypes.guess_type(str(audio_file))[0] or 'audio/mpeg'
        CHUNK = 1024 * 1024  # 1 MB streaming chunks

        range_header = request.META.get('HTTP_RANGE', '').strip()

        if range_header and range_header.startswith('bytes='):
            # ── Parse Range header  e.g. "bytes=1024-2047" or "bytes=1024-" ──
            try:
                range_spec = range_header[6:]          # strip "bytes="
                start_str, _, end_str = range_spec.partition('-')
                start = int(start_str) if start_str else 0
                end   = int(end_str)   if end_str   else file_size - 1

                # Clamp to valid range
                start = max(0, min(start, file_size - 1))
                end   = max(start, min(end, file_size - 1))
            except (ValueError, IndexError):
                # Malformed Range header — return 416
                from django.http import HttpResponse
                resp = HttpResponse(status=416)
                resp['Content-Range'] = f'bytes */{file_size}'
                return resp

            span = end - start + 1

            def _stream_range(path, start, span, chunk):
                with open(path, 'rb') as fh:
                    fh.seek(start)
                    remaining = span
                    while remaining > 0:
                        data = fh.read(min(chunk, remaining))
                        if not data:
                            break
                        remaining -= len(data)
                        yield data

            response = StreamingHttpResponse(
                _stream_range(audio_file, start, span, CHUNK),
                status=206,
                content_type=content_type,
            )
            response['Content-Range']  = f'bytes {start}-{end}/{file_size}'
            response['Content-Length'] = str(span)

        else:
            # ── No Range header — return whole file ──
            def _stream_full(path, chunk):
                with open(path, 'rb') as fh:
                    while True:
                        data = fh.read(chunk)
                        if not data:
                            break
                        yield data

            response = StreamingHttpResponse(
                _stream_full(audio_file, CHUNK),
                status=200,
                content_type=content_type,
            )
            response['Content-Length'] = str(file_size)

        # ── Headers required for browser seeking ──
        response['Accept-Ranges']                = 'bytes'
        response['Cache-Control']                = 'no-cache'
        response['Access-Control-Allow-Origin']  = 'http://localhost:5173'
        response['Access-Control-Allow-Headers'] = 'Range'
        response['Access-Control-Expose-Headers'] = 'Accept-Ranges, Content-Range, Content-Length'
        response['Content-Disposition'] = f'inline; filename="{audio_file.name}"'
        return response

    
    @action(detail=True, methods=['post'])
    def query(self, request, pk=None):
        """Ask a question about a video"""
        video = self.get_object()
        
        if video.status != 'completed':
            return Response(
                {'error': 'Video processing not complete'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        question = request.data.get('question')
        if not question:
            return Response(
                {'error': 'Question is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Query the video
        from video_processor.query import query_video
        try:
            result = query_video(video.id, question)
            
            # Save query to database
            user = request.user
            query_obj = Query.objects.create(
                user=user,
                video=video,
                question=question,
                answer=result['answer'],
                timestamp_start=result.get('timestamp_start'),
                timestamp_end=result.get('timestamp_end'),
            )
            
            # Update user profile stats
            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.total_queries += 1
            profile.save()
            
            return Response({
                **QuerySerializer(query_obj).data,
                'youtube_url': video.youtube_url or '',
            })
        
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Get or generate PDF for a video"""
        video = self.get_object()
        
        if video.status != 'completed':
            return Response(
                {'error': 'Video processing not complete'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        refresh = str(request.query_params.get('refresh', '')).lower() in ['1', 'true', 'yes']

        # Check if PDF exists
        try:
            pdf = video.pdf
            if not refresh:
                return Response(PDFSerializer(pdf).data)
        except PDF.DoesNotExist:
            pass

        # Generate or regenerate PDF
        from video_processor.pdf_gen import generate_pdf
        try:
            pdf = generate_pdf(video.id)
            return Response(PDFSerializer(pdf).data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


    @action(detail=True, methods=['post'])
    def ai_chat(self, request, pk=None):
        """AI chatbot powered by Groq — answers questions about a video's content"""
        video = self.get_object()

        if video.status != 'completed':
            return Response(
                {'error': 'Video processing not complete'},
                status=status.HTTP_400_BAD_REQUEST
            )

        message = request.data.get('message')
        history = request.data.get('history', [])

        if not message:
            return Response(
                {'error': 'Message is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Load transcript for this video
            from pathlib import Path as PPath
            import json as json_mod
            SCRIPTS_DIR = PPath(settings.BASE_DIR).parent / 'Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-'

            import sys
            sys.path.insert(0, str(SCRIPTS_DIR))
            import pipelIne_api

            video_filename = PPath(video.file.name).name
            base_name = pipelIne_api.clean_filename(video_filename.rsplit('.', 1)[0])
            json_path = SCRIPTS_DIR / 'jsons' / f'0_{base_name}.mp3.json'

            transcript_text = ""
            if json_path.exists():
                with open(json_path, 'r', encoding='utf-8') as f:
                    data = json_mod.load(f)
                    transcript_text = data.get('text', '')
            else:
                logger.warning(f"Transcript not found at {json_path}")
                transcript_text = "No transcript available for this video."

            # Truncate transcript if too long (Groq context limit)
            max_chars = 12000
            if len(transcript_text) > max_chars:
                transcript_text = transcript_text[:max_chars] + "... [transcript truncated]"

            # Build messages for Groq
            system_prompt = (
                f"You are a helpful AI assistant. You have access to the transcript of a video titled \"{video.title}\". "
                f"You can answer ANY question the user asks — whether it's about the video or any other topic. "
                f"When the question is about the video, use the transcript below as context. "
                f"For other questions, answer using your general knowledge. Be helpful, concise, and friendly.\n\n"
                f"VIDEO TRANSCRIPT (for reference):\n{transcript_text}"
            )

            groq_messages = [{"role": "system", "content": system_prompt}]

            # Add conversation history
            for h in history[-10:]:  # Last 10 messages to stay within context
                groq_messages.append({
                    "role": h.get("role", "user"),
                    "content": h.get("content", "")
                })

            # Add current message
            groq_messages.append({"role": "user", "content": message})

            # Call Groq chat completions
            from groq import Groq
            groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

            completion = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=groq_messages,
                temperature=0.7,
                max_tokens=1024,
            )

            reply = completion.choices[0].message.content

            return Response({
                'reply': reply,
                'model': 'llama-3.3-70b-versatile',
            })

        except Exception as e:
            logger.error(f"AI chat error: {e}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class QueryViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for Query history"""
    
    serializer_class = QuerySerializer
    authentication_classes = [TokenAuthentication, SessionAuthentication]
    
    def get_queryset(self):
        video_id = self.request.query_params.get('video_id')
        if video_id:
            return Query.objects.filter(video_id=video_id, user=self.request.user)
        return Query.objects.filter(user=self.request.user)


class UserProfileViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for User Profile stats"""
    
    serializer_class = UserProfileSerializer
    authentication_classes = [TokenAuthentication, SessionAuthentication]
    
    def get_queryset(self):
        return UserProfile.objects.filter(user=self.request.user)
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get current user's statistics"""
        user = request.user
        
        profile, _ = UserProfile.objects.get_or_create(user=user)
        
        # Update profile stats from actual data
        profile.total_videos = Video.objects.filter(user=user, status='completed').count()
        profile.total_queries = Query.objects.filter(user=user).count()
        profile.total_pdfs = PDF.objects.filter(video__user=user).count()
        profile.total_processing_hours = sum(
            v.duration_seconds or 0 for v in Video.objects.filter(user=user, status='completed')
        ) / 3600.0
        profile.save()
        
        return Response(UserProfileSerializer(profile).data)


@method_decorator(csrf_exempt, name='dispatch')
class AuthViewSet(viewsets.ViewSet):
    """Email/password authentication endpoints"""

    authentication_classes = [TokenAuthentication, SessionAuthentication]

    def get_permissions(self):
        if self.action in ['register', 'login', 'google_login']:
            return [AllowAny()]
        return super().get_permissions()

    def _unique_username(self, email):
        base_username = email.split('@')[0]
        username = base_username
        suffix = 1
        while User.objects.filter(username=username).exists():
            username = f"{base_username}{suffix}"
            suffix += 1
        return username

    @action(detail=False, methods=['post'])
    def register(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        password = serializer.validated_data['password']
        username = self._unique_username(email)

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
        )
        profile, _ = UserProfile.objects.get_or_create(user=user)

        token, _ = Token.objects.get_or_create(user=user)
        response_user = {
            'id': user.id,
            'username': user.email.split('@')[0],
            'email': user.email,
            'name': user.email.split('@')[0],
            'picture': profile.picture or '',
        }

        return Response(
            {
                'message': 'Registration successful.',
                'token': token.key,
                'user': response_user,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['post'])
    def login(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email'].strip().lower()
        password = serializer.validated_data['password']

        user = User.objects.filter(email__iexact=email).first()
        if not user:
            return Response(
                {'error': 'Register first with this email before logging in.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        authenticated_user = authenticate(request, username=user.username, password=password)
        if not authenticated_user:
            return Response(
                {'error': 'Incorrect password. Please try again.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        token, _ = Token.objects.get_or_create(user=authenticated_user)
        profile, _ = UserProfile.objects.get_or_create(user=authenticated_user)
        profile.last_login = timezone.now()
        profile.save(update_fields=['last_login'])

        response_user = {
            'id': authenticated_user.id,
            'username': authenticated_user.email.split('@')[0],
            'email': authenticated_user.email,
            'name': authenticated_user.email.split('@')[0],
            'picture': profile.picture or '',
        }

        return Response(
            {
                'message': 'Login successful.',
                'token': token.key,
                'user': response_user,
            }
        )

    @action(detail=False, methods=['post'])
    def google_login(self, request):
        serializer = GoogleLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        credential = serializer.validated_data['credential']

        try:
            import jwt
            decoded = jwt.decode(credential, options={"verify_signature": False})
        except Exception:
            return Response(
                {'error': 'Invalid Google credential.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = (decoded.get('email') or '').strip().lower()
        if not email:
            return Response(
                {'error': 'Google account email not available.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not email.endswith('@gmail.com'):
            return Response(
                {'error': 'Please use a valid Gmail account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        name = decoded.get('name') or email.split('@')[0]
        picture = decoded.get('picture') or ''
        google_sub = decoded.get('sub') or ''

        user = User.objects.filter(email__iexact=email).first()
        created = False
        if not user:
            created = True
            username = self._unique_username(email)
            user = User.objects.create_user(
                username=username,
                email=email,
                first_name=name,
                password=User.objects.make_random_password(length=20),
            )

        profile, _ = UserProfile.objects.get_or_create(user=user)
        if google_sub and profile.google_id != google_sub:
            profile.google_id = google_sub
        if picture:
            profile.picture = picture
        profile.last_login = timezone.now()
        profile.save()

        token, _ = Token.objects.get_or_create(user=user)
        response_user = {
            'id': user.id,
            'username': user.email.split('@')[0],
            'email': user.email,
            'name': user.email.split('@')[0],
            'picture': profile.picture,
        }

        return Response(
            {
                'message': 'Registration successful with Google.' if created else 'Login successful with Google.',
                'token': token.key,
                'user': response_user,
                'is_new_user': created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'])
    def logout(self, request):
        if request.auth:
            request.auth.delete()
        return Response({'message': 'Logged out successfully.'})

    @action(detail=False, methods=['get'])
    def me(self, request):
        user = request.user
        profile, _ = UserProfile.objects.get_or_create(user=user)
        response_user = {
            'id': user.id,
            'username': user.email.split('@')[0] if user.email else user.username,
            'email': user.email,
            'name': user.email.split('@')[0] if user.email else user.username,
            'picture': profile.picture or '',
        }
        return Response({'user': response_user})
