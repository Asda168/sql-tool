from django.contrib import admin

from .models import QueryHistory, QueryResult, SavedQuery

for m in (SavedQuery, QueryHistory, QueryResult):
    admin.site.register(m)
