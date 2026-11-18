"""
sastry.api: Public registration, decorators, and configuration APIs for django-sastry.

Features:
1. Custom Bulk Actions (@sastry_action, register_action)
2. Model Options (readonly_fields, autocomplete_fields, search_fields) via register_model_options or @sastry_options
3. Centralized settings.SASTRY_CONFIG support
"""
from typing import Callable, Dict, List, Optional, Any, Union
from functools import wraps
from django.conf import settings
from django.apps import apps


_ACTION_REGISTRY: Dict[str, Dict[str, Any]] = {}
_MODEL_OPTIONS: Dict[str, Dict[str, Any]] = {}


def _normalize_model_key(model_or_str: Any) -> str:
    """Normalize model class, string 'app.Model', or 'app_Model' into canonical 'app_label.model_name_lower'."""
    if isinstance(model_or_str, str):
        if "." in model_or_str:
            app, mdl = model_or_str.split(".", 1)
        elif "_" in model_or_str:
            app, mdl = model_or_str.split("_", 1)
        else:
            return model_or_str.lower()
        return f"{app.lower()}.{mdl.lower()}"
    if hasattr(model_or_str, "_meta"):
        return f"{model_or_str._meta.app_label.lower()}.{model_or_str._meta.model_name.lower()}"
    return str(model_or_str).lower()


def register_model_options(
    model: Any,
    readonly_fields: Optional[List[str]] = None,
    autocomplete_fields: Optional[List[str]] = None,
    search_fields: Optional[List[str]] = None,
    actions: Optional[List[Callable]] = None,
):
    """
    Register configuration options for a model in Sastry.

    Example:
        register_model_options(
            'customer.Customer',
            readonly_fields=['created_at', 'updated_at', 'balance'],
            autocomplete_fields=['parent_account'],
            search_fields=['name', 'email', 'phone']
        )
    """
    key = _normalize_model_key(model)
    opts = _MODEL_OPTIONS.setdefault(key, {})
    if readonly_fields is not None:
        opts["readonly_fields"] = list(readonly_fields)
    if autocomplete_fields is not None:
        opts["autocomplete_fields"] = list(autocomplete_fields)
    if search_fields is not None:
        opts["search_fields"] = list(search_fields)
    if actions:
        for act in actions:
            register_action(model, act)


def sastry_options(
    readonly_fields: Optional[List[str]] = None,
    autocomplete_fields: Optional[List[str]] = None,
    search_fields: Optional[List[str]] = None,
    actions: Optional[List[Callable]] = None,
):
    """Class decorator to register Sastry options directly on a Django Model class."""
    def decorator(cls):
        register_model_options(
            cls,
            readonly_fields=readonly_fields,
            autocomplete_fields=autocomplete_fields,
            search_fields=search_fields,
            actions=actions,
        )
        return cls
    return decorator


def register_action(
    model: Any,
    func: Callable,
    name: Optional[str] = None,
    description: Optional[str] = None,
):
    """
    Register a custom action function to run on a model in Sastry.

    The action function signature:
        def my_action(request, queryset) -> dict: ...

    Return dict can contain:
        {"success": True, "message": "Done!", ...}
    """
    key = _normalize_model_key(model)
    act_name = name or getattr(func, "name", None) or func.__name__
    act_desc = description or getattr(func, "description", None) or act_name.replace("_", " ").title()

    model_actions = _ACTION_REGISTRY.setdefault(key, {})
    model_actions[act_name] = {
        "name": act_name,
        "description": act_desc,
        "func": func,
    }


def sastry_action(
    model: Optional[Any] = None,
    name: Optional[str] = None,
    description: Optional[str] = None,
):
    """
    Decorator for defining Sastry bulk actions.

    Can be used with or without model:

    @sastry_action(model='sales.Order', description="Mark Shipped")
    def mark_shipped(request, queryset):
        queryset.update(status='SHIPPED')
        return {"success": True, "message": "Marked orders as shipped."}
    """
    def decorator(func):
        func.name = name or func.__name__
        func.description = description or func.name.replace("_", " ").title()
        if model is not None:
            register_action(model, func, name=func.name, description=func.description)
        return func
    return decorator


def get_model_options(app_label: str, model_name: str) -> Dict[str, Any]:
    """Retrieve combined model options from explicit registration and settings.SASTRY_CONFIG."""
    key = f"{app_label.lower()}.{model_name.lower()}"
    opts = dict(_MODEL_OPTIONS.get(key, {}))

    # Check settings.SASTRY_CONFIG fallback
    cfg = getattr(settings, "SASTRY_CONFIG", {}) if settings.configured else {}
    # Match both 'app.model' and 'app.Model' or 'app_model'
    matched_cfg = None
    if isinstance(cfg, dict):
        for k, v in cfg.items():
            if _normalize_model_key(k) == key:
                matched_cfg = v
                break

    if isinstance(matched_cfg, dict):
        for k, v in matched_cfg.items():
            if k not in opts:
                opts[k] = v
            elif isinstance(opts[k], list) and isinstance(v, list):
                # Union of list settings
                opts[k] = list(dict.fromkeys(opts[k] + v))

    return opts


def get_model_actions(app_label: str, model_name: str) -> List[Dict[str, str]]:
    """Return list of action metadata ({'name': ..., 'description': ...}) for a model."""
    key = f"{app_label.lower()}.{model_name.lower()}"
    actions = []
    # Model-specific actions
    for act_name, act_meta in _ACTION_REGISTRY.get(key, {}).items():
        actions.append({"name": act_meta["name"], "description": act_meta["description"]})
    # Global actions (registered with "*")
    for act_name, act_meta in _ACTION_REGISTRY.get("*", {}).items():
        if not any(a["name"] == act_name for a in actions):
            actions.append({"name": act_meta["name"], "description": act_meta["description"]})
    return actions


def get_action_func(app_label: str, model_name: str, action_name: str) -> Optional[Callable]:
    """Resolve action function by model and action name."""
    key = f"{app_label.lower()}.{model_name.lower()}"
    if key in _ACTION_REGISTRY and action_name in _ACTION_REGISTRY[key]:
        return _ACTION_REGISTRY[key][action_name]["func"]
    if "*" in _ACTION_REGISTRY and action_name in _ACTION_REGISTRY["*"]:
        return _ACTION_REGISTRY["*"][action_name]["func"]
    return None
