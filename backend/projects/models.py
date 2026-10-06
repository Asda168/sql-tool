from django.conf import settings
from django.db import models


class Workspace(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="workspaces")
    name = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Project(models.Model):
    TYPES = [
        ("laravel", "Laravel"),
        ("django", "Django"),
        ("node", "Node"),
        ("python", "Python"),
        ("php", "PHP"),
        ("generic", "Generic"),
    ]
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="projects")
    name = models.CharField(max_length=160)
    # Hint only: the real path lives on the user's machine and is resolved by the desktop app.
    path_hint = models.CharField(max_length=500, blank=True)
    project_type = models.CharField(max_length=10, choices=TYPES, default="generic")
    last_opened_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name
