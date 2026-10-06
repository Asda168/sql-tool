from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/editor/", include("accounts.editor_urls")),
    path("api/projects/", include("projects.urls")),
    path("api/repositories/", include("repositories.urls")),
    path("api/database/", include("database.urls")),
    path("api/", include("queries.urls")),
    path("api/releases/", include("releases.urls")),
    path("api/downloads/", include("downloads.urls")),
]
