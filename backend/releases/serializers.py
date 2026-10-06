from rest_framework import serializers

from .models import Release


class ReleaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Release
        fields = [
            "id", "version", "platform", "architecture", "package_type", "download_url",
            "file_size", "checksum", "release_notes", "published_at", "is_latest",
        ]
