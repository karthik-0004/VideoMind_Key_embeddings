"""
Django models for Video RAG application
"""
from django.db import models
from django.contrib.auth.models import User


class Video(models.Model):
    """Video model for uploaded videos"""
    
    STATUS_CHOICES = [
        ('uploading', 'Uploading'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    
    PROCESSING_STAGE_CHOICES = [
        ('uploaded', 'Uploaded'),
        ('compressing', 'Compressing Video'),
        ('audio_converted', 'Audio Converted'),
        ('transcribing', 'Transcribing Audio'),
        ('transcribed', 'Transcribed'),
        ('embedded', 'Embeddings Generated'),
        ('pdf_generated', 'PDF Generated'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='videos')
    title = models.CharField(max_length=255)
    file = models.FileField(upload_to='videos/')
    upload_date = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='uploading')
    processing_stage = models.CharField(max_length=30, choices=PROCESSING_STAGE_CHOICES, default='uploaded')
    duration_seconds = models.FloatField(null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    
    # File paths for processed files
    audio_path = models.CharField(max_length=500, null=True, blank=True)
    json_path = models.CharField(max_length=500, null=True, blank=True)
    
    # Source URL (for YouTube videos)
    youtube_url = models.URLField(max_length=500, null=True, blank=True)
    
    class Meta:
        ordering = ['-upload_date']
    
    def __str__(self):
        return f"{self.title} - {self.status}"


class Query(models.Model):
    """User queries about videos"""
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='queries')
    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name='queries')
    question = models.TextField()
    answer = models.TextField()
    timestamp_start = models.FloatField(null=True, blank=True)
    timestamp_end = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'Queries'
    
    def __str__(self):
        return f"Query on {self.video.title}: {self.question[:50]}..."


class PDF(models.Model):
    """Generated PDFs for videos"""
    
    video = models.OneToOneField(Video, on_delete=models.CASCADE, related_name='pdf')
    file = models.FileField(upload_to='pdfs/')
    generated_at = models.DateTimeField(auto_now_add=True)
    file_size_bytes = models.IntegerField(null=True, blank=True)
    
    def __str__(self):
        return f"PDF for {self.video.title}"


class UserProfile(models.Model):
    """Extended user profile for statistics"""
    
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    google_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    picture = models.URLField(blank=True)
    total_videos = models.IntegerField(default=0)
    total_queries = models.IntegerField(default=0)
    total_pdfs = models.IntegerField(default=0)
    total_processing_hours = models.FloatField(default=0.0)
    last_login = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Profile: {self.user.username}"
