"""
email_service.py — abstracted email sending for Quorum.

Backend: Resend (https://resend.com) when RESEND_API_KEY is set.
Fallback: prints to stdout for local development.

Swap to Auth0/SendGrid/etc. later by replacing _send() only.
"""

import os

FROM_ADDRESS = os.environ.get("EMAIL_FROM", "Quorum <noreply@quorum.study>")
APP_URL      = os.environ.get("APP_URL", "http://localhost:5173")


def _send(to: str, subject: str, html: str):
    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key:
        print(f"\n[EMAIL — no RESEND_API_KEY set]\nTo: {to}\nSubject: {subject}\n{html}\n")
        return
    try:
        import resend
        resend.api_key = api_key
        resend.Emails.send({"from": FROM_ADDRESS, "to": to, "subject": subject, "html": html})
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")


# ── Templates ──────────────────────────────────────────────────────────────────

def send_verification_email(to: str, token: str):
    url = f"{APP_URL}/app/verify-email?token={token}"
    _send(
        to=to,
        subject="Verify your Quorum account",
        html=f"""
        <p style="font-family:Georgia,serif;font-size:18px;margin-bottom:24px">Quorum</p>
        <p>Verify your email address to activate your account.</p>
        <p style="margin:24px 0">
            <a href="{url}" style="background:#1A1714;color:#fff;padding:12px 24px;
               text-decoration:none;font-family:sans-serif;font-size:13px;letter-spacing:0.08em">
               VERIFY EMAIL
            </a>
        </p>
        <p style="font-size:12px;color:#8A847A">
            This link expires in 24 hours. If you didn't create a Quorum account, ignore this email.
        </p>
        <p style="font-size:12px;color:#8A847A">Or copy this link: {url}</p>
        """
    )


def send_password_reset_email(to: str, token: str):
    url = f"{APP_URL}/app/reset-password?token={token}"
    _send(
        to=to,
        subject="Reset your Quorum password",
        html=f"""
        <p style="font-family:Georgia,serif;font-size:18px;margin-bottom:24px">Quorum</p>
        <p>We received a request to reset your password.</p>
        <p style="margin:24px 0">
            <a href="{url}" style="background:#1A1714;color:#fff;padding:12px 24px;
               text-decoration:none;font-family:sans-serif;font-size:13px;letter-spacing:0.08em">
               RESET PASSWORD
            </a>
        </p>
        <p style="font-size:12px;color:#8A847A">
            This link expires in 1 hour. If you didn't request a reset, ignore this email.
        </p>
        <p style="font-size:12px;color:#8A847A">Or copy this link: {url}</p>
        """
    )
