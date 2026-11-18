"""Sastry - Lightweight Dynamic CRUD, Native Multi-Tenant Architecture & Interactive Visual ER Diagram for Django."""

__version__ = "2.1.0"
default_app_config = "sastry.apps.SastryConfig"

from sastry.api import (
    register_action,
    sastry_action,
    register_model_options,
    sastry_options,
    get_model_options,
    get_model_actions,
)

__all__ = [
    "__version__",
    "register_action",
    "sastry_action",
    "register_model_options",
    "sastry_options",
    "get_model_options",
    "get_model_actions",
]
