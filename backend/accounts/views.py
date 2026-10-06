from django.db.models import Q
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .models import EditorSettings, TerminalProfile, Theme, UserPreference
from .permissions import OwnedModelViewSet
from .serializers import (
    EditorSettingsSerializer,
    RegisterSerializer,
    TerminalProfileSerializer,
    ThemeSerializer,
    UserPreferenceSerializer,
    UserProfileSerializer,
    UserSerializer,
)


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class LoginView(TokenObtainPairView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class RefreshView(TokenRefreshView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        s = UserProfileSerializer(request.user.profile, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(UserSerializer(request.user).data)


class EditorSettingsView(APIView):
    """GET/PUT/PATCH the current user's editor settings (one row per user)."""

    def _obj(self, request):
        return EditorSettings.objects.get_or_create(user=request.user)[0]

    def get(self, request):
        return Response(EditorSettingsSerializer(self._obj(request)).data)

    def put(self, request):
        return self.patch(request)

    def patch(self, request):
        s = EditorSettingsSerializer(self._obj(request), data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)


class ThemeViewSet(OwnedModelViewSet):
    queryset = Theme.objects.all()
    serializer_class = ThemeSerializer

    def get_queryset(self):
        return Theme.objects.filter(Q(owner=self.request.user) | Q(is_builtin=True))

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if obj.is_builtin and request.method not in permissions.SAFE_METHODS:
            self.permission_denied(request, message="Built-in themes are read-only.")


class TerminalProfileViewSet(OwnedModelViewSet):
    queryset = TerminalProfile.objects.all()
    serializer_class = TerminalProfileSerializer


class UserPreferenceViewSet(OwnedModelViewSet):
    queryset = UserPreference.objects.all()
    serializer_class = UserPreferenceSerializer
    owner_field = "user"
