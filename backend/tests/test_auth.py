import time

import jwt

from app.config import settings


def test_register_defaults_language_to_en(client):
    r = client.post("/api/auth/register", json={"email": "a@example.com", "password": "password123"})
    assert r.status_code == 201
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["preferred_language"] == "en"
    assert me["email"] == "a@example.com"


def test_register_duplicate_email(client):
    body = {"email": "a@example.com", "password": "password123"}
    assert client.post("/api/auth/register", json=body).status_code == 201
    assert client.post("/api/auth/register", json={**body, "email": "A@Example.com"}).status_code == 409


def test_register_password_rules(client):
    short = {"email": "a@example.com", "password": "short"}
    assert client.post("/api/auth/register", json=short).status_code == 422
    too_long = {"email": "a@example.com", "password": "x" * 73}
    assert client.post("/api/auth/register", json=too_long).status_code == 422
    # 40 Hebrew letters are 80 bytes in UTF-8, so this must be rejected too.
    hebrew = {"email": "a@example.com", "password": "א" * 40}
    assert client.post("/api/auth/register", json=hebrew).status_code == 422


def test_login(client, auth):
    ok = client.post("/api/auth/login", json={"email": "one@example.com", "password": "password123"})
    assert ok.status_code == 200
    assert ok.json()["token_type"] == "bearer"


def test_login_wrong_password_and_unknown_email(client, auth):
    bad_pw = client.post("/api/auth/login", json={"email": "one@example.com", "password": "nope-nope"})
    unknown = client.post("/api/auth/login", json={"email": "who@example.com", "password": "password123"})
    assert bad_pw.status_code == unknown.status_code == 401
    assert bad_pw.json() == unknown.json()


def test_missing_and_bad_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer nonsense"}).status_code == 401


def test_expired_token(client):
    token = jwt.encode({"sub": "1", "exp": int(time.time()) - 10}, settings.jwt_secret, algorithm="HS256")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_token_signed_with_other_secret(client):
    token = jwt.encode({"sub": "1", "exp": int(time.time()) + 600}, "other-secret-value-1234567890abcdefgh", algorithm="HS256")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_delete_account_removes_stories(client, auth):
    client.post("/api/stories/generate", headers=auth, json={"keywords": ["moon"]})
    assert client.delete("/api/auth/me", headers=auth).status_code == 204
    assert client.get("/api/auth/me", headers=auth).status_code == 401
    login = client.post("/api/auth/login", json={"email": "one@example.com", "password": "password123"})
    assert login.status_code == 401
