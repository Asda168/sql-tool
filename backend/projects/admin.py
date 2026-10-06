from django.contrib import admin

from .models import Project, Workspace

admin.site.register(Workspace)
admin.site.register(Project)
