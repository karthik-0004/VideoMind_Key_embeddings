"""
URL Configuration for API
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VideoViewSet, QueryViewSet, UserProfileViewSet, AuthViewSet

router = DefaultRouter()
router.register(r'videos', VideoViewSet, basename='video')
router.register(r'queries', QueryViewSet, basename='query')
router.register(r'profile', UserProfileViewSet, basename='profile')
router.register(r'auth', AuthViewSet, basename='auth')

urlpatterns = [
    path('', include(router.urls)),
]
