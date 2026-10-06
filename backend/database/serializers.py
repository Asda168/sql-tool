from rest_framework import serializers

from .models import DatabaseColumn, DatabaseConnection, DatabaseSchema, DatabaseTable

SECRET_FIELDS = {"password", "ssh_password", "ssh_private_key", "ssh_key", "passphrase"}


class DatabaseConnectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DatabaseConnection
        fields = [
            "id", "workspace", "name", "group", "environment", "engine", "host", "file_path", "port", "username",
            "default_database", "use_ssl", "ssh_enabled", "ssh_host", "ssh_port", "ssh_user",
            "timeout_seconds", "keychain_ref", "created_at",
        ]
        read_only_fields = ["created_at"]

    def to_internal_value(self, data):
        leaked = SECRET_FIELDS.intersection(data.keys())
        if leaked:
            raise serializers.ValidationError(
                {f: "Secrets are stored in the OS keychain by the desktop app and are never sent to the server." for f in leaked}
            )
        return super().to_internal_value(data)

    def validate_port(self, v):
        if not 1 <= v <= 65535:
            raise serializers.ValidationError("Invalid port.")
        return v


class DatabaseColumnSerializer(serializers.ModelSerializer):
    class Meta:
        model = DatabaseColumn
        exclude = ["table"]


class DatabaseTableSerializer(serializers.ModelSerializer):
    columns = DatabaseColumnSerializer(many=True, read_only=True)
    schema_name = serializers.CharField(source="schema.name", read_only=True)

    class Meta:
        model = DatabaseTable
        fields = ["id", "schema", "schema_name", "name", "kind", "row_estimate", "comment", "columns"]


class DatabaseSchemaSerializer(serializers.ModelSerializer):
    table_count = serializers.IntegerField(source="tables.count", read_only=True)

    class Meta:
        model = DatabaseSchema
        fields = ["id", "connection", "name", "synced_at", "table_count"]


class SchemaSyncSerializer(serializers.Serializer):
    """Payload the desktop app pushes after introspecting a database locally."""

    connection = serializers.PrimaryKeyRelatedField(queryset=DatabaseConnection.objects.all())
    schema = serializers.CharField(max_length=120)
    tables = serializers.ListField(child=serializers.DictField(), max_length=5000)


class QueryAnalyseSerializer(serializers.Serializer):
    sql = serializers.CharField(max_length=2_000_000)
