from django.contrib.auth import get_user_model, password_validation
from rest_framework import serializers

from .models import EditorSettings, TerminalProfile, Theme, UserPreference, UserProfile

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]

    def validate(self, attrs):
        password_validation.validate_password(attrs["password"], User(username=attrs["username"], email=attrs.get("email", "")))
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class UserSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(source="profile.display_name", read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "display_name"]


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ["display_name", "avatar_url", "created_at"]
        read_only_fields = ["created_at"]


class EditorSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = EditorSettings
        exclude = ["id", "user"]

    def validate_font_size(self, v):
        if not 8 <= v <= 48:
            raise serializers.ValidationError("Font size must be between 8 and 48.")
        return v

    def validate_line_height(self, v):
        if not 1.0 <= v <= 2.5:
            raise serializers.ValidationError("Line height must be between 1.0 and 2.5.")
        return v

    def validate_font_weight(self, v):
        if v not in (300, 400, 500, 600, 700):
            raise serializers.ValidationError("Font weight must be 300, 400, 500, 600 or 700.")
        return v


class ThemeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Theme
        fields = ["id", "name", "slug", "mode", "tokens", "is_builtin"]
        read_only_fields = ["is_builtin"]


class TerminalProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = TerminalProfile
        fields = ["id", "name", "shell", "args", "is_default"]


class UserPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserPreference
        fields = ["id", "key", "value"]
