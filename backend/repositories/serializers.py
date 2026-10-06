import re

from rest_framework import serializers

from .models import GitRemote, Repository

URL_RE = re.compile(r"^(https://[^\s@]+|git@[\w.\-]+:[\w./\-]+|ssh://[^\s@]*@?[^\s]+)$")


def validate_git_url(value):
    # Credentials embedded in https URLs (https://user:token@host) must never be stored.
    if re.match(r"^https?://[^/]*@", value):
        raise serializers.ValidationError("Do not embed credentials in the URL.")
    if value and not URL_RE.match(value):
        raise serializers.ValidationError("Use an https:// or git@host:path URL.")
    return value


class GitRemoteSerializer(serializers.ModelSerializer):
    url = serializers.CharField(validators=[validate_git_url])

    class Meta:
        model = GitRemote
        fields = ["id", "repository", "name", "url"]


class RepositorySerializer(serializers.ModelSerializer):
    remote_url = serializers.CharField(required=False, allow_blank=True, validators=[validate_git_url])
    remotes = GitRemoteSerializer(many=True, read_only=True)

    class Meta:
        model = Repository
        fields = ["id", "project", "name", "remote_url", "default_branch", "remotes", "created_at"]

    def validate_project(self, p):
        if p.workspace.owner_id != self.context["request"].user.id:
            raise serializers.ValidationError("Unknown project.")
        return p
