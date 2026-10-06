from django.db import transaction
from rest_framework import mixins, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import OwnedModelViewSet

from .models import DatabaseColumn, DatabaseConnection, DatabaseSchema, DatabaseTable
from .serializers import (
    DatabaseConnectionSerializer,
    DatabaseSchemaSerializer,
    DatabaseTableSerializer,
    QueryAnalyseSerializer,
    SchemaSyncSerializer,
)
from .sqlsafety import analyse


class ConnectionViewSet(OwnedModelViewSet):
    queryset = DatabaseConnection.objects.all()
    serializer_class = DatabaseConnectionSerializer


class SchemaViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    queryset = DatabaseSchema.objects.all()
    serializer_class = DatabaseSchemaSerializer

    def get_queryset(self):
        qs = super().get_queryset().filter(connection__owner=self.request.user)
        cid = self.request.query_params.get("connection")
        return qs.filter(connection_id=cid) if cid else qs


class TableViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = DatabaseTable.objects.select_related("schema").prefetch_related("columns")
    serializer_class = DatabaseTableSerializer

    def get_queryset(self):
        qs = super().get_queryset().filter(schema__connection__owner=self.request.user)
        sid = self.request.query_params.get("schema")
        q = self.request.query_params.get("q")
        if sid:
            qs = qs.filter(schema_id=sid)
        if q:
            qs = qs.filter(name__icontains=q)
        return qs


class SchemaSyncView(APIView):
    """Desktop pushes cached schema metadata (names/types only, never row data)."""

    @transaction.atomic
    def post(self, request):
        s = SchemaSyncSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        conn = s.validated_data["connection"]
        if conn.owner_id != request.user.id:
            raise PermissionDenied()
        schema, _ = DatabaseSchema.objects.get_or_create(connection=conn, name=s.validated_data["schema"])
        schema.tables.all().delete()
        for t in s.validated_data["tables"]:
            table = DatabaseTable.objects.create(
                schema=schema, name=str(t.get("name", ""))[:190], kind=str(t.get("kind", "table"))[:10],
                row_estimate=int(t.get("row_estimate") or 0), comment=str(t.get("comment", ""))[:500],
            )
            DatabaseColumn.objects.bulk_create(
                DatabaseColumn(
                    table=table, name=str(c.get("name", ""))[:190], data_type=str(c.get("data_type", ""))[:120],
                    nullable=bool(c.get("nullable", True)), key=str(c.get("key", ""))[:10],
                    default=None if c.get("default") is None else str(c["default"])[:500],
                    extra=str(c.get("extra", ""))[:120], comment=str(c.get("comment", ""))[:500], position=i,
                )
                for i, c in enumerate(t.get("columns", []))
            )
        return Response({"schema": schema.id, "tables": len(s.validated_data["tables"])}, status=201)


class QueryAnalyseView(APIView):
    """POST {sql} -> safety verdict. Never executes SQL; execution happens in the desktop app."""

    def post(self, request):
        s = QueryAnalyseSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(analyse(s.validated_data["sql"]))
