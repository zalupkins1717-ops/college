import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

if __package__:
    from . import app
else:
    import app


class HistoryAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        base = Path(cls.tmp.name)
        cls.db_file = base / "private" / "history.sqlite3"
        cls.dist = base / "dist"
        cls.dist.mkdir()
        (cls.dist / "index.html").write_text('<html><head><script type="module" src="test.js"></script></head></html>')
        (cls.dist / "test.js").write_text("export const ready = true")
        cls.silent = patch.object(app.Handler, "log_message", lambda *ignored: None)
        cls.silent.start()
        cls.start_server()

    @classmethod
    def start_server(cls):
        cls.server = app.make_server(cls.db_file, cls.dist, 0)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()

    @classmethod
    def stop_server(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join()

    @classmethod
    def tearDownClass(cls):
        cls.stop_server()
        cls.silent.stop()
        cls.tmp.cleanup()

    def call(self, method, path, cookie=None, data=None, **headers):
        port = self.server.server_address[1]
        if cookie:
            headers["Cookie"] = cookie
        if method in {"POST", "DELETE"}:
            headers.setdefault("Origin", f"http://127.0.0.1:{port}")
        if data is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(data).encode()
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        try:
            connection.request(method, path, data, headers)
            response = connection.getresponse()
            return response.status, response.read(), response.headers
        finally:
            connection.close()

    def session(self):
        status, _, headers = self.call("GET", "/api/session")
        self.assertEqual(status, 204)
        cookie = headers["Set-Cookie"]
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Strict", cookie)
        return cookie.split(";", 1)[0]

    def entry(self, key="partial"):
        return {"calculatorId": key, "inputs": {"expression": "x^2*y + sin(z)", "axis": "x"},
                "title": "Частная производная", "summary": "∂f/∂x ≈ 12", "unit": "",
                "details": ["x = 2, y = 3, z = 0"], "numericalResult": {"value": 12}}

    def rows(self, cookie):
        status, data, _ = self.call("GET", "/api/history", cookie)
        self.assertEqual(status, 200)
        return json.loads(data)

    def test_records_survive_restart(self):
        cookie = self.session()
        graph = self.entry("plot")
        graph["numericalResult"] = {"segments": [[{"x": -1, "y": 3}], [{"x": 0.5, "y": 2}]]}
        self.assertEqual(self.call("POST", "/api/history", cookie, graph)[0], 201)
        self.stop_server()
        self.start_server()
        rows = self.rows(cookie)
        self.assertEqual(len(rows), 1)
        self.assertEqual({k: rows[0][k] for k in graph}, graph)
        self.assertIn("createdAt", rows[0])

    def test_isolation_delete_and_clear(self):
        a, b = self.session(), self.session()
        self.assertNotEqual(a, b)
        for cookie in [a, b]:
            self.assertEqual(self.call("POST", "/api/history", cookie, self.entry())[0], 201)
        id_ = self.rows(a)[0]["id"]
        for cookie in [b, b]:
            self.assertEqual(self.call("DELETE", "/api/history/" + id_, cookie)[0], 204)
        self.assertEqual(self.rows(a)[0]["id"], id_)
        self.assertEqual(self.call("DELETE", "/api/history", b)[0], 204)
        self.assertEqual(self.rows(b), [])
        self.assertEqual(self.call("DELETE", "/api/history/" + id_, a)[0], 204)
        self.assertEqual(self.rows(a), [])

    def test_retains_latest_fifty(self):
        cookie = self.session()
        for number in range(52):
            entry = self.entry()
            entry["inputs"]["x"] = str(number)
            self.assertEqual(self.call("POST", "/api/history", cookie, entry)[0], 201)
        self.assertEqual([int(r["inputs"]["x"]) for r in self.rows(cookie)], list(range(51, 1, -1)))

    def test_validation_and_required_session(self):
        cookie = self.session()
        self.assertEqual(self.call("GET", "/api/history")[0], 401)
        self.assertEqual(self.call("POST", "/api/history", data=self.entry())[0], 401)
        self.assertEqual(self.call("GET", "/api/history", "mera_session=" + "x" * 43)[0], 401)
        self.assertEqual(self.call("POST", "/api/history", cookie, {"foo": 5})[0], 400)
        invalid = self.entry()
        invalid["numericalResult"] = {"value": float("inf")}
        self.assertEqual(self.call("POST", "/api/history", cookie, invalid)[0], 400)
        self.assertEqual(self.rows(cookie), [])

    def test_static_page_and_api_origin(self):
        status, html, _ = self.call("GET", "/")
        self.assertEqual(status, 200)
        self.assertLess(html.index(app.MARKER.encode()), html.index(b'type="module"'))
        self.assertEqual(self.call("GET", "/test.js")[0], 200)
        self.assertEqual(self.call("GET", "/../private/history.sqlite3")[0], 404)
        self.assertEqual(self.call("GET", "/%2e%2e/private/history.sqlite3")[0], 404)
        cookie = self.session()
        self.assertEqual(self.call("POST", "/api/history", cookie, self.entry(), Origin="https://example.org")[0], 403)
        self.assertEqual(self.call("GET", "/api/history", cookie, Host="example.org")[0], 403)
        self.assertEqual(self.rows(cookie), [])


if __name__ == "__main__":
    unittest.main()
