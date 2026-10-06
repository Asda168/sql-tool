from django.contrib import admin

from .models import DatabaseColumn, DatabaseConnection, DatabaseSchema, DatabaseTable

for m in (DatabaseConnection, DatabaseSchema, DatabaseTable, DatabaseColumn):
    admin.site.register(m)
