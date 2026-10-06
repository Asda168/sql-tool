from django.urls import path

from . import views

urlpatterns = [path("", views.DownloadView.as_view()), path("stats/", views.DownloadStatsView.as_view())]
