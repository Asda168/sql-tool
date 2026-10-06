from django.db import models
from django.utils import timezone


class Release(models.Model):
    PLATFORMS = [("windows", "Windows"), ("macos", "macOS"), ("linux", "Linux")]
    ARCHS = [("x64", "x64"), ("arm64", "ARM64")]
    PACKAGES = [
        ("exe", "Installer (.exe)"),
        ("portable", "Portable (.zip)"),
        ("dmg", "Disk image (.dmg)"),
        ("appimage", "AppImage"),
        ("deb", ".deb"),
        ("rpm", ".rpm"),
    ]
    version = models.CharField(max_length=32)
    platform = models.CharField(max_length=10, choices=PLATFORMS)
    architecture = models.CharField(max_length=5, choices=ARCHS, default="x64")
    package_type = models.CharField(max_length=10, choices=PACKAGES)
    download_url = models.URLField(max_length=500)
    file_size = models.BigIntegerField(default=0, help_text="bytes")
    checksum = models.CharField(max_length=64, help_text="SHA-256 hex digest")
    release_notes = models.TextField(blank=True)
    published_at = models.DateTimeField(default=timezone.now)
    is_latest = models.BooleanField(default=False)

    class Meta:
        ordering = ["-published_at", "platform", "architecture"]
        unique_together = [("version", "platform", "architecture", "package_type")]

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_latest:  # only one latest per platform/arch/package
            Release.objects.filter(
                platform=self.platform, architecture=self.architecture, package_type=self.package_type, is_latest=True
            ).exclude(pk=self.pk).update(is_latest=False)

    def __str__(self):
        return f"{self.version} {self.platform}/{self.architecture} {self.package_type}"
