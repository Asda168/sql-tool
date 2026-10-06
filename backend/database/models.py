from django.conf import settings
from django.db import models

from projects.models import Workspace


class DatabaseConnection(models.Model):
    """Connection *metadata* only.

    Passwords, SSH private keys and passphrases are NEVER stored here. The desktop app keeps
    them in the OS keychain under `keychain_ref`.
    """

    ENVIRONMENTS = [("local", "Local"), ("development", "Development"), ("staging", "Staging"), ("production", "Production")]
    ENGINES = [("mysql", "MySQL"), ("mariadb", "MariaDB"), ("postgres", "PostgreSQL"), ("sqlite", "SQLite"), ("mssql", "SQL Server")]
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="connections")
    workspace = models.ForeignKey(Workspace, null=True, blank=True, on_delete=models.SET_NULL)
    name = models.CharField(max_length=120)
    group = models.CharField(max_length=80, blank=True)
    environment = models.CharField(max_length=12, choices=ENVIRONMENTS, default="local")
    engine = models.CharField(max_length=12, choices=ENGINES, default="mysql")
    host = models.CharField(max_length=255, default="127.0.0.1", blank=True)
    file_path = models.CharField(max_length=500, blank=True, help_text="SQLite database file (local hint)")
    port = models.PositiveIntegerField(default=3306)
    username = models.CharField(max_length=120, blank=True)
    default_database = models.CharField(max_length=120, blank=True)
    use_ssl = models.BooleanField(default=False)
    ssh_enabled = models.BooleanField(default=False)
    ssh_host = models.CharField(max_length=255, blank=True)
    ssh_port = models.PositiveIntegerField(default=22)
    ssh_user = models.CharField(max_length=120, blank=True)
    timeout_seconds = models.PositiveIntegerField(default=10)
    keychain_ref = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["group", "name"]

    def __str__(self):
        return f"{self.name} ({self.environment})"


class DatabaseSchema(models.Model):
    connection = models.ForeignKey(DatabaseConnection, on_delete=models.CASCADE, related_name="schemas")
    name = models.CharField(max_length=120)
    synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("connection", "name")]


class DatabaseTable(models.Model):
    schema = models.ForeignKey(DatabaseSchema, on_delete=models.CASCADE, related_name="tables")
    name = models.CharField(max_length=190)
    kind = models.CharField(max_length=10, default="table")
    row_estimate = models.BigIntegerField(default=0)
    comment = models.CharField(max_length=500, blank=True)

    class Meta:
        unique_together = [("schema", "name")]
        ordering = ["name"]


class DatabaseColumn(models.Model):
    table = models.ForeignKey(DatabaseTable, on_delete=models.CASCADE, related_name="columns")
    name = models.CharField(max_length=190)
    data_type = models.CharField(max_length=120)
    nullable = models.BooleanField(default=True)
    key = models.CharField(max_length=10, blank=True)
    default = models.CharField(max_length=500, blank=True, null=True)
    extra = models.CharField(max_length=120, blank=True)
    comment = models.CharField(max_length=500, blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position"]
