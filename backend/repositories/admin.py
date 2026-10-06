from django.contrib import admin

from .models import GitRemote, Repository

admin.site.register(Repository)
admin.site.register(GitRemote)
