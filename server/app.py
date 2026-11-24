"""Serve the built Mera app and its private, per-browser SQLite history."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
from hashlib import sha256
from http import HTTPStatus
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import mimetypes
from pathlib import Path
import re
import secrets
import shutil
import sqlite3
from urllib.parse import unquote, urlsplit
import uuid

ROOT = Path(__file__).resolve().parent.parent
COOKIE = "mera_session"
LIMIT = 50
MAX_BYTES = 4 * 1024 * 1024
MARKER = '<script>window.__MERA_SQLITE__=true</script>'
SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (owner TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS calculations (
    sequence INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    owner TEXT NOT NULL REFERENCES sessions(owner),
    created_at TEXT NOT NULL,
    calculator TEXT NOT NULL,
    title TEXT NOT NULL,
    inputs TEXT NOT NULL,
    summary TEXT NOT NULL,
    details TEXT NOT NULL,
    unit TEXT NOT NULL,
    numerical_result TEXT
);
CREATE INDEX IF NOT EXISTS calculations_owner_sequence ON calculations(owner, sequence);
"""


def encoded(value):
    return json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(",", ":"))


def text(value, limit):
    return isinstance(value, str) and len(value) <= limit and not any(
        "\ud800" <= char <= "\udfff" for char in value
    )


def number(value):
    # JSON also allows long integers, while JavaScript can store only finite doubles.
    return type(value) in (int, float) and abs(value) <= 1.7976931348623157e308 and math.isfinite(value)


def valid_result(result):
    if not isinstance(result, dict) or not result or set(result) - {"segments", "value"}:
        return False
    if "value" in result and not number(result["value"]):
        return False
    if "segments" in result:
        segments = result["segments"]
        if not isinstance(segments, list) or len(segments) > 50000:
            return False
        count = 0
        for line in segments:
            if not isinstance(line, list):
                return False
            count += len(line)
            if count > 50000 or not all(
                isinstance(p, dict) and set(p) == {"x", "y"} and number(p["x"]) and number(p["y"])
                for p in line
            ):
                return False
    return True


def valid_entry(entry):
    required = {"calculatorId", "inputs", "title", "summary", "unit", "details"}
    if not isinstance(entry, dict) or not required <= entry.keys() <= required | {"numericalResult"}:
        return False
    if not all(text(entry[k], limit) for k, limit in [
        ("calculatorId", 80), ("title", 240), ("summary", 4096), ("unit", 80)
    ]) or not entry["calculatorId"] or not entry["title"]:
        return False
    inputs, details = entry["inputs"], entry["details"]
    return (isinstance(inputs, dict) and len(inputs) <= 64
            and all(text(k, 100) and text(v, 4096) for k, v in inputs.items())
            and isinstance(details, list) and len(details) <= 100
            and all(text(v, 4096) for v in details)
            and ("numericalResult" not in entry or valid_result(entry["numericalResult"])))


def connect(path):
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    return db


def session_owner(token):
    return sha256(token.encode("ascii")).hexdigest()


def stored(row):
    entry = {
        "id": row["id"], "createdAt": row["created_at"], "calculatorId": row["calculator"],
        "inputs": json.loads(row["inputs"]), "title": row["title"], "summary": row["summary"],
        "details": json.loads(row["details"]), "unit": row["unit"],
    }
    if row["numerical_result"] is not None:
        entry["numericalResult"] = json.loads(row["numerical_result"])
    return entry


class Handler(BaseHTTPRequestHandler):
    server_version = "Mera/1.0"

    def respond(self, status, body=b"", content_type="application/json; charset=utf-8", cookie=None):
        self.send_response(status)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if status != 204:
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        if body and self.command != "HEAD":
            self.wfile.write(body)

    def fail(self, status):
        self.respond(status, encoded({"error": HTTPStatus(status).phrase}).encode())

    def token(self):
        cookies = SimpleCookie()
        try:
            cookies.load(self.headers.get("Cookie", ""))
        except CookieError:
            return None
        token = cookies[COOKIE].value if COOKIE in cookies else ""
        return token if re.fullmatch(r"[A-Za-z0-9_-]{43}", token) else None

    def session(self, db, owner):
        if owner is not None:
            self.respond(204)
            return
        token = secrets.token_urlsafe(32)
        with db:
            db.execute("INSERT INTO sessions VALUES (?)", (session_owner(token),))
        self.respond(204, cookie=f"{COOKIE}={token}; Path=/api; Max-Age=31536000; HttpOnly; SameSite=Strict")

    def add_entry(self, db, owner):
        if self.headers.get_content_type() != "application/json":
            self.fail(415)
            return
        length = self.headers.get("Content-Length", "")
        if not re.fullmatch(r"[0-9]{1,10}", length):
            self.fail(400)
            return
        if int(length) > MAX_BYTES:
            self.fail(413)
            return
        try:
            entry = json.loads(self.rfile.read(int(length)).decode("utf-8"))
        except (ValueError, RecursionError):
            self.fail(400)
            return
        if not valid_entry(entry):
            self.fail(400)
            return
        now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        with db:
            db.execute("""INSERT INTO calculations
                (id,owner,created_at,calculator,title,inputs,summary,details,unit,numerical_result)
                VALUES (?,?,?,?,?,?,?,?,?,?)""",
                       (str(uuid.uuid4()), owner, now, entry["calculatorId"], entry["title"],
                        encoded(entry["inputs"]), entry["summary"], encoded(entry["details"]), entry["unit"],
                        encoded(entry["numericalResult"]) if "numericalResult" in entry else None))
            db.execute("""DELETE FROM calculations WHERE sequence IN
                (SELECT sequence FROM calculations WHERE owner=? ORDER BY sequence DESC LIMIT -1 OFFSET ?)""",
                       (owner, LIMIT))
        self.respond(201)

    def history(self, path):
        with closing(connect(self.server.database)) as db:
            token = self.token()
            owner = None
            if token:
                digest = session_owner(token)
                if db.execute("SELECT 1 FROM sessions WHERE owner=?", (digest,)).fetchone():
                    owner = digest
            if path == "/api/session" and self.command == "GET":
                self.session(db, owner)
                return
            if owner is None:
                self.fail(401)
                return
            if path == "/api/history":
                if self.command == "GET":
                    rows = db.execute("SELECT * FROM calculations WHERE owner=? ORDER BY sequence DESC", (owner,))
                    self.respond(200, encoded([stored(row) for row in rows]).encode())
                elif self.command == "POST":
                    self.add_entry(db, owner)
                elif self.command == "DELETE":
                    with db:
                        db.execute("DELETE FROM calculations WHERE owner=?", (owner,))
                    self.respond(204)
                else:
                    self.fail(405)
            elif self.command == "DELETE" and path.startswith("/api/history/"):
                try:
                    id_ = str(uuid.UUID(path[len("/api/history/"):]))
                except ValueError:
                    self.fail(400)
                    return
                with db:
                    db.execute("DELETE FROM calculations WHERE id=? AND owner=?", (id_, owner))
                self.respond(204)
            else:
                self.fail(404)

    def static(self, path):
        # Resolve links as well as ".."; only public build artifacts may be served.
        file = (self.server.dist / path.lstrip("/")).resolve()
        if file == self.server.dist:
            file = (file / "index.html").resolve()
        if self.server.dist not in file.parents or not file.is_file():
            self.fail(404)
            return
        if file == self.server.dist / "index.html":
            html = file.read_text(encoding="utf-8").replace("<head>", "<head>" + MARKER, 1)
            self.respond(200, html.encode(), "text/html; charset=utf-8")
            return
        with file.open("rb") as source:
            self.send_response(200)
            mime = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(file.stat().st_size))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            if self.command != "HEAD":
                shutil.copyfileobj(source, self.wfile)

    def dispatch(self):
        host = self.headers.get("Host", "").lower()
        if host not in self.server.allowed_hosts:
            self.fail(403)
            return
        try:
            path = unquote(urlsplit(self.path).path, errors="strict")
            if "\0" in path:
                self.fail(400)
                return
            if path.startswith("/api/"):
                origin = self.headers.get("Origin")
                if ((origin is not None and origin != "http://" + host)
                    or self.headers.get("Sec-Fetch-Site") == "cross-site"
                    or (self.command in {"POST", "DELETE"} and origin is None)):
                    self.fail(403)
                    return
                self.history(path)
            elif self.command in {"GET", "HEAD"}:
                self.static(path)
            else:
                self.fail(405)
        except (UnicodeError, ValueError):
            self.fail(400)
        except sqlite3.Error:
            self.fail(503)

    do_GET = do_HEAD = do_POST = do_DELETE = dispatch


def make_server(db_path, dist, port):
    db_path, dist = Path(db_path).resolve(), Path(dist).resolve()
    if db_path == dist or dist in db_path.parents:
        raise ValueError("Храните базу SQLite за пределами каталога dist.")
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with closing(connect(db_path)) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript(SCHEMA)
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.database, server.dist = db_path, dist
    port = server.server_address[1]
    hostnames = {"127.0.0.1", "localhost", "[::1]"}
    server.allowed_hosts = {f"{name}:{port}" for name in hostnames}
    if port == 80:
        server.allowed_hosts.update(hostnames)
    return server


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--db", type=Path, default=ROOT / "data" / "history.sqlite3")
    args = parser.parse_args()
    if not (ROOT / "dist" / "index.html").is_file():
        parser.exit(1, "Сначала соберите сайт командой npm run build.\n")
    with make_server(args.db, ROOT / "dist", args.port) as httpd:
        print(f"Мера: http://127.0.0.1:{httpd.server_address[1]}/", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
