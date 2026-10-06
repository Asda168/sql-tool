from accounts.permissions import OwnedModelViewSet

from .models import GitRemote, Repository
from .serializers import GitRemoteSerializer, RepositorySerializer


class RepositoryViewSet(OwnedModelViewSet):
    queryset = Repository.objects.all()
    serializer_class = RepositorySerializer
    owner_field = "project__workspace__owner"

    def perform_create(self, serializer):
        serializer.save()


class GitRemoteViewSet(OwnedModelViewSet):
    queryset = GitRemote.objects.all()
    serializer_class = GitRemoteSerializer
    owner_field = "repository__project__workspace__owner"

    def perform_create(self, serializer):
        repo = serializer.validated_data["repository"]
        if repo.project.workspace.owner_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied()
        serializer.save()
