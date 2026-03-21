from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0007_alter_video_processing_stage"),
    ]

    operations = [
        migrations.AddField(
            model_name="video",
            name="source",
            field=models.CharField(
                choices=[("local", "Local File"), ("youtube", "YouTube")],
                default="local",
                max_length=10,
            ),
        ),
    ]
