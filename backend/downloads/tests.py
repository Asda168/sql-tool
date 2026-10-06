from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import EditorSettings
from releases.models import Release

from .models import Download


class DownloadTests(APITestCase):
    def setUp(self):
        Release.objects.create(
            version="1.0.0", platform="windows", architecture="x64", package_type="exe",
            download_url="https://example.com/a.exe", checksum="a" * 64, is_latest=True,
        )

    def test_public_releases_listing(self):
        self.assertEqual(self.client.get("/api/releases/").status_code, 200)
        self.assertEqual(len(self.client.get("/api/releases/latest/").json()), 1)

    def test_download_creates_record_anonymously(self):
        r = self.client.post("/api/downloads/", {"platform": "windows"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["package_type"], "exe")
        d = Download.objects.get()
        self.assertEqual(len(d.ip_hash), 64)
        self.assertNotIn("127.0.0.1", d.ip_hash)

    def test_missing_platform_release_404(self):
        self.assertEqual(self.client.post("/api/downloads/", {"platform": "macos"}, format="json").status_code, 404)

    def test_only_one_latest(self):
        Release.objects.create(
            version="1.1.0", platform="windows", architecture="x64", package_type="exe",
            download_url="https://example.com/b.exe", checksum="b" * 64, is_latest=True,
        )
        self.assertEqual(Release.objects.filter(is_latest=True).count(), 1)

    def test_release_write_requires_staff(self):
        u = get_user_model().objects.create_user("u", password="x-Str0ng-pw")
        self.client.force_authenticate(u)
        self.assertEqual(self.client.post("/api/releases/", {}, format="json").status_code, 403)


class AuthAndSettingsTests(APITestCase):
    def test_register_login_settings_flow(self):
        r = self.client.post("/api/auth/register/", {"username": "dev", "email": "d@x.io", "password": "Str0ng-pass-99"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertNotIn("password", r.json())
        tok = self.client.post("/api/auth/login/", {"username": "dev", "password": "Str0ng-pass-99"}, format="json").json()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tok['access']}")
        s = self.client.get("/api/editor/settings/").json()
        self.assertEqual((s["font_family"], s["font_size"], s["theme_mode"]), ("JetBrains Mono", 14, "dark"))
        self.assertEqual(self.client.patch("/api/editor/settings/", {"font_size": 18}, format="json").json()["font_size"], 18)
        self.assertEqual(self.client.patch("/api/editor/settings/", {"font_size": 99}, format="json").status_code, 400)
        self.assertEqual(EditorSettings.objects.count(), 1)

    def test_unauthenticated_blocked(self):
        self.assertEqual(self.client.get("/api/projects/").status_code, 401)
        self.assertEqual(self.client.get("/api/query-history/").status_code, 401)
