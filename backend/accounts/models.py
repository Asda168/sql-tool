from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    display_name = models.CharField(max_length=120, blank=True)
    avatar_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.display_name or self.user.get_username()


class Theme(models.Model):
    MODES = [("dark", "Dark"), ("light", "Light")]
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE)
    name = models.CharField(max_length=80)
    slug = models.SlugField(max_length=80)
    mode = models.CharField(max_length=5, choices=MODES, default="dark")
    tokens = models.JSONField(default=dict, blank=True)
    is_builtin = models.BooleanField(default=False)

    class Meta:
        unique_together = [("owner", "slug")]

    def __str__(self):
        return self.name


class EditorSettings(models.Model):
    CURSORS = [("line", "Line"), ("block", "Block"), ("underline", "Underline")]
    THEME_MODES = [("dark", "Dark"), ("light", "Light"), ("system", "System")]
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="editor_settings")
    font_family = models.CharField(max_length=120, default="JetBrains Mono")
    font_size = models.PositiveSmallIntegerField(default=14)
    font_weight = models.PositiveSmallIntegerField(default=400)
    line_height = models.FloatField(default=1.5)
    letter_spacing = models.FloatField(default=0)
    ligatures = models.BooleanField(default=True)
    word_wrap = models.BooleanField(default=False)
    minimap = models.BooleanField(default=True)
    breadcrumbs = models.BooleanField(default=True)
    folding = models.BooleanField(default=True)
    cursor_style = models.CharField(max_length=10, choices=CURSORS, default="line")
    tab_size = models.PositiveSmallIntegerField(default=4)
    insert_spaces = models.BooleanField(default=True)
    auto_save = models.BooleanField(default=False)
    theme_mode = models.CharField(max_length=6, choices=THEME_MODES, default="dark")
    theme = models.ForeignKey(Theme, null=True, blank=True, on_delete=models.SET_NULL)
    updated_at = models.DateTimeField(auto_now=True)


class TerminalProfile(models.Model):
    SHELLS = [("git-bash", "Git Bash"), ("powershell", "PowerShell"), ("cmd", "CMD"), ("zsh", "zsh"), ("bash", "bash")]
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="terminal_profiles")
    name = models.CharField(max_length=80)
    shell = models.CharField(max_length=20, choices=SHELLS)
    args = models.JSONField(default=list, blank=True)
    is_default = models.BooleanField(default=False)


class UserPreference(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="preferences")
    key = models.CharField(max_length=120)
    value = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = [("user", "key")]
