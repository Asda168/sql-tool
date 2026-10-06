import hashlib

from django.conf import settings
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from releases.models import Release
from releases.serializers import ReleaseSerializer

from .models import Download

DEFAULT_PACKAGE = {"windows": "exe", "macos": "dmg", "linux": "appimage"}


class DownloadRequestSerializer(serializers.Serializer):
    platform = serializers.ChoiceField(choices=[p for p, _ in Release.PLATFORMS])
    architecture = serializers.ChoiceField(choices=[a for a, _ in Release.ARCHS], default="x64")
    package_type = serializers.ChoiceField(choices=[p for p, _ in Release.PACKAGES], required=False)


def client_ip(request):
    return request.META.get("REMOTE_ADDR", "")


class DownloadView(APIView):
    """POST creates a Download record for the latest matching release and returns its URL.

    The website then starts the download from `release.download_url`.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "download"

    def post(self, request):
        s = DownloadRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        pkg = d.get("package_type") or DEFAULT_PACKAGE[d["platform"]]
        release = (
            Release.objects.filter(platform=d["platform"], architecture=d["architecture"], package_type=pkg, is_latest=True)
            .order_by("-published_at")
            .first()
        )
        if not release:
            return Response({"detail": "No release available for that platform."}, status=404)
        ip_hash = hashlib.sha256(f"{settings.DOWNLOAD_HASH_SALT}:{client_ip(request)}".encode()).hexdigest()
        Download.objects.create(release=release, ip_hash=ip_hash, user_agent=request.META.get("HTTP_USER_AGENT", "")[:300])
        return Response(ReleaseSerializer(release).data, status=201)


class DownloadStatsView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        from django.db.models import Count

        rows = Download.objects.values("release__platform", "release__version").annotate(n=Count("id")).order_by("-n")
        return Response(list(rows))
