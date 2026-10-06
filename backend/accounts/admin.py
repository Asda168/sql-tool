from django.contrib import admin

from .models import EditorSettings, TerminalProfile, Theme, UserPreference, UserProfile

for m in (UserProfile, EditorSettings, TerminalProfile, Theme, UserPreference):
    admin.site.register(m)
