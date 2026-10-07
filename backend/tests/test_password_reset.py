import logging
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.config import settings
from app.models import PasswordReset, User
from app.services.mailer import NoMailer

EMAIL = "one@example.com"


def _register(client, email=EMAIL, language="en"):
    r = client.post("/api/auth/register", json={"email": email, "password": "password123", "preferred_language": language})
    assert r.status_code == 201
    return r.json()["access_token"]


def _token_from(mail):
    return re.search(r"token=([\w\-]+)", mail[2]).group(1)


def _forgot(client, email=EMAIL):
    return client.post("/api/auth/forgot-password", json={"email": email})


def _reset(client, token, password="newpassword1"):
    return client.post("/api/auth/reset-password", json={"token": token, "password": password})


def test_forgot_sends_a_link_and_keeps_only_the_hash(client, mailer):
    _register(client)
    r = _forgot(client)
    assert r.status_code == 202
    assert len(mailer.sent) == 1
    to, _subject, body = mailer.sent[0]
    token = _token_from(mailer.sent[0])
    assert to == EMAIL and body.count(settings.app_base_url) == 1
    with client.session_factory() as db:
        row = db.scalar(select(PasswordReset))
        assert row.token_hash != token and token not in row.token_hash  # the token itself is not stored


def test_unknown_email_gets_the_same_answer_and_no_mail(client, mailer):
    _register(client)
    known = _forgot(client)
    unknown = _forgot(client, "nobody@example.com")
    assert unknown.status_code == known.status_code == 202
    assert unknown.json() == known.json()
    assert len(mailer.sent) == 1  # only the real account got a mail


def test_email_case_does_not_matter(client, mailer):
    _register(client)
    assert _forgot(client, "ONE@Example.com").status_code == 202
    assert len(mailer.sent) == 1


def test_cooldown_stops_a_flood_of_mails(client, mailer):
    _register(client)
    _forgot(client)
    _forgot(client)
    _forgot(client)
    assert len(mailer.sent) == 1


def test_reset_changes_the_password(client, mailer):
    _register(client)
    _forgot(client)
    r = _reset(client, _token_from(mailer.sent[0]))
    assert r.status_code == 200
    assert client.post("/api/auth/login", json={"email": EMAIL, "password": "password123"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": EMAIL, "password": "newpassword1"}).status_code == 200


def test_a_link_works_only_once(client, mailer):
    _register(client)
    _forgot(client)
    token = _token_from(mailer.sent[0])
    assert _reset(client, token).status_code == 200
    assert _reset(client, token, "anotherpass22").status_code == 400
    assert client.post("/api/auth/login", json={"email": EMAIL, "password": "newpassword1"}).status_code == 200


def test_wrong_and_expired_links_are_refused(client, mailer):
    _register(client)
    assert _reset(client, "x" * 43).status_code == 400
    _forgot(client)
    token = _token_from(mailer.sent[0])
    with client.session_factory() as db:
        row = db.scalar(select(PasswordReset))
        row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    assert _reset(client, token).status_code == 400
    assert client.post("/api/auth/login", json={"email": EMAIL, "password": "password123"}).status_code == 200


def test_a_weak_new_password_is_refused_and_the_link_stays_usable(client, mailer):
    _register(client)
    _forgot(client)
    token = _token_from(mailer.sent[0])
    assert _reset(client, token, "short").status_code == 422
    assert _reset(client, token, "é" * 40).status_code == 422  # more than 72 bytes
    assert _reset(client, token).status_code == 200


def test_old_logins_stop_working_after_a_reset(client, mailer):
    old_token = _register(client)
    headers = {"Authorization": f"Bearer {old_token}"}
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    _forgot(client)
    _reset(client, _token_from(mailer.sent[0]))
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    new = client.post("/api/auth/login", json={"email": EMAIL, "password": "newpassword1"}).json()["access_token"]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {new}"}).status_code == 200


def test_a_new_request_cancels_the_older_link(client, mailer, monkeypatch):
    monkeypatch.setattr(settings, "reset_cooldown_seconds", 0)
    _register(client)
    _forgot(client)
    _forgot(client)
    first, second = (_token_from(m) for m in mailer.sent)
    assert _reset(client, first).status_code == 400
    assert _reset(client, second).status_code == 200


def test_a_mail_failure_does_not_change_the_answer(client, mailer):
    _register(client)
    mailer.fail = True
    assert _forgot(client).status_code == 202


def test_the_mail_is_in_the_language_of_the_user(client, mailer):
    _register(client, "he@example.com", "he")
    _forgot(client, "he@example.com")
    _register(client, "en@example.com", "en")
    _forgot(client, "en@example.com")
    assert "איפוס סיסמה" in mailer.sent[0][1]
    assert "Reset your" in mailer.sent[1][1]


def test_without_smtp_nothing_is_logged_by_default(caplog, monkeypatch):
    monkeypatch.setattr(settings, "dev_log_reset_links", False)
    with caplog.at_level(logging.WARNING, logger="dreamtale.mailer"):
        NoMailer().send("a@b.c", "Subject", "secret-link-body")
    assert "not set up" in caplog.text and "secret-link-body" not in caplog.text
    caplog.clear()
    monkeypatch.setattr(settings, "dev_log_reset_links", True)
    with caplog.at_level(logging.WARNING, logger="dreamtale.mailer"):
        NoMailer().send("a@b.c", "Subject", "secret-link-body")
    assert "secret-link-body" in caplog.text


def test_deleting_the_account_removes_its_reset_links(client, mailer):
    token = _register(client)
    _forgot(client)
    # the token from register has the password version, so it can delete the account
    assert client.delete("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 204
    with client.session_factory() as db:
        assert db.scalar(select(PasswordReset)) is None
        assert db.scalar(select(User)) is None
