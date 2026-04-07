"""
auth.py — account authentication for Quorum.

Uses Flask-Login for session management (HTTP-only cookies).
All auth logic lives here so it can be swapped for Auth0 later:
  - get_current_account() → Auth0 JWT decode
  - login()               → Auth0 token exchange
  - register()            → Auth0 Management API user creation

Auth0 migration path:
  1. Populate accounts.auth0_sub via a migration script
  2. Replace Flask-Login session checks with JWT verification
  3. The rest of the app (profiles, progress, cards) is untouched
"""

import secrets
import os
from datetime import datetime, timedelta

from flask import jsonify
from flask_login import LoginManager, UserMixin, login_user, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash

import database as db
import email_service

login_manager = LoginManager()


# ── Flask-Login user class (wraps an account row) ─────────────────────────────

class AccountUser(UserMixin):
    def __init__(self, account: dict):
        self.id            = account["id"]
        self.email         = account["email"]
        self.email_verified = bool(account.get("email_verified"))

    def to_dict(self):
        return {"id": self.id, "email": self.email, "email_verified": self.email_verified}


@login_manager.user_loader
def load_user(account_id):
    account = db.get_account(int(account_id))
    return AccountUser(account) if account else None


@login_manager.unauthorized_handler
def unauthorized():
    return jsonify({"error": "Authentication required"}), 401


def init_app(app):
    """Attach Flask-Login to the Flask app."""
    app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-in-production")
    login_manager.init_app(app)


# ── Registration ───────────────────────────────────────────────────────────────

def register(email: str, password: str, invite_code: str) -> tuple[dict, int]:
    """
    Validate invite code, create account, send verification email.
    Returns (response_dict, http_status).
    """
    email = email.strip().lower()

    # Invite code check
    code = db.get_invite_code(invite_code)
    if not code:
        return {"error": "Invalid invite code"}, 400
    if code["used_count"] >= code["max_uses"]:
        return {"error": "Invite code has already been used"}, 400
    if code["expires_at"] and code["expires_at"] < datetime.utcnow().isoformat():
        return {"error": "Invite code has expired"}, 400

    # Duplicate email check
    if db.get_account_by_email(email):
        return {"error": "An account with that email already exists"}, 409

    # Create account
    password_hash = generate_password_hash(password)
    account = db.create_account(email, password_hash, invite_code)
    db.use_invite_code(invite_code)

    # Send verification email
    token = secrets.token_urlsafe(32)
    expires = (datetime.utcnow() + timedelta(hours=24)).isoformat()
    db.create_verification_token(account["id"], token, expires)
    email_service.send_verification_email(email, token)

    return {"message": "Account created. Check your email to verify.", "account_id": account["id"]}, 201


# ── Login ──────────────────────────────────────────────────────────────────────

def login(email: str, password: str) -> tuple[dict, int]:
    """Validate credentials, start Flask-Login session."""
    email = email.strip().lower()
    account = db.get_account_by_email(email)

    if not account or not account.get("password_hash"):
        return {"error": "Invalid email or password"}, 401
    if not check_password_hash(account["password_hash"], password):
        return {"error": "Invalid email or password"}, 401

    skip_verify = os.environ.get("SKIP_EMAIL_VERIFY", "").lower() in ("1", "true")
    if not account["email_verified"] and not skip_verify:
        return {"error": "Please verify your email before logging in", "unverified": True}, 403

    user = AccountUser(account)
    login_user(user, remember=True)
    return {"account": user.to_dict()}, 200


# ── Logout ─────────────────────────────────────────────────────────────────────

def logout() -> tuple[dict, int]:
    logout_user()
    return {"message": "Logged out"}, 200


# ── Email verification ─────────────────────────────────────────────────────────

def verify_email(token: str) -> tuple[dict, int]:
    account_id = db.consume_verification_token(token)
    if not account_id:
        return {"error": "Invalid or expired verification link"}, 400
    db.set_email_verified(account_id)
    return {"message": "Email verified. You can now log in."}, 200


def resend_verification(email: str) -> tuple[dict, int]:
    account = db.get_account_by_email(email.strip().lower())
    if not account:
        # Don't reveal whether email exists
        return {"message": "If that email is registered, a verification link has been sent."}, 200
    if account["email_verified"]:
        return {"message": "Email is already verified."}, 200
    token = secrets.token_urlsafe(32)
    expires = (datetime.utcnow() + timedelta(hours=24)).isoformat()
    db.create_verification_token(account["id"], token, expires)
    email_service.send_verification_email(account["email"], token)
    return {"message": "Verification email sent."}, 200


# ── Password reset ─────────────────────────────────────────────────────────────

def forgot_password(email: str) -> tuple[dict, int]:
    account = db.get_account_by_email(email.strip().lower())
    # Always return 200 — don't reveal whether email is registered
    if account:
        token = secrets.token_urlsafe(32)
        expires = (datetime.utcnow() + timedelta(hours=1)).isoformat()
        db.create_reset_token(account["id"], token, expires)
        email_service.send_password_reset_email(account["email"], token)
    return {"message": "If that email is registered, a reset link has been sent."}, 200


def reset_password(token: str, new_password: str) -> tuple[dict, int]:
    if len(new_password) < 8:
        return {"error": "Password must be at least 8 characters"}, 400
    account_id = db.consume_reset_token(token)
    if not account_id:
        return {"error": "Invalid or expired reset link"}, 400
    db.update_account_password(account_id, generate_password_hash(new_password))
    return {"message": "Password updated. You can now log in."}, 200
