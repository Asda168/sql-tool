from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models.signals import post_save
from django.dispatch import receiver

from .consumers import GROUP
from .models import Release


@receiver(post_save, sender=Release)
def notify_release(sender, instance, created, **kwargs):
    if created and instance.is_latest:
        layer = get_channel_layer()
        try:
            async_to_sync(layer.group_send)(GROUP, {"type": "release.published", "version": instance.version})
        except Exception:  # never fail a save because the push channel is unavailable
            pass
