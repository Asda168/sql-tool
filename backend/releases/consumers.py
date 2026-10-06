from channels.generic.websocket import AsyncJsonWebsocketConsumer

GROUP = "releases"


class ReleaseConsumer(AsyncJsonWebsocketConsumer):
    """Public, read-only push channel: clients learn when a new release is published."""

    async def connect(self):
        await self.channel_layer.group_add(GROUP, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard(GROUP, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if content.get("type") == "ping":
            await self.send_json({"type": "pong"})

    async def release_published(self, event):
        await self.send_json({"type": "release", "version": event["version"]})
