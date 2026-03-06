"""
DRF Serializers for Video RAG API
"""
from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from .models import Video, Query, PDF, UserProfile


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model"""
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']
        read_only_fields = ['id']


class VideoSerializer(serializers.ModelSerializer):
    """Serializer for Video model"""
    
    user = UserSerializer(read_only=True)
    
    class Meta:
        model = Video
        fields = [
            'id', 'user', 'title', 'file', 'upload_date', 
            'status', 'processing_stage', 'duration_seconds',
            'error_message', 'audio_path', 'json_path', 'youtube_url'
        ]
        read_only_fields = [
            'id', 'user', 'upload_date', 'status', 
            'processing_stage', 'duration_seconds',
            'audio_path', 'json_path'
        ]


class VideoListSerializer(serializers.ModelSerializer):
    """Simplified serializer for video list view"""
    
    class Meta:
        model = Video
        fields = ['id', 'title', 'file', 'upload_date', 'status', 'processing_stage', 'duration_seconds', 'youtube_url', 'audio_path']


class QuerySerializer(serializers.ModelSerializer):
    """Serializer for Query model"""
    
    class Meta:
        model = Query
        fields = [
            'id', 'video', 'question', 'answer', 
            'timestamp_start', 'timestamp_end', 'created_at'
        ]
        read_only_fields = ['id', 'answer', 'timestamp_start', 'timestamp_end', 'created_at']


class PDFSerializer(serializers.ModelSerializer):
    """Serializer for PDF model"""
    
    class Meta:
        model = PDF
        fields = ['id', 'video', 'file', 'generated_at', 'file_size_bytes']
        read_only_fields = ['id', 'generated_at', 'file_size_bytes']


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for UserProfile model"""
    
    user = UserSerializer(read_only=True)
    
    class Meta:
        model = UserProfile
        fields = [
            'user', 'total_videos', 'total_queries', 
            'total_pdfs', 'total_processing_hours'
        ]
        read_only_fields = [
            'total_videos', 'total_queries', 
            'total_pdfs', 'total_processing_hours'
        ]


class DailyVideosSerializer(serializers.Serializer):
    """Serializer for daily grouped videos"""
    
    date = serializers.DateField()
    display_date = serializers.CharField(read_only=True)
    count = serializers.IntegerField(read_only=True)
    videos = VideoListSerializer(many=True, read_only=True)
    
    class Meta:
        fields = ['date', 'display_date', 'count', 'videos']


class RegisterSerializer(serializers.Serializer):
    """Serializer for user registration with email/password"""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True, min_length=8)

    def validate_email(self, value):
        normalized_email = value.strip().lower()
        if not normalized_email.endswith('@gmail.com'):
            raise serializers.ValidationError('Please use a valid Gmail address.')

        if User.objects.filter(email__iexact=normalized_email).exists():
            raise serializers.ValidationError('This email is already registered. Please log in.')

        return normalized_email

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})

        temp_user = User(email=attrs['email'], username=attrs['email'].split('@')[0])
        validate_password(attrs['password'], temp_user)
        return attrs


class LoginSerializer(serializers.Serializer):
    """Serializer for login with email/password"""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class GoogleLoginSerializer(serializers.Serializer):
    """Serializer for Google credential login"""

    credential = serializers.CharField(write_only=True)
