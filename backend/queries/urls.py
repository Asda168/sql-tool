from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("queries", views.SavedQueryViewSet)
router.register("query-history", views.QueryHistoryViewSet)
urlpatterns = router.urls
