from django.db import models

from projects.models import Project


class Repository(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="repositories")
    name = models.CharField(max_length=160)
    remote_url = models.CharField(max_length=500, blank=True)
    default_branch = models.CharField(max_length=120, default="main")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "repositories"


class GitRemote(models.Model):
    repository = models.ForeignKey(Repository, on_delete=models.CASCADE, related_name="remotes")
    name = models.CharField(max_length=60, default="origin")
    url = models.CharField(max_length=500)

    class Meta:
        unique_together = [("repository", "name")]
