from django.core.management.base import BaseCommand

from releases.models import Release

BASE = "https://github.com/mysql-forge-studio/mysql-forge-studio/releases/download/v1.0.0"
NOTES = "Initial release: MySQL client, SQL editor, project explorer, Git and terminal."

# (platform, arch, package, filename, size MB)
ROWS = [
    ("windows", "x64", "exe", "MySQL-Forge-Studio_1.0.0_x64-setup.exe", 78),
    ("windows", "x64", "portable", "MySQL-Forge-Studio_1.0.0_x64-portable.zip", 82),
    ("macos", "arm64", "dmg", "MySQL-Forge-Studio_1.0.0_aarch64.dmg", 71),
    ("macos", "x64", "dmg", "MySQL-Forge-Studio_1.0.0_x64.dmg", 74),
    ("linux", "x64", "appimage", "MySQL-Forge-Studio_1.0.0_amd64.AppImage", 85),
    ("linux", "x64", "deb", "MySQL-Forge-Studio_1.0.0_amd64.deb", 69),
    ("linux", "x64", "rpm", "MySQL-Forge-Studio-1.0.0-1.x86_64.rpm", 69),
    ("linux", "arm64", "appimage", "MySQL-Forge-Studio_1.0.0_aarch64.AppImage", 83),
]


class Command(BaseCommand):
    help = "Create placeholder v1.0.0 release rows. Replace checksums/URLs with real build artifacts before publishing."

    def handle(self, *args, **opts):
        for platform, arch, pkg, name, mb in ROWS:
            Release.objects.update_or_create(
                version="1.0.0", platform=platform, architecture=arch, package_type=pkg,
                defaults={
                    "download_url": f"{BASE}/{name}",
                    "file_size": mb * 1024 * 1024,
                    "checksum": "0" * 64,  # PLACEHOLDER: set to the real sha256 of the built artifact
                    "release_notes": NOTES,
                    "is_latest": True,
                },
            )
        self.stdout.write(self.style.WARNING("Seeded placeholder releases (checksums are all zeros)."))
