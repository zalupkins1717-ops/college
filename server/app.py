"""Serve the built Mera app and its calculation history."""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
from http import HTTPStatus
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import mimetypes
import os
from pathlib import Path
import re
import secrets
import shutil
from urllib.parse import unquote, urlsplit
import uuid

if __package__:
    from .storage import Database
else:
    from storage import Database

ROOT = Path(__file__).resolve().parent.parent
COOKIE = "mera_session"
LIMIT = 50
MAX_BYTES = 4 * 1024 * 1024
TOKEN_PATTERN = r"[A-Za-z0-9_-]{43}"


def encoded(value):
    return json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(",", ":"))


def text(value, limit):
    return isinstance(value, str) and "\0" not in value and len(value) <= limit and not any(
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


def session_owner(token):
    return sha256(token.encode("ascii")).hexdigest()


def parse_public_origin(value):
    if not value:
        return None
    origin = urlsplit(value)
    if (not origin.hostname or origin.scheme not in {"http", "https"} or origin.username is not None
        or origin.password is not None or origin.path not in {"", "/"} or origin.query or origin.fragment):
        raise ValueError("MERA_PUBLIC_ORIGIN должен содержать схему и имя сайта.")
    if origin.scheme == "http" and origin.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("Для публичного сайта укажите адрес HTTPS в MERA_PUBLIC_ORIGIN.")
    hostname = origin.hostname if ":" not in origin.hostname else f"[{origin.hostname}]"
    port = origin.port
    if port is not None and port != (443 if origin.scheme == "https" else 80):
        hostname += f":{port}"
    return f"{origin.scheme}://{hostname}"


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
        if self.pages_client:
            self.send_header("Access-Control-Allow-Origin", self.server.frontend_origin)
            self.send_header("Vary", "Origin")
            if self.command == "OPTIONS" and status == 204:
                self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE")
                self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Mera-Client")
                self.send_header("Access-Control-Max-Age", "600")
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
        if self.pages_client:
            auth = self.headers.get("Authorization", "")
            match = re.fullmatch("Bearer (" + TOKEN_PATTERN + ")", auth, flags=re.IGNORECASE)
            return match.group(1) if match else None
        cookies = SimpleCookie()
        try:
            cookies.load(self.headers.get("Cookie", ""))
        except CookieError:
            return None
        token = cookies[COOKIE].value if COOKIE in cookies else ""
        return token if re.fullmatch(TOKEN_PATTERN, token) else None

    def session(self, db, owner):
        if owner is not None:
            self.respond(204)
            return
        token = secrets.token_urlsafe(32)
        with db.write():
            db.execute("INSERT INTO sessions VALUES (?)", (session_owner(token),))
        if self.pages_client:
            self.respond(201, encoded({"token": token}).encode())
            return
        cookie = f"{COOKIE}={token}; Path=/api; Max-Age=31536000; HttpOnly; SameSite=Strict"
        if self.server.public_origin and self.server.public_origin.startswith("https://"):
            cookie += "; Secure"
        self.respond(204, cookie=cookie)

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
        with db.write(owner):
            db.execute("""INSERT INTO calculations
                (id,owner,created_at,calculator,title,inputs,summary,details,unit,numerical_result)
                VALUES (?,?,?,?,?,?,?,?,?,?)""",
                       (str(uuid.uuid4()), owner, now, entry["calculatorId"], entry["title"],
                        encoded(entry["inputs"]), entry["summary"], encoded(entry["details"]), entry["unit"],
                        encoded(entry["numericalResult"]) if "numericalResult" in entry else None))
            db.execute("""DELETE FROM calculations WHERE owner=? AND sequence <=
                (SELECT sequence FROM calculations WHERE owner=? ORDER BY sequence DESC LIMIT 1 OFFSET ?)""",
                       (owner, owner, LIMIT))
        self.respond(201)

    def history(self, path):
        with self.server.database.session() as db:
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
                    with db.write(owner):
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
                with db.write(owner):
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
            self.respond(200, file.read_bytes(), "text/html; charset=utf-8")
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

    def api_request(self, path, host):
        origin = self.headers.get("Origin")
        marker = self.headers.get("X-Mera-Client")
        expected_origin = self.server.public_origin or "http://" + host
        if self.server.frontend_origin and origin == self.server.frontend_origin and origin != expected_origin:
            self.pages_client = True
            if self.command == "OPTIONS":
                requested = {h.strip().lower() for h in self.headers.get("Access-Control-Request-Headers", "").split(",")}
                valid = (self.headers.get("Access-Control-Request-Method") in {"GET", "POST", "DELETE"}
                         and "x-mera-client" in requested
                         and requested <= {"authorization", "content-type", "x-mera-client"})
                if valid:
                    self.respond(204)
                else:
                    self.fail(403)
                return
            if marker != "pages":
                self.fail(403)
                return
        elif (self.command == "OPTIONS" or marker is not None or self.headers.get("Authorization") is not None
              or (origin is not None and origin != expected_origin)
              or self.headers.get("Sec-Fetch-Site") == "cross-site"
              or (self.command in {"POST", "DELETE"} and origin is None)):
            self.fail(403)
            return
        self.history(path)

    def dispatch(self):
        self.pages_client = False
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
                self.api_request(path, host)
            elif self.command in {"GET", "HEAD"}:
                self.static(path)
            else:
                self.fail(405)
        except (UnicodeError, ValueError):
            self.fail(400)
        except self.server.database.error:
            self.fail(503)

    do_GET = do_HEAD = do_POST = do_DELETE = do_OPTIONS = dispatch


def make_server(db_path, dist, port, host="127.0.0.1", public_origin=None, frontend_origin=None, database_url=None):
    public_origin = parse_public_origin(public_origin)
    frontend_origin = parse_public_origin(frontend_origin)
    db_path, dist = Path(db_path).resolve(), Path(dist).resolve()
    if not database_url and (db_path == dist or dist in db_path.parents):
        raise ValueError("Храните базу SQLite за пределами каталога dist.")
    database = Database(db_path, database_url)
    server = ThreadingHTTPServer((host, port), Handler)
    server.database, server.dist = database, dist
    server.public_origin = public_origin
    server.frontend_origin = frontend_origin
    port = server.server_address[1]
    hostnames = {"127.0.0.1", "localhost", "[::1]"}
    server.allowed_hosts = {f"{name}:{port}" for name in hostnames}
    if port == 80:
        server.allowed_hosts.update(hostnames)
    if public_origin:
        server.allowed_hosts.add(urlsplit(public_origin).netloc)
    return server


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    default_host = "0.0.0.0" if os.environ.get("RENDER") == "true" else "127.0.0.1"
    parser.add_argument("--host", default=os.environ.get("HOST") or default_host)
    parser.add_argument("--port", type=int, default=os.environ.get("PORT", "8000"))
    parser.add_argument("--db", type=Path, default=os.environ.get("MERA_DB_PATH", ROOT / "data" / "history.sqlite3"))
    parser.add_argument("--public-origin", default=os.environ.get("MERA_PUBLIC_ORIGIN") or os.environ.get("RENDER_EXTERNAL_URL"))
    parser.add_argument("--frontend-origin", default=os.environ.get("MERA_FRONTEND_ORIGIN"))
    args = parser.parse_args()
    if not (ROOT / "dist" / "index.html").is_file():
        parser.exit(1, "Сначала соберите сайт командой npm run build.\n")
    with make_server(args.db, ROOT / "dist", args.port, args.host, args.public_origin,
                     args.frontend_origin, os.environ.get("DATABASE_URL")) as httpd:
        origin = httpd.public_origin or f"http://{args.host}:{httpd.server_address[1]}"
        print(f"Мера: {origin}/", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
