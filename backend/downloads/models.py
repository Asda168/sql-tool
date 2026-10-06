from django.conf import settings
from django.db import models

from releases.models import Release


class Download(models.Model):
    release = models.ForeignKey(Release, on_delete=models.PROTECT, related_name="downloads")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    ip_hash = models.CharField(max_length=64, blank=True, help_text="Salted SHA-256; raw IPs are not stored")
    user_agent = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
