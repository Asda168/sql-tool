from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("remotes", views.GitRemoteViewSet)
router.register("", views.RepositoryViewSet)
urlpatterns = router.urls
