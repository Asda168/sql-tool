from django.contrib import admin

from .models import Release


@admin.register(Release)
class ReleaseAdmin(admin.ModelAdmin):
    list_display = ("version", "platform", "architecture", "package_type", "is_latest", "published_at")
    list_filter = ("platform", "architecture", "is_latest")
