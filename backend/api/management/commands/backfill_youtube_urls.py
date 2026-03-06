"""
Management command to backfill youtube_url for older videos.

yt-dlp downloads files using the template:
    %(title).200B [%(id)s].%(ext)s

So the YouTube video ID is always embedded in the filename inside square brackets
right before the extension, e.g.:
    My Video Title [dQw4w9WgXcQ].mp4

Some older downloads use underscore separation instead:
    Every_Python_Function_Explained_NYktbp1WFS8.mp4

This command scans all videos, extracts the ID from the filename, and sets
youtube_url = https://www.youtube.com/watch?v=<id>
"""

import re
import os
from django.core.management.base import BaseCommand
from api.models import Video


# yt-dlp can produce two filename patterns:
# 1. Old-style: "Title [VIDEO_ID].ext"
# 2. New-style: "Title_VIDEO_ID.ext"
# YouTube video IDs are exactly 11 chars: letters, digits, - and _.
YT_ID_BRACKETED = re.compile(r'\[([A-Za-z0-9_-]{11})\](?:\.[^.]+)?$')
YT_ID_UNDERSCORE = re.compile(r'_([A-Za-z0-9_-]{11})(?:\.[^.]+)?$')


def extract_youtube_id_from_filename(filename):
    """Return the YouTube video ID embedded in a yt-dlp filename, or None."""
    basename = os.path.basename(filename)

    # 1. Try bracketed format  "... [ID].mp4"
    m = YT_ID_BRACKETED.search(basename)
    if m:
        return m.group(1)

    # 2. Try underscore-separated  "..._ID.mp4"
    name_no_ext = os.path.splitext(basename)[0]
    m = YT_ID_UNDERSCORE.search(name_no_ext + '.')
    if m:
        candidate = m.group(1)
        # Quick sanity: pure digit sequences are not YouTube IDs
        if not candidate.isdigit():
            return candidate

    # 3. Last resort: walk parts from end looking for 11-char alphanumeric segment
    parts = name_no_ext.split('_')
    for part in reversed(parts):
        if len(part) == 11 and re.match(r'^[A-Za-z0-9_-]{11}$', part) and not part.isdigit():
            return part

    return None


class Command(BaseCommand):
    help = 'Backfill youtube_url for videos downloaded from YouTube.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview changes without saving them.',
        )
        parser.add_argument(
            '--all',
            action='store_true',
            help='Re-process ALL videos, even those that already have a youtube_url.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        process_all = options['all']

        from django.db.models import Q

        if process_all:
            videos_to_process = Video.objects.all()
            self.stdout.write('Processing ALL videos (--all flag set).\n')
        else:
            videos_to_process = Video.objects.filter(
                Q(youtube_url__isnull=True) | Q(youtube_url='')
            )

        total = videos_to_process.count()
        self.stdout.write('Found %d video(s) to process.\n' % total)

        updated = 0
        skipped = 0

        for video in videos_to_process:
            filename = video.file.name if video.file else ''
            video_id = extract_youtube_id_from_filename(filename)

            if not video_id:
                self.stdout.write(
                    self.style.WARNING(
                        '  [SKIP] #%d "%s" - no YouTube ID found in: %s' % (
                            video.id, video.title, filename)
                    )
                )
                skipped += 1
                continue

            youtube_url = 'https://www.youtube.com/watch?v=%s' % video_id
            self.stdout.write(
                self.style.SUCCESS(
                    '  [SET]  #%d "%s" -> %s' % (video.id, video.title, youtube_url)
                )
            )

            if not dry_run:
                video.youtube_url = youtube_url
                video.save(update_fields=['youtube_url'])

            updated += 1

        self.stdout.write('\n--- Summary ---')
        self.stdout.write('Updated : %d' % updated)
        self.stdout.write('Skipped : %d  (not YouTube downloads)' % skipped)
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - no changes were saved.'))
        else:
            self.stdout.write(self.style.SUCCESS('Done.'))
