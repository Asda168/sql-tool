from django.conf import settings
from django.db import models

from database.models import DatabaseConnection


class SavedQuery(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_queries")
    title = models.CharField(max_length=200)
    sql = models.TextField()
    connection = models.ForeignKey(DatabaseConnection, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]


class QueryHistory(models.Model):
    STATUSES = [("success", "Success"), ("error", "Error"), ("cancelled", "Cancelled")]
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="query_history")
    sql = models.TextField()
    connection = models.ForeignKey(DatabaseConnection, null=True, blank=True, on_delete=models.SET_NULL)
    database_name = models.CharField(max_length=120, blank=True)
    executed_at = models.DateTimeField()
    duration_ms = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=10, choices=STATUSES, default="success")
    error = models.TextField(blank=True)

    class Meta:
        ordering = ["-executed_at"]
        verbose_name_plural = "query history"


class QueryResult(models.Model):
    """Summary of a result set. Row data is deliberately not stored server-side."""

    history = models.OneToOneField(QueryHistory, on_delete=models.CASCADE, related_name="result")
    row_count = models.BigIntegerField(default=0)
    affected_rows = models.BigIntegerField(default=0)
    columns = models.JSONField(default=list, blank=True)
