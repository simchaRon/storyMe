"""Sending e-mail (for the password reset link).

With `SMTP_HOST` set, the message goes out through that SMTP server. With no SMTP host nothing is sent and a warning
is written to the log. For local development only, `DEV_LOG_RESET_LINKS=true` also writes the message (with the link) to the log.
"""

import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import Protocol
from urllib.parse import quote

from ..config import settings

log = logging.getLogger("dreamtale.mailer")


class Mailer(Protocol):
    def send(self, to: str, subject: str, body: str) -> None: ...


class SmtpMailer:
    def send(self, to: str, subject: str, body: str) -> None:
        msg = EmailMessage()
        msg["From"] = settings.smtp_from or settings.smtp_user
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
            if settings.smtp_starttls:
                smtp.starttls(context=ssl.create_default_context())
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)


class NoMailer:
    """Used when SMTP is not set up. Sends nothing."""

    def send(self, to: str, subject: str, body: str) -> None:
        log.warning("E-mail is not set up (SMTP_HOST is empty). Nothing was sent to the user.")
        if settings.dev_log_reset_links:
            log.warning("DEV ONLY - the e-mail that would be sent:\nSubject: %s\n%s", subject, body)


def get_mailer() -> Mailer:
    return SmtpMailer() if settings.smtp_host else NoMailer()


def reset_link(token: str) -> str:
    return f"{settings.app_base_url.rstrip('/')}/reset-password?token={quote(token)}"


TEXTS = {
    "en": (
        "Reset your DreamTale AI password",
        "Hello,\n\nSomeone asked to reset the password of your DreamTale AI account.\n"
        "To choose a new password, open this link. It works once and for {minutes} minutes:\n\n{link}\n\n"
        "If this was not you, ignore this message. Your password stays the same.\n",
    ),
    "he": (
        "איפוס סיסמה ל-DreamTale AI",
        "שלום,\n\nמישהו ביקש לאפס את הסיסמה של החשבון שלך ב-DreamTale AI.\n"
        "כדי לבחור סיסמה חדשה, פתחו את הקישור הזה. הוא עובד פעם אחת ובמשך {minutes} דקות:\n\n{link}\n\n"
        "אם זה לא אתם, התעלמו מההודעה. הסיסמה שלכם נשארת כפי שהיא.\n",
    ),
}


def send_reset_email(mailer: Mailer, to: str, token: str, language: str) -> None:
    """Runs in the background. A failure is only logged: the user always gets the same answer."""
    subject, body = TEXTS.get(language, TEXTS["en"])
    try:
        mailer.send(to, subject, body.format(minutes=settings.reset_token_minutes, link=reset_link(token)))
    except Exception:  # noqa: BLE001 - never let a mail problem break the request or leak details
        log.exception("Could not send the password reset e-mail")
