from django.apps import AppConfig


class ApiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "api"

    def ready(self):
        """Schedule stuck-video recovery after all apps are fully loaded."""
        from django.db.models.signals import post_migrate

        post_migrate.connect(_recover_stuck_videos, sender=self)


def _recover_stuck_videos(sender, **kwargs):
    """Recover videos stuck in 'processing' state from previous server runs."""
    import logging
    from django.db import OperationalError, ProgrammingError

    logger = logging.getLogger(__name__)
    try:
        from api.models import Video

        stuck = Video.objects.filter(status='processing')
        count = stuck.count()
        if count:
            logger.warning(
                f"Found {count} video(s) stuck in 'processing' — marking as failed."
            )
            stuck.update(
                status='failed',
                error_message='Processing interrupted by server restart. Please re-upload.',
            )
    except (OperationalError, ProgrammingError):
        pass
