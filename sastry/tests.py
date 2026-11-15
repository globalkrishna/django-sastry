"""Unit and Integration Tests for Sastry App & ER Diagram."""

from django.test import SimpleTestCase, TestCase, RequestFactory
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from sastry.dbadmin import (
    map_internal_field_type,
    get_model_table_prop,
    get_model_relations_data,
    er_schema_api,
    save_uploaded_file,
)
from django.core.files.base import ContentFile
import json


class SastryIntrospectionTests(SimpleTestCase):
    """Test model and field introspection routines without database hits."""

    def test_map_internal_field_type(self):
        User = get_user_model()
        id_field = User._meta.get_field("id")
        self.assertEqual(map_internal_field_type(id_field), "PrimaryKey")

        username_field = User._meta.get_field(User.USERNAME_FIELD)
        self.assertIn(map_internal_field_type(username_field), ["Text", "Email"])

    def test_get_model_relations_data(self):
        User = get_user_model()
        data = get_model_relations_data(User._meta.app_label, User.__name__)

        self.assertIn("main_table", data)
        self.assertIn("lvt", data)
        self.assertIn("foreign", data)
        self.assertIn("has_many", data)

        lvt = data["lvt"]
        self.assertIn("FieldSeq", lvt)
        self.assertIn("id", lvt["FieldSeq"])
        self.assertEqual(lvt["id"]["ColumnType"], "PrimaryKey")

    def test_get_model_table_prop(self):
        prop = get_model_table_prop(ContentType)
        self.assertIn("FieldSeq", prop)
        self.assertIn("app_label", prop)
        self.assertIn("model", prop)

    def test_save_uploaded_file_fallback(self):
        from django.core.files.storage import default_storage

        User = get_user_model()
        dummy_user = User(pk=999)
        test_content = ContentFile(b"test file content", name="test.txt")
        saved_name = save_uploaded_file(dummy_user, test_content)
        try:
            self.assertTrue(bool(saved_name))
        finally:
            if saved_name and default_storage.exists(saved_name):
                default_storage.delete(saved_name)


class SastryApiTests(TestCase):
    """Test HTTP API endpoints for ER Diagram."""

    def setUp(self):
        self.factory = RequestFactory()
        User = get_user_model()
        self.admin_user = User.objects.create_superuser(
            username="sastry_admin",
            email="admin@example.com",
            password="testpassword123",
        )

    def test_er_schema_api_success(self):
        request = self.factory.get("/sastry/er/api/contenttypes/ContentType/")
        request.user = self.admin_user
        response = er_schema_api(request, "contenttypes", "ContentType")

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(data["main_table"], "contenttypes.ContentType")
        self.assertIn("app_label", data["lvt"]["FieldSeq"])

    def test_er_schema_api_not_found(self):
        request = self.factory.get("/sastry/er/api/nonexistent/FakeModel/")
        request.user = self.admin_user
        response = er_schema_api(request, "nonexistent", "FakeModel")
        self.assertEqual(response.status_code, 404)


class SastryTenantTests(SimpleTestCase):
    """Test Multi-Tenant Engine isolation, access control, and query scoping."""

    def setUp(self):
        self.factory = RequestFactory()
        User = get_user_model()
        self.regular_user = User(username="staff_user", is_superuser=False)
        self.super_user = User(username="super_user", is_superuser=True)

    def test_tenant_manager_disabled_by_default(self):
        from sastry.tenant import TenantManager
        tm = TenantManager()
        # Without SASTRY_MULTI_TENANT['ENABLED'] = True, should operate in standard mode
        request = self.factory.get("/sastry/")
        request.user = self.super_user
        self.assertTrue(tm.is_authorized(request))

    def test_tenant_model_whitelist_filtering(self):
        from sastry.tenant import TenantManager
        tm = TenantManager()
        tm.enabled = True
        tm.allowed_models = {"auth": ["User"]}
        tm.excluded_models = {"sessions.*", "admin.*"}

        request = self.factory.get("/sastry/")
        request.user = self.regular_user

        self.assertTrue(tm.is_model_allowed(request, "auth", "User"))
        self.assertFalse(tm.is_model_allowed(request, "auth", "Group"))
        self.assertFalse(tm.is_model_allowed(request, "sessions", "Session"))

        # Superuser bypasses model whitelist
        request.user = self.super_user
        self.assertTrue(tm.is_model_allowed(request, "sessions", "Session"))

    def test_scope_query_filter_injection(self):
        from sastry.tenant import TenantManager
        tm = TenantManager()
        tm.enabled = True
        tm.model_fields = ["store", "tenant"]

        class DummyTenant:
            id = 42

        request = self.factory.get("/sastry/")
        request.user = self.regular_user
        request.store = DummyTenant()

        # Dummy model mock with 'store' field
        class DummyField:
            def __init__(self, name):
                self.name = name

        class DummyModel:
            class _meta:
                fields = [DummyField("id"), DummyField("name"), DummyField("store")]

        filter_dict = tm.scope_query_filter(request, DummyModel, {"is_active": True})
        self.assertEqual(filter_dict.get("store_id"), 42)
        self.assertEqual(filter_dict.get("is_active"), True)

