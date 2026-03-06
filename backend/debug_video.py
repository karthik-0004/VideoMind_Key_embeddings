import os
import django
import sys

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from api.models import Video

try:
    v = Video.objects.last()
    if v:
        print(f"--- Video ID: {v.id} ---")
        print(f"Title: {v.title}")
        print(f"Status: {v.status}")
        print(f"Processing Stage: {v.processing_stage}")
        print(f"Error Message: {v.error_message}")
    else:
        print("No videos found.")
except Exception as e:
    print(f"Error checking video: {e}")
