"""
Monitor video processing progress without interrupting.
Polls the DB every 5 seconds and logs stage transitions with elapsed time.
"""
import sqlite3
import time
from datetime import datetime

DB_PATH = r"C:\Users\3541\Desktop\RAG Based by Karthik - Copy - Copy - Copy\backend\db.sqlite3"

def get_processing_videos(cur):
    cur.execute("""
        SELECT id, title, status, processing_stage, upload_date
        FROM api_video
        WHERE status = 'processing' OR status = 'uploading'
        ORDER BY id DESC
        LIMIT 5
    """)
    return cur.fetchall()

def get_latest_video(cur):
    cur.execute("""
        SELECT id, title, status, processing_stage, upload_date
        FROM api_video
        ORDER BY id DESC
        LIMIT 1
    """)
    return cur.fetchone()

print(f"[MONITOR] Started at {datetime.now().strftime('%H:%M:%S')}")
print("[MONITOR] Watching for new/processing videos... (Ctrl+C to stop)")
print("=" * 80)

last_stage = None
last_status = None
tracking_id = None
start_time = None
stage_start = None
stage_times = {}

try:
    while True:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        
        # Look for processing videos first, then latest
        rows = get_processing_videos(cur)
        if rows:
            vid = rows[0]
        else:
            vid = get_latest_video(cur)
        
        conn.close()
        
        if vid is None:
            time.sleep(5)
            continue
        
        vid_id, title, status, stage, upload_date = vid
        
        # Start tracking a new video
        if tracking_id != vid_id and (status in ('uploading', 'processing')):
            tracking_id = vid_id
            start_time = time.time()
            stage_start = time.time()
            last_stage = None
            last_status = None
            stage_times = {}
            print(f"\n[MONITOR] >> NEW VIDEO DETECTED: #{vid_id} '{title}'")
            print(f"[MONITOR]    Upload time: {upload_date}")
            print(f"[MONITOR]    Tracking started at {datetime.now().strftime('%H:%M:%S')}")
            print("-" * 80)
        
        if tracking_id and vid_id == tracking_id:
            now = time.time()
            elapsed = now - start_time if start_time else 0
            
            # Stage changed
            if stage != last_stage:
                if last_stage and stage_start:
                    stage_duration = now - stage_start
                    stage_times[last_stage] = stage_duration
                    print(f"[MONITOR]    Stage '{last_stage}' took: {stage_duration:.1f}s")
                
                stage_start = now
                last_stage = stage
                print(f"[MONITOR] [{elapsed:6.1f}s] Stage: {stage} | Status: {status}")
            
            # Status changed
            if status != last_status:
                if last_status:
                    print(f"[MONITOR] [{elapsed:6.1f}s] Status changed: {last_status} -> {status}")
                last_status = status
                
                # Processing completed or failed
                if status in ('completed', 'failed'):
                    # Record last stage
                    if stage_start and last_stage:
                        stage_duration = now - stage_start
                        stage_times[last_stage] = stage_duration
                        print(f"[MONITOR]    Stage '{last_stage}' took: {stage_duration:.1f}s")
                    
                    total = now - start_time if start_time else 0
                    print("=" * 80)
                    print(f"[MONITOR] >> VIDEO #{vid_id} '{title}' — {status.upper()}")
                    print(f"[MONITOR] >> TOTAL TIME: {total:.1f} seconds ({total/60:.1f} minutes)")
                    print(f"\n[MONITOR] Stage breakdown:")
                    for s, t in stage_times.items():
                        print(f"    {s:25s} : {t:6.1f}s  ({t/total*100:5.1f}%)")
                    print("=" * 80)
                    
                    # Reset to watch for next
                    tracking_id = None
                    start_time = None
                    stage_start = None
                    last_stage = None
                    last_status = None
                    stage_times = {}
                    print("\n[MONITOR] Waiting for next video...")
        
        time.sleep(5)
        
except KeyboardInterrupt:
    print("\n[MONITOR] Stopped.")
