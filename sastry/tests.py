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

    def test_get_model_relations_data_many_to_many(self):
        from django.contrib.auth.models import Group
        data = get_model_relations_data("auth", "Group")
        lvt = data["lvt"]
        self.assertIn("permissions", lvt["FieldSeq"])
        self.assertEqual(lvt["permissions"]["ColumnType"], "ManyToManyField")
        self.assertEqual(lvt["permissions"]["kind"], "auth.Permission")

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


class SastryManyToManyTests(TestCase):
    """Test ManyToMany field serialization, retrieval, and persistence."""

    def setUp(self):
        self.factory = RequestFactory()
        User = get_user_model()
        self.admin_user = User.objects.create_superuser(
            username="m2m_admin",
            email="m2m@example.com",
            password="testpassword123",
        )
        from django.contrib.auth.models import Group, Permission
        self.group = Group.objects.create(name="Editors")
        self.perms = list(Permission.objects.all()[:3])
        self.group.permissions.set(self.perms)

    def test_mdlDict_serializes_many_to_many(self):
        from sastry.dbadmin import mdlDict
        data = mdlDict(self.group)
        self.assertIn("permissions", data)
        self.assertIsInstance(data["permissions"], list)
        expected_pks = [p.pk for p in self.perms]
        self.assertEqual(sorted(data["permissions"]), sorted(expected_pks))

    def test_mdl_post_updates_many_to_many(self):
        from sastry.dbadmin import mdl_post
        from django.contrib.auth.models import Permission

        new_perms = list(Permission.objects.all()[3:5])
        new_perm_pks = [p.pk for p in new_perms]

        payload = {
            str(self.group.pk): {
                "name": "Super Editors",
                "permissions": new_perm_pks,
            }
        }
        request = self.factory.post(
            "/sastry/auth/Group/",
            {"record_list": json.dumps(payload)},
        )
        request.user = self.admin_user
        response = mdl_post(request, "auth", "Group")
        self.assertEqual(response.status_code, 200)

        self.group.refresh_from_db()
        self.assertEqual(self.group.name, "Super Editors")
        current_perms = list(self.group.permissions.values_list("pk", flat=True))
        self.assertEqual(sorted(current_perms), sorted(new_perm_pks))

    def test_mdl_post_creates_with_many_to_many(self):
        from sastry.dbadmin import mdl_post
        from django.contrib.auth.models import Group, Permission

        test_perms = list(Permission.objects.all()[:2])
        test_perm_pks = [p.pk for p in test_perms]

        payload = {
            "new1": {
                "name": "Reviewers",
                "permissions": test_perm_pks,
            }
        }
        request = self.factory.post(
            "/sastry/auth/Group/",
            {"record_list": json.dumps(payload)},
        )
        request.user = self.admin_user
        response = mdl_post(request, "auth", "Group")
        self.assertEqual(response.status_code, 200)

        created_group = Group.objects.get(name="Reviewers")
        assigned_perms = list(created_group.permissions.values_list("pk", flat=True))
        self.assertEqual(sorted(assigned_perms), sorted(test_perm_pks))


class SastryModelOptionsAndActionApiTests(TestCase):
    """Tests for Sastry model configuration options, readonly protection, autocomplete, and custom actions."""

    def setUp(self):
        self.factory = RequestFactory()
        User = get_user_model()
        self.admin_user = User.objects.create_superuser(
            username="api_admin",
            email="api_admin@example.com",
            password="testpassword123",
        )

    def test_register_model_options_and_retrieval(self):
        from sastry.api import register_model_options, get_model_options

        register_model_options(
            "auth.User",
            readonly_fields=["date_joined", "last_login"],
            autocomplete_fields=["groups"],
            search_fields=["username", "email"],
        )

        opts = get_model_options("auth", "User")
        self.assertIn("date_joined", opts["readonly_fields"])
        self.assertIn("last_login", opts["readonly_fields"])
        self.assertIn("groups", opts["autocomplete_fields"])
        self.assertIn("username", opts["search_fields"])

    def test_sastry_action_registration_and_execution(self):
        from sastry.api import sastry_action, get_model_actions, register_action
        from sastry.dbadmin import model_action_api
        from django.contrib.auth.models import Group

        g1 = Group.objects.create(name="Alpha")
        g2 = Group.objects.create(name="Beta")

        @sastry_action(model="auth.Group", description="Prefix Groups with Tag")
        def prefix_groups(request, queryset):
            count = 0
            for g in queryset:
                g.name = f"TAG_{g.name}"
                g.save()
                count += 1
            return {"success": True, "message": f"Updated {count} groups."}

        actions = get_model_actions("auth", "Group")
        action_names = [a["name"] for a in actions]
        self.assertIn("prefix_groups", action_names)

        # Execute action via API
        request = self.factory.post(
            "/sastry/action/auth/Group/prefix_groups/",
            {"pks": json.dumps([g1.pk, g2.pk])},
        )
        request.user = self.admin_user
        response = model_action_api(request, "auth", "Group", "prefix_groups")
        self.assertEqual(response.status_code, 200)
        res_data = json.loads(response.content)
        self.assertTrue(res_data["success"])
        self.assertIn("Updated 2 groups", res_data["message"])

        g1.refresh_from_db()
        g2.refresh_from_db()
        self.assertEqual(g1.name, "TAG_Alpha")
        self.assertEqual(g2.name, "TAG_Beta")

    def test_autocomplete_api_search(self):
        from sastry.dbadmin import autocomplete_api
        from django.contrib.auth.models import Group

        Group.objects.create(name="Accounting Department")
        Group.objects.create(name="Marketing Team")
        Group.objects.create(name="Sales Department")

        request = self.factory.get("/sastry/autocomplete/auth/Group/?q=Department")
        request.user = self.admin_user
        response = autocomplete_api(request, "auth", "Group")
        self.assertEqual(response.status_code, 200)

        data = json.loads(response.content)
        self.assertIn("results", data)
        results = data["results"]
        self.assertEqual(len(results), 2)
        labels = [r["label"] for r in results]
        self.assertIn("Accounting Department", labels)
        self.assertIn("Sales Department", labels)

    def test_readonly_fields_prevent_update_in_mdl_post(self):
        from sastry.api import register_model_options
        from sastry.dbadmin import mdl_post
        from django.contrib.auth.models import Group

        grp = Group.objects.create(name="Protected Name")
        # Register 'name' as readonly for Group
        register_model_options("auth.Group", readonly_fields=["name"])

        # Attempt to tamper with 'name' via POST
        payload = {
            str(grp.pk): {
                "name": "Hacked Name",
            }
        }
        request = self.factory.post(
            "/sastry/auth/Group/",
            {"record_list": json.dumps(payload)},
        )
        request.user = self.admin_user
        response = mdl_post(request, "auth", "Group")
        self.assertEqual(response.status_code, 200)

        # Name should NOT have changed because it's protected by readonly_fields!
        grp.refresh_from_db()
        self.assertEqual(grp.name, "Protected Name")


