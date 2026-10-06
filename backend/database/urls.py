from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("connections", views.ConnectionViewSet)
router.register("schema", views.SchemaViewSet)
router.register("tables", views.TableViewSet)

urlpatterns = [
    path("schema-sync/", views.SchemaSyncView.as_view()),
    path("query/", views.QueryAnalyseView.as_view()),
] + router.urls
