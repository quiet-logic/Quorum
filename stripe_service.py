"""
stripe_service.py — Stripe subscription management for Quorum.

Handles:
- Checkout session creation (hosted payment page)
- Customer Portal session (manage/cancel)
- Webhook processing (subscription status updates)
- Access checks (trial / subscription / invite)

Env vars required:
  STRIPE_SECRET_KEY       — Stripe secret key (sk_live_... or sk_test_...)
  STRIPE_PRICE_ID         — Price ID for the £5/month subscription (price_...)
  STRIPE_WEBHOOK_SECRET   — Webhook endpoint signing secret (whsec_...)
  APP_URL                 — Base URL for redirect (e.g. https://quorumsqe.uk)
"""

import os
import stripe
from datetime import datetime

import database as db

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
PRICE_ID       = os.environ.get("STRIPE_PRICE_ID", "")
WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
APP_URL        = os.environ.get("APP_URL", "http://localhost:5173")


def has_access(account: dict) -> bool:
    """
    Returns True if the account is allowed to use Quorum.

    Priority order:
      1. invite_free_access = 1  →  free forever (beta users)
      2. Stripe subscription active / past_due / trialing  →  paying subscriber
      3. Within server-side 1-day trial window  →  new user in trial
    """
    if account.get("invite_free_access"):
        return True

    status = account.get("subscription_status")
    if status in ("active", "past_due", "trialing"):
        return True

    # Server-side trial: no Stripe subscription yet, but trial window is open
    if not status:
        trial_ends = account.get("trial_ends_at")
        if trial_ends and trial_ends > datetime.utcnow().isoformat():
            return True

    return False


def create_checkout_session(account_id: int, email: str, customer_id: str | None) -> str:
    """
    Create a Stripe Checkout session for the £5/month subscription.
    Returns the hosted checkout URL.
    """
    params = {
        "mode":         "subscription",
        "line_items":   [{"price": PRICE_ID, "quantity": 1}],
        "success_url":  f"{APP_URL}/app?subscribed=1",
        "cancel_url":   f"{APP_URL}/app",
        "client_reference_id": str(account_id),
        "metadata":     {"account_id": str(account_id)},
        "allow_promotion_codes": True,
    }

    if customer_id:
        params["customer"] = customer_id
    else:
        params["customer_email"] = email

    session = stripe.checkout.Session.create(**params)
    return session.url


def create_portal_session(customer_id: str) -> str:
    """
    Create a Stripe Customer Portal session for managing/cancelling subscription.
    Returns the portal URL.
    """
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{APP_URL}/app",
    )
    return session.url


def handle_webhook(payload: bytes, sig_header: str) -> tuple[dict, int]:
    """
    Verify webhook signature, deduplicate, and dispatch to handlers.
    Returns (response_dict, http_status).
    """
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET)
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except stripe.error.SignatureVerificationError:
        return {"error": "Invalid signature"}, 400
    except Exception:
        return {"error": "Webhook parse error"}, 400

    event_id = event["id"]
    if db.has_stripe_event(event_id):
        return {"status": "already_processed"}, 200
    db.record_stripe_event(event_id)

    etype = event["type"]
    # Stripe v5+ returns StripeObject — convert to plain dict for safe .get() access
    data  = event["data"]["object"].to_dict()

    if etype == "checkout.session.completed":
        _handle_checkout_completed(data)

    elif etype in ("customer.subscription.created", "customer.subscription.updated"):
        _handle_subscription_change(data)

    elif etype == "customer.subscription.deleted":
        customer_id = data.get("customer")
        if customer_id:
            db.set_subscription_status_by_customer(customer_id, "canceled")

    elif etype == "invoice.payment_failed":
        customer_id = data.get("customer")
        if customer_id:
            db.set_subscription_status_by_customer(customer_id, "past_due")

    elif etype == "invoice.payment_succeeded":
        customer_id = data.get("customer")
        if customer_id:
            account = db.get_account_by_customer_id(customer_id)
            if account and account.get("subscription_status") == "past_due":
                db.set_subscription_status_by_customer(customer_id, "active")

    return {"status": "ok"}, 200


def _handle_checkout_completed(session: dict):
    """Link the Stripe customer to the Quorum account after checkout."""
    account_id  = session.get("client_reference_id")
    customer_id = session.get("customer")
    if account_id and customer_id:
        db.set_stripe_customer_id(int(account_id), customer_id)


def _handle_subscription_change(sub: dict):
    """Mirror Stripe subscription status onto the account."""
    customer_id = sub.get("customer")
    status      = sub.get("status")
    if customer_id and status:
        db.set_subscription_status_by_customer(customer_id, status)
