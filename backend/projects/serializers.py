from rest_framework import serializers

from .models import Project, Workspace


class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ["id", "name", "created_at"]


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ["id", "workspace", "name", "path_hint", "project_type", "last_opened_at", "created_at"]

    def validate_workspace(self, ws):
        if ws.owner_id != self.context["request"].user.id:
            raise serializers.ValidationError("Unknown workspace.")
        return ws
