"""
app.py — Flask API for Quorum.

Routes only. All DB access goes through database.py.
All routes prefixed /api/. Root / serves the React build in production.
"""

from flask import Flask, jsonify, request, send_from_directory, Response, render_template
from datetime import date
import json
import os
import random

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import database as db
import auth as auth_module
import stripe_service
from srs import sm2, next_review_date
from flask_login import login_required, current_user

app = Flask(__name__, static_folder="legal-study-app/dist", static_url_path="/app")
auth_module.init_app(app)

# ── DB init (seeding happens in Procfile before gunicorn starts) ──────────────
db.init_db()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _user_id() -> tuple[int | None, object | None]:
    """Extract user_id (profile id) from request and validate it belongs to
    the authenticated account. Returns (user_id, error_response)."""
    if request.method == 'GET':
        uid = request.args.get('user_id', type=int)
    else:
        body = request.get_json(silent=True) or {}
        uid = body.get('user_id')
    if not uid:
        return None, (jsonify({"error": "user_id is required"}), 400)

    # Validate profile ownership when authenticated
    if current_user.is_authenticated:
        if not db.profile_belongs_to_account(uid, current_user.id):
            return None, (jsonify({"error": "Profile not found"}), 404)

    return uid, None


# ── Production: serve React build ────────────────────────────────────────────

@app.route("/")
def serve_landing():
    return render_template("landing.html")


@app.route("/privacy")
def serve_privacy():
    return render_template("privacy.html")


@app.route("/terms")
def serve_terms():
    return render_template("terms.html")


@app.route("/cookies")
def serve_cookies():
    return render_template("cookies.html")


@app.route("/app")
@app.route("/app/<path:path>")
def serve_app(path=""):
    return send_from_directory(app.static_folder, "index.html")


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    body = request.get_json(silent=True) or {}
    email       = (body.get("email") or "").strip()
    password    = body.get("password") or ""
    invite_code = (body.get("invite_code") or "").strip()
    if not email or not password or not invite_code:
        return jsonify({"error": "email, password, and invite_code are required"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    result, status = auth_module.register(email, password, invite_code)
    return jsonify(result), status


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    body = request.get_json(silent=True) or {}
    email    = (body.get("email") or "").strip()
    password = body.get("password") or ""
    if not email or not password:
        return jsonify({"error": "email and password are required"}), 400
    result, status = auth_module.login(email, password)
    return jsonify(result), status


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    result, status = auth_module.logout()
    return jsonify(result), status


@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    if not current_user.is_authenticated:
        return jsonify({"error": "Not authenticated"}), 401
    return jsonify({"account": current_user.to_dict()})


@app.route("/api/auth/verify-email", methods=["POST"])
def auth_verify_email():
    body = request.get_json(silent=True) or {}
    token = (body.get("token") or "").strip()
    if not token:
        return jsonify({"error": "token is required"}), 400
    result, status = auth_module.verify_email(token)
    return jsonify(result), status


@app.route("/api/auth/resend-verification", methods=["POST"])
def auth_resend_verification():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip()
    if not email:
        return jsonify({"error": "email is required"}), 400
    result, status = auth_module.resend_verification(email)
    return jsonify(result), status


@app.route("/api/auth/forgot-password", methods=["POST"])
def auth_forgot_password():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip()
    if not email:
        return jsonify({"error": "email is required"}), 400
    result, status = auth_module.forgot_password(email)
    return jsonify(result), status


@app.route("/api/auth/reset-password", methods=["POST"])
def auth_reset_password():
    body = request.get_json(silent=True) or {}
    token        = (body.get("token") or "").strip()
    new_password = body.get("new_password") or ""
    if not token or not new_password:
        return jsonify({"error": "token and new_password are required"}), 400
    result, status = auth_module.reset_password(token, new_password)
    return jsonify(result), status


@app.route("/api/auth/delete-account", methods=["DELETE"])
@login_required
def auth_delete_account():
    result, status = auth_module.delete_account(current_user.id)
    return jsonify(result), status


# ── Billing (Stripe) ──────────────────────────────────────────────────────────

@app.route("/api/billing/status", methods=["GET"])
@login_required
def billing_status():
    account = db.get_account(current_user.id)
    return jsonify({
        "has_access":          stripe_service.has_access(account),
        "invite_free_access":  bool(account.get("invite_free_access")),
        "subscription_status": account.get("subscription_status"),
        "trial_ends_at":       account.get("trial_ends_at"),
        "has_stripe_customer": bool(account.get("stripe_customer_id")),
    })


@app.route("/api/billing/checkout", methods=["POST"])
@login_required
def billing_checkout():
    account = db.get_account(current_user.id)
    try:
        url = stripe_service.create_checkout_session(
            account_id=current_user.id,
            email=current_user.email,
            customer_id=account.get("stripe_customer_id"),
        )
        return jsonify({"url": url})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/billing/portal", methods=["POST"])
@login_required
def billing_portal():
    account = db.get_account(current_user.id)
    customer_id = account.get("stripe_customer_id")
    if not customer_id:
        return jsonify({"error": "No billing account found — subscribe first"}), 404
    try:
        url = stripe_service.create_portal_session(customer_id)
        return jsonify({"url": url})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/stripe/webhook", methods=["POST"])
def stripe_webhook():
    """Receive Stripe webhook events. Must be excluded from CSRF protection."""
    payload    = request.get_data()
    sig_header = request.headers.get("Stripe-Signature", "")
    result, status = stripe_service.handle_webhook(payload, sig_header)
    return jsonify(result), status


# ── User (profile) management ─────────────────────────────────────────────────

@app.route("/api/users", methods=["GET"])
@login_required
def list_users():
    """List all profiles for the authenticated account, with FLK progress."""
    return jsonify(db.list_users_with_progress(account_id=current_user.id))


@app.route("/api/users", methods=["POST"])
@login_required
def create_user():
    """Create a new profile under the authenticated account. Body: { name, avatar_seed? }"""
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    if len(name) > 40:
        return jsonify({"error": "name must be 40 characters or fewer"}), 400
    avatar_seed = body.get("avatar_seed")
    try:
        user = db.create_user(name, avatar_seed, account_id=current_user.id)
        return jsonify(user), 201
    except Exception:
        return jsonify({"error": "A profile with that name already exists"}), 409


@app.route("/api/users/<int:user_id>", methods=["PUT"])
@login_required
def update_user(user_id):
    """Update a profile. Body: { name?, avatar_seed?, last_active? }"""
    if not db.profile_belongs_to_account(user_id, current_user.id):
        return jsonify({"error": "Profile not found"}), 404
    body = request.get_json(silent=True) or {}
    name        = (body.get("name") or "").strip() or None
    avatar_seed = body.get("avatar_seed")
    last_active = body.get("last_active")
    if name and len(name) > 40:
        return jsonify({"error": "name must be 40 characters or fewer"}), 400
    user = db.update_user(user_id, name=name, avatar_seed=avatar_seed, last_active=last_active)
    if not user:
        return jsonify({"error": "Profile not found"}), 404
    return jsonify(user)


@app.route("/api/users/<int:user_id>", methods=["DELETE"])
@login_required
def delete_user(user_id):
    """Delete a profile and all its progress/reviews."""
    deleted = db.delete_user(user_id)
    if not deleted:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"deleted": True})


@app.route("/api/users/<int:user_id>/export", methods=["GET"])
@login_required
def export_user(user_id):
    """Download a JSON backup of a user's progress and reviews."""
    data = db.export_user_data(user_id)
    if not data:
        return jsonify({"error": "User not found"}), 404
    filename = f"quorum_backup_{data['user']['name'].replace(' ', '_')}.json"
    return Response(
        json.dumps(data, indent=2),
        mimetype="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.route("/api/users/<int:user_id>/import", methods=["POST"])
@login_required
def import_user(user_id):
    """Restore a user's progress/reviews from a backup JSON body."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400
    result = db.import_user_data(user_id, data)
    if "error" in result:
        return jsonify(result), 404
    return jsonify(result)


# ── Subjects ──────────────────────────────────────────────────────────────────

@app.route("/api/subjects", methods=["GET"])
@login_required
def subjects():
    user_id, err = _user_id()
    if err:
        return err
    return jsonify(db.get_subjects_with_progress(user_id))


# ── Study (due cards) ─────────────────────────────────────────────────────────

@app.route("/api/study/subject/<int:subject_id>", methods=["GET"])
@login_required
def study_subject(subject_id):
    user_id, err = _user_id()
    if err:
        return err
    cards = db.get_due_cards_for_subject(subject_id, user_id)
    if not cards:
        return jsonify({"cards": [], "message": "No cards due for this subject."})
    return jsonify({"cards": cards})


@app.route("/api/study/subtopic/<int:subtopic_id>", methods=["GET"])
@login_required
def study_subtopic(subtopic_id):
    user_id, err = _user_id()
    if err:
        return err
    cards = db.get_due_cards_for_subtopic(subtopic_id, user_id)
    if not cards:
        return jsonify({"cards": [], "message": "No cards due for this subtopic."})
    return jsonify({"cards": cards})


# ── Review (submit SM-2 rating) ───────────────────────────────────────────────

@app.route("/api/review", methods=["POST"])
@login_required
def review():
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Request body must be JSON."}), 400

    user_id = body.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id is required."}), 400

    score = body.get("score")
    if score is None:
        return jsonify({"error": "score is required."}), 400
    if not isinstance(score, int) or score < 0 or score > 5:
        return jsonify({"error": "score must be an integer 0–5."}), 400

    card_code = body.get("card_code")
    card_id   = body.get("card_id")

    if card_code:
        card = db.get_card_by_code(card_code)
        if not card:
            return jsonify({"error": f"Card '{card_code}' not found."}), 404
        card_id = card["id"]
    elif card_id is not None:
        card = db.get_card(card_id)
        if not card:
            return jsonify({"error": f"Card {card_id} not found."}), 404
    else:
        return jsonify({"error": "card_code or card_id is required."}), 400

    with db.get_db() as conn:
        progress = db.get_or_create_progress(conn, card_id, user_id)

        new_ef, new_interval, new_reps = sm2(
            easiness=progress["easiness"],
            interval=progress["interval"],
            repetitions=progress["repetitions"],
            score=score,
        )

        next_review = next_review_date(new_interval).isoformat()

        db.update_progress(conn, card_id, user_id, new_ef, new_interval, new_reps, next_review)
        db.insert_review(conn, card_id, score, user_id)

    return jsonify({
        "card_id": card_id,
        "easiness": round(new_ef, 4),
        "interval": new_interval,
        "repetitions": new_reps,
        "next_review": next_review,
    })


# ── Smart study session ───────────────────────────────────────────────────────

@app.route("/api/study/session", methods=["GET"])
@login_required
def study_session():
    user_id, err = _user_id()
    if err:
        return err

    subject_id     = request.args.get("subject_id", type=int)
    topic_id       = request.args.get("topic_id",   type=int)
    flk            = request.args.get("flk")
    limit          = request.args.get("limit", default=15, type=int)
    include_deeper = request.args.get("include_deeper", "false").lower() == "true"

    cards = db.get_session_cards(
        user_id=user_id, subject_id=subject_id, topic_id=topic_id,
        flk=flk, limit=limit, include_deeper=include_deeper,
    )

    if cards and not include_deeper:
        is_pc_session = any(c.get("subject_name") == "Professional Conduct" for c in cards[:1])
        if not is_pc_session:
            pc_count = max(1, len(cards) // 7)
            pc_cards = db.get_due_pc_cards(user_id=user_id, limit=pc_count)
            for pc_card in pc_cards:
                pos = random.randint(1, len(cards))
                cards.insert(pos, pc_card)

    return jsonify({"cards": cards, "total": len(cards)})


# ── Conduct Mode ─────────────────────────────────────────────────────────────

@app.route("/api/study/conduct", methods=["GET"])
@login_required
def study_conduct():
    user_id, err = _user_id()
    if err:
        return err
    limit = request.args.get("limit", default=20, type=int)
    cards = db.get_conduct_session_cards(user_id=user_id, limit=limit)
    if not cards:
        return jsonify({"cards": [], "message": "No conduct cards due."})
    return jsonify({"cards": cards, "total": len(cards)})


# ── Exam Simulator ────────────────────────────────────────────────────────────

@app.route("/api/study/exam", methods=["GET"])
@login_required
def study_exam():
    user_id, err = _user_id()
    if err:
        return err
    limit = request.args.get("limit", default=90, type=int)
    flk   = request.args.get("flk")
    cards = db.get_exam_cards(user_id=user_id, limit=limit, flk=flk or None)
    if not cards:
        return jsonify({"cards": [], "message": "No cards available."})
    return jsonify({"cards": cards, "total": len(cards)})


# ── Syllabus Map ──────────────────────────────────────────────────────────────

@app.route("/api/syllabus", methods=["GET"])
@login_required
def syllabus():
    user_id, err = _user_id()
    if err:
        return err
    return jsonify(db.get_full_syllabus(user_id))


# ── Card browser ─────────────────────────────────────────────────────────────

@app.route("/api/cards", methods=["GET"])
@login_required
def cards():
    # Card browser doesn't depend on user progress, so no user_id required
    query      = request.args.get("q", "").strip() or None
    subject_id = request.args.get("subject_id", type=int)
    card_type  = request.args.get("card_type",  type=int)
    results = db.search_cards(query, subject_id, card_type)
    return jsonify({"cards": results, "total": len(results)})


# ── Topic map ────────────────────────────────────────────────────────────────

@app.route("/api/subjects/<int:subject_id>/map", methods=["GET"])
@login_required
def subject_map(subject_id):
    user_id, err = _user_id()
    if err:
        return err
    topics = db.get_subject_map(subject_id, user_id)
    if not topics:
        return jsonify({"error": f"Subject {subject_id} not found or has no topics."}), 404
    return jsonify(topics)


# ── Dashboard stats ──────────────────────────────────────────────────────────

@app.route("/api/stats", methods=["GET"])
@login_required
def stats():
    user_id, err = _user_id()
    if err:
        return err
    return jsonify(db.get_stats(user_id))


# ── Progress overview ─────────────────────────────────────────────────────────

@app.route("/api/progress", methods=["GET"])
@login_required
def progress():
    user_id, err = _user_id()
    if err:
        return err
    return jsonify(db.get_overall_progress(user_id))


# ── Analytics ─────────────────────────────────────────────────────────────────

@app.route("/api/analytics", methods=["GET"])
@login_required
def analytics():
    user_id, err = _user_id()
    if err:
        return err
    return jsonify(db.get_analytics(user_id))


# ── MCQ routes ───────────────────────────────────────────────────────────────

@app.route("/api/mcq/subjects", methods=["GET"])
@login_required
def mcq_subjects():
    user_id, err = _user_id()
    if err:
        return err
    return jsonify(db.get_mcq_subjects_with_stats(user_id))


@app.route("/api/mcq/subject/<int:subject_id>", methods=["GET"])
@login_required
def mcq_subject(subject_id):
    user_id, err = _user_id()
    if err:
        return err
    questions = db.get_mcqs_for_subject(subject_id, user_id)
    return jsonify({"questions": questions, "total": len(questions)})


@app.route("/api/mcq/random", methods=["GET"])
@login_required
def mcq_random():
    user_id, err = _user_id()
    if err:
        return err
    subject_id = request.args.get("subject_id", type=int)
    flk        = request.args.get("flk")
    limit      = request.args.get("limit", default=10, type=int)
    questions  = db.get_random_mcqs(subject_id, flk, limit, user_id)
    if not questions:
        return jsonify({"questions": [], "message": "No MCQs available yet."})
    return jsonify({"questions": questions, "total": len(questions)})


@app.route("/api/mcq/attempt", methods=["POST"])
@login_required
def mcq_attempt():
    body = request.get_json(silent=True) or {}
    user_id, err = _user_id()
    if err:
        return err
    question_id = body.get("question_id", "").strip()
    selected    = body.get("selected", "").strip().upper()
    if not question_id or selected not in ("A", "B", "C", "D", "E"):
        return jsonify({"error": "question_id and selected (A/B/C/D/E) are required"}), 400
    with db.get_db() as conn:
        q = conn.execute(
            "SELECT correct FROM mcq_questions WHERE question_id = ?", (question_id,)
        ).fetchone()
    if not q:
        return jsonify({"error": f"Question '{question_id}' not found"}), 404
    correct = selected == q["correct"]
    result = db.record_mcq_attempt(user_id, question_id, selected, correct)
    result["correct_answer"] = q["correct"]
    return jsonify(result)


@app.route("/api/mcq/progress", methods=["GET"])
@login_required
def mcq_progress():
    user_id, err = _user_id()
    if err:
        return err
    return jsonify(db.get_mcq_progress(user_id))


# ── Dev entrypoint ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os
    db.init_db()
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_ENV") != "production"
    app.run(host="0.0.0.0", port=port, debug=debug)
