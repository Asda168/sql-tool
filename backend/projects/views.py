from accounts.permissions import OwnedModelViewSet

from .models import Project, Workspace
from .serializers import ProjectSerializer, WorkspaceSerializer


class WorkspaceViewSet(OwnedModelViewSet):
    queryset = Workspace.objects.all()
    serializer_class = WorkspaceSerializer


class ProjectViewSet(OwnedModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    owner_field = "workspace__owner"

    def perform_create(self, serializer):
        serializer.save()
