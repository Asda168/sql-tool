from rest_framework import serializers

from .models import QueryHistory, QueryResult, SavedQuery


class OwnedConnectionMixin:
    def validate_connection(self, c):
        if c is not None and c.owner_id != self.context["request"].user.id:
            raise serializers.ValidationError("Unknown connection.")
        return c


class SavedQuerySerializer(OwnedConnectionMixin, serializers.ModelSerializer):
    class Meta:
        model = SavedQuery
        fields = ["id", "title", "sql", "connection", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]


class QueryResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = QueryResult
        fields = ["row_count", "affected_rows", "columns"]


class QueryHistorySerializer(OwnedConnectionMixin, serializers.ModelSerializer):
    result = QueryResultSerializer(required=False)

    class Meta:
        model = QueryHistory
        fields = ["id", "sql", "connection", "database_name", "executed_at", "duration_ms", "status", "error", "result"]

    def create(self, validated_data):
        result = validated_data.pop("result", None)
        h = QueryHistory.objects.create(**validated_data)
        if result:
            QueryResult.objects.create(history=h, **result)
        return h
