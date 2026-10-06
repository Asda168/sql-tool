from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Release
from .serializers import ReleaseSerializer


class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.method in permissions.SAFE_METHODS or bool(request.user and request.user.is_staff)


class ReleaseViewSet(viewsets.ModelViewSet):
    """Public read access (website); only staff can write."""

    queryset = Release.objects.all()
    serializer_class = ReleaseSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        for f in ("platform", "architecture", "version", "package_type"):
            if p.get(f):
                qs = qs.filter(**{f: p[f]})
        return qs

    @action(detail=False, methods=["get"])
    def latest(self, request):
        qs = self.get_queryset().filter(is_latest=True)
        return Response(ReleaseSerializer(qs, many=True).data)
