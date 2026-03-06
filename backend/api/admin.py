"""
Admin configuration for Video RAG models
"""
from django.contrib import admin
from .models import Video, Query, PDF, UserProfile


@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = ['title', 'user', 'status', 'processing_stage', 'upload_date']
    list_filter = ['status', 'processing_stage', 'upload_date']
    search_fields = ['title', 'user__username']
    readonly_fields = ['upload_date']


@admin.register(Query)
class QueryAdmin(admin.ModelAdmin):
    list_display = ['video', 'user', 'question_preview', 'created_at']
    list_filter = ['created_at']
    search_fields = ['question', 'answer', 'video__title']
    readonly_fields = ['created_at']
    
    def question_preview(self, obj):
        return obj.question[:50] + '...' if len(obj.question) > 50 else obj.question
    question_preview.short_description = 'Question'


@admin.register(PDF)
class PDFAdmin(admin.ModelAdmin):
    list_display = ['video', 'file', 'generated_at', 'file_size_bytes']
    list_filter = ['generated_at']
    search_fields = ['video__title']
    readonly_fields = ['generated_at']


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'total_videos', 'total_queries', 'total_pdfs', 'total_processing_hours']
    search_fields = ['user__username']
