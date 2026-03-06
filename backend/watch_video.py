import django, os, time
from datetime import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from api.models import Video

VIDEO_ID = 58
POLL_EVERY = 20   # seconds
MAX_POLLS = 12    # 4 minutes max

print(f"Watching video ID {VIDEO_ID} — polling every {POLL_EVERY}s...\n")

for i in range(MAX_POLLS):
    v = Video.objects.get(id=VIDEO_ID)
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}]  status={v.status:<12}  stage={v.processing_stage}")
    if v.status in ('completed', 'failed'):
        print(f"\nFINAL: {v.status.upper()}")
        if v.error_message:
            print(f"Error: {v.error_message[:300]}")
        break
    time.sleep(POLL_EVERY)
else:
    print("\nTimeout — video still processing after 4 minutes.")
