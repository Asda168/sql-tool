from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import OwnedModelViewSet

from .models import QueryHistory, SavedQuery
from .serializers import QueryHistorySerializer, SavedQuerySerializer


class SavedQueryViewSet(OwnedModelViewSet):
    queryset = SavedQuery.objects.all()
    serializer_class = SavedQuerySerializer


class QueryHistoryViewSet(OwnedModelViewSet):
    queryset = QueryHistory.objects.select_related("result")
    serializer_class = QueryHistorySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        cid = self.request.query_params.get("connection")
        return qs.filter(connection_id=cid) if cid else qs

    @action(detail=False, methods=["delete"])
    def clear(self, request):
        n, _ = self.get_queryset().delete()
        return Response({"deleted": n})
