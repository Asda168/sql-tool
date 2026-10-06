from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("themes", views.ThemeViewSet)
router.register("terminal-profiles", views.TerminalProfileViewSet)
router.register("preferences", views.UserPreferenceViewSet)

urlpatterns = [path("settings/", views.EditorSettingsView.as_view()), path("", include(router.urls))]
