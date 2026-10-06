from rest_framework import viewsets


class OwnedModelViewSet(viewsets.ModelViewSet):
    """Every row is scoped to request.user via `owner_field`; users never see other users' data."""

    owner_field = "owner"

    def get_queryset(self):
        return super().get_queryset().filter(**{self.owner_field: self.request.user})

    def perform_create(self, serializer):
        serializer.save(**{self.owner_field: self.request.user})
