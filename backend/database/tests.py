from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .sqlsafety import analyse, classify, split_statements


class SqlSafetyTests(APITestCase):
    def test_split_ignores_semicolons_in_strings_and_comments(self):
        sql = "SELECT 'a;b'; -- c;d\nSELECT 2 /* ; */; # x;\nSELECT `t;`"
        self.assertEqual(len(split_statements(sql)), 3)

    def test_classification(self):
        self.assertTrue(classify("DELETE FROM users").destructive)
        self.assertFalse(classify("DELETE FROM users WHERE id = 1").destructive)
        self.assertTrue(classify("UPDATE users SET a=1").destructive)
        self.assertFalse(classify("UPDATE users SET a=1 WHERE id=2").destructive)
        self.assertTrue(classify("drop table x").destructive)
        self.assertTrue(classify("TRUNCATE x").destructive)
        self.assertTrue(classify("ALTER TABLE x ADD y INT").destructive)
        self.assertFalse(classify("SELECT * FROM t").destructive)

    def test_where_inside_string_does_not_count(self):
        self.assertTrue(classify("DELETE FROM t /* WHERE */").destructive)
        self.assertTrue(classify("UPDATE t SET note = 'where x'").destructive)

    def test_analyse(self):
        r = analyse("SELECT 1; DROP TABLE t")
        self.assertTrue(r["requires_confirmation"])
        self.assertFalse(r["read_only"])
        self.assertTrue(analyse("SELECT 1")["read_only"])


class ConnectionApiTests(APITestCase):
    def setUp(self):
        U = get_user_model()
        self.u = U.objects.create_user("a", password="pw-Str0ng!x")
        self.other = U.objects.create_user("b", password="pw-Str0ng!x")
        self.client.force_authenticate(self.u)

    def test_password_rejected(self):
        r = self.client.post("/api/database/connections/", {"name": "x", "username": "root", "password": "hunter2"})
        self.assertEqual(r.status_code, 400)
        self.assertIn("password", r.json())

    def test_isolation(self):
        r = self.client.post("/api/database/connections/", {"name": "x", "username": "root"})
        self.assertEqual(r.status_code, 201)
        cid = r.json()["id"]
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f"/api/database/connections/{cid}/").status_code, 404)
        self.assertEqual(self.client.get("/api/database/connections/").json()["count"], 0)

    def test_query_endpoint_analyses_only(self):
        r = self.client.post("/api/database/query/", {"sql": "DELETE FROM users"})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["requires_confirmation"])
