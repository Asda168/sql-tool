from django.urls import path

from .consumers import ReleaseConsumer

websocket_urlpatterns = [path("ws/releases/", ReleaseConsumer.as_asgi())]
