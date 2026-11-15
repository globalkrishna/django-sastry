import logging
from django.conf import settings
from django.apps import apps
from django.db.models import Q

logger = logging.getLogger(__name__)


class TenantManager:
    """
    First-class Multi-Tenant Engine for django-sastry.

    Provides automatic row-level data scoping, model access filtering,
    auto-stamping of tenant foreign keys on creation, and safe ownership
    validation for multi-tenant applications (multi-store retail, ERPs, franchises).
    """

    def __init__(self):
        self.config = getattr(settings, "SASTRY_MULTI_TENANT", {})
        self.enabled = bool(self.config.get("ENABLED", False))
        self.request_attrs = self.config.get(
            "TENANT_REQUEST_ATTRS", ["store", "tenant", "organization", "company"]
        )
        self.model_fields = self.config.get(
            "TENANT_MODEL_FIELDS", ["store", "tenant", "organization", "company"]
        )
        self.permission_mode = self.config.get("PERMISSION_MODE", "staff_with_tenant")
        self.allowed_models = self.config.get("ALLOWED_MODELS", None)
        self.excluded_models = set(
            self.config.get(
                "EXCLUDED_MODELS",
                ["admin.*", "sessions.*", "contenttypes.*", "auth.Permission"],
            )
        )
        self.auto_stamp = self.config.get("AUTO_STAMP_ON_CREATE", True)
        self.resolver_func = self._load_callable(self.config.get("RESOLVER", None))

    def _load_callable(self, target):
        if not target:
            return None
        if callable(target):
            return target
        if isinstance(target, str):
            try:
                from django.utils.module_loading import import_string
                return import_string(target)
            except Exception as e:
                logger.error(f"[Sastry Tenant] Failed to import callable '{target}': {e}")
        return None

    def is_enabled(self):
        return self.enabled

    def resolve_tenant(self, request):
        """
        Resolve the active tenant/store instance from request context.
        Checks custom resolver first, then standard request attributes.
        """
        if not self.enabled or not request:
            return None

        # 1. Custom resolver function if configured
        if self.resolver_func:
            try:
                tenant_obj = self.resolver_func(request)
                if tenant_obj:
                    return tenant_obj
            except Exception as e:
                logger.warning(f"[Sastry Tenant] Custom resolver failed: {e}")

        # 2. Check canonical request attributes
        for attr in self.request_attrs:
            val = getattr(request, attr, None)
            if val:
                return val

        # 3. Check fallback utils (e.g. apps.tenants.utils.get_request_store)
        try:
            from apps.tenants.utils import get_request_store
            return get_request_store(request, allow_fallback=True)
        except Exception:
            pass

        return None

    def is_authorized(self, request):
        """
        Determine if the user is authorized to access Sastry.
        - Superusers always have full access.
        - In multi-tenant mode, authenticated staff/managers with an active tenant are granted access.
        """
        if not request or not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        if not self.enabled:
            return bool(getattr(request.user, "is_admin", False) or getattr(request.user, "is_staff", False))

        # Multi-tenant mode
        if self.permission_mode == "superuser_only":
            return False

        if self.permission_mode == "staff_with_tenant":
            tenant = self.resolve_tenant(request)
            if tenant is not None:
                return True
            return bool(getattr(request.user, "is_admin", False) or getattr(request.user, "is_staff", False))

        # Custom permission callable
        custom_perm = self._load_callable(self.permission_mode)
        if custom_perm:
            return bool(custom_perm(request))

        return False

    def is_model_allowed(self, request, app_label, model_name):
        """
        Check if a specific model can be accessed by the requesting user.
        Superusers have unrestricted access.
        Non-superusers are checked against ALLOWED_MODELS and EXCLUDED_MODELS.
        """
        if not self.enabled or (request and request.user and request.user.is_superuser):
            return True

        full_name = f"{app_label}.{model_name}".lower()
        wildcard_app = f"{app_label}.*".lower()

        # Check blacklisted/excluded models
        for pattern in self.excluded_models:
            pat_lower = pattern.lower()
            if pat_lower in (full_name, wildcard_app):
                return False

        # Check whitelist if configured
        if self.allowed_models is not None:
            if callable(self.allowed_models):
                models_dict = self.allowed_models(request)
            elif isinstance(self.allowed_models, str):
                fn = self._load_callable(self.allowed_models)
                models_dict = fn(request) if fn else {}
            else:
                models_dict = self.allowed_models

            if isinstance(models_dict, dict):
                app_allowed = models_dict.get(app_label)
                if app_allowed == "*":
                    return True
                if isinstance(app_allowed, (list, tuple, set)):
                    return model_name in app_allowed
                return False

        return True

    def get_allowed_models_dict(self, request):
        """
        Return {app_label: [model_names]} accessible to the current user for Sastry navigation.
        """
        is_super = bool(request and request.user and request.user.is_superuser)
        mdd = {}

        if not self.enabled or is_super:
            for m in apps.get_models():
                lbl = m._meta.app_label
                if lbl in ["admin", "contenttypes", "sessions"]:
                    continue
                if lbl not in mdd:
                    mdd[lbl] = []
                mdd[lbl].append(m.__name__)
            return {k: sorted(v) for k, v in sorted(mdd.items())}

        # Multi-tenant user: evaluate whitelist or filter models
        if self.allowed_models is not None:
            raw = self.allowed_models
            if callable(raw):
                models_dict = raw(request)
            elif isinstance(raw, str):
                fn = self._load_callable(raw)
                models_dict = fn(request) if fn else {}
            else:
                models_dict = raw

            if isinstance(models_dict, dict):
                for app_label, names in models_dict.items():
                    valid = []
                    if names == "*":
                        try:
                            app_config = apps.get_app_config(app_label)
                            valid = [m.__name__ for m in app_config.get_models() if self.is_model_allowed(request, app_label, m.__name__)]
                        except LookupError:
                            pass
                    elif isinstance(names, (list, tuple, set)):
                        for n in names:
                            try:
                                if apps.get_model(app_label, n) and self.is_model_allowed(request, app_label, n):
                                    valid.append(n)
                            except LookupError:
                                pass
                    if valid:
                        mdd[app_label] = sorted(valid)
                return {k: sorted(v) for k, v in sorted(mdd.items())}

        # Fallback: scan models and filter using is_model_allowed
        for m in apps.get_models():
            lbl = m._meta.app_label
            name = m.__name__
            if self.is_model_allowed(request, lbl, name):
                if lbl not in mdd:
                    mdd[lbl] = []
                mdd[lbl].append(name)

        return {k: sorted(v) for k, v in sorted(mdd.items())}

    def scope_query_filter(self, request, model_cls, fltr):
        """
        Inject tenant scoping into query filter dictionary for getData.
        """
        if not self.enabled or not request or (request.user and request.user.is_superuser):
            return fltr

        tenant_obj = self.resolve_tenant(request)
        if not tenant_obj:
            return fltr

        field_names = [f.name for f in model_cls._meta.fields]

        # Match tenant model fields in priority order
        for fld in self.model_fields:
            if fld in field_names:
                fld_id = f"{fld}_id"
                if fld_id not in fltr and fld not in fltr:
                    # Check if tenant_obj matches the field type or has a parent tenant
                    if hasattr(tenant_obj, "id"):
                        fltr[fld_id] = tenant_obj.id
                        break
            # Also support parent tenant traversal (e.g. store.tenant)
            elif fld == "tenant" and "tenant" in field_names and hasattr(tenant_obj, "tenant") and tenant_obj.tenant:
                if "tenant_id" not in fltr and "tenant" not in fltr:
                    fltr["tenant_id"] = tenant_obj.tenant.id
                    break

        return fltr

    def scope_form_queryset(self, request, field, rows=None, max_limit=1000):
        """
        Filter choices on related foreign key fields in forms to the active tenant.
        """
        if not hasattr(field, "queryset") or field.queryset is None:
            return field

        if not self.enabled or not request or (request.user and request.user.is_superuser):
            return field

        tenant_obj = self.resolve_tenant(request)
        if not tenant_obj:
            return field

        try:
            target_model = field.queryset.model
            target_fields = [f.name for f in target_model._meta.fields]

            for fld in self.model_fields:
                if fld in target_fields:
                    field.queryset = field.queryset.filter(**{fld: tenant_obj})
                    break
                elif fld == "tenant" and "tenant" in target_fields and hasattr(tenant_obj, "tenant") and tenant_obj.tenant:
                    field.queryset = field.queryset.filter(tenant=tenant_obj.tenant)
                    break
        except Exception as e:
            logger.debug(f"[Sastry Tenant] FK queryset scoping ignored: {e}")

        return field

    def validate_and_stamp_instance(self, request, instance, is_created=False):
        """
        Enforce tenant ownership:
        - For updates: ensure record belongs to the active tenant.
        - For creations: automatically assign the active tenant foreign key.
        """
        if not self.enabled or not request or (request.user and request.user.is_superuser):
            return True

        tenant_obj = self.resolve_tenant(request)
        if not tenant_obj:
            return True

        field_names = [f.name for f in instance._meta.fields]

        for fld in self.model_fields:
            fld_id = f"{fld}_id"
            if fld in field_names:
                if is_created and self.auto_stamp:
                    if not getattr(instance, fld_id, None):
                        setattr(instance, fld, tenant_obj)
                        return True
                else:
                    # Update/Delete validation
                    rec_tenant_id = getattr(instance, fld_id, None)
                    if rec_tenant_id and rec_tenant_id != getattr(tenant_obj, "id", None):
                        return False
            # Check parent tenant field
            elif fld == "tenant" and "tenant" in field_names and hasattr(tenant_obj, "tenant") and tenant_obj.tenant:
                if is_created and self.auto_stamp:
                    if not getattr(instance, "tenant_id", None):
                        instance.tenant = tenant_obj.tenant
                        return True
                else:
                    rec_tenant_id = getattr(instance, "tenant_id", None)
                    if rec_tenant_id and rec_tenant_id != tenant_obj.tenant.id:
                        return False

        return True


# Global default tenant manager instance
tenant_manager = TenantManager()

