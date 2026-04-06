"""
app.py — Flask API for Quorum.

Routes only. All DB access goes through database.py.
All routes prefixed /api/. Root / serves the React build in production.
"""

from flask import Flask, jsonify, request, send_from_directory
from datetime import date
import os

import database as db
from srs import sm2, next_review_date

app = Flask(__name__, static_folder="legal-study-app/dist", static_url_path="")


# ── Production: serve React build ────────────────────────────────────────────

@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")


# ── Subjects ──────────────────────────────────────────────────────────────────

@app.route("/api/subjects", methods=["GET"])
def subjects():
    """All subjects with card counts, due counts, and progress %."""
    return jsonify(db.get_subjects_with_progress())


# ── Study (due cards) ─────────────────────────────────────────────────────────

@app.route("/api/study/subject/<int:subject_id>", methods=["GET"])
def study_subject(subject_id):
    """Next due cards for a subject (new cards first, then by next_review)."""
    cards = db.get_due_cards_for_subject(subject_id)
    if not cards:
        return jsonify({"cards": [], "message": "No cards due for this subject."})
    return jsonify({"cards": cards})


@app.route("/api/study/subtopic/<int:subtopic_id>", methods=["GET"])
def study_subtopic(subtopic_id):
    """Next due cards for a specific subtopic."""
    cards = db.get_due_cards_for_subtopic(subtopic_id)
    if not cards:
        return jsonify({"cards": [], "message": "No cards due for this subtopic."})
    return jsonify({"cards": cards})


# ── Review (submit SM-2 rating) ───────────────────────────────────────────────

@app.route("/api/review", methods=["POST"])
def review():
    """
    Submit a rating for a card and update its SRS schedule.

    Expected body (use either card_id or card_code):
        { "card_code": "FLK1-CON-001", "score": <0-5> }
        { "card_id": <int>,            "score": <0-5> }

    Returns the updated progress record.
    """
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Request body must be JSON."}), 400

    score = body.get("score")
    if score is None:
        return jsonify({"error": "score is required."}), 400
    if not isinstance(score, int) or score < 0 or score > 5:
        return jsonify({"error": "score must be an integer 0–5."}), 400

    # Resolve card — accept either card_code (frontend) or card_id (direct API use)
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
        progress = db.get_or_create_progress(conn, card_id)

        new_ef, new_interval, new_reps = sm2(
            easiness=progress["easiness"],
            interval=progress["interval"],
            repetitions=progress["repetitions"],
            score=score,
        )

        next_review = next_review_date(new_interval).isoformat()

        db.update_progress(conn, card_id, new_ef, new_interval, new_reps, next_review)
        db.insert_review(conn, card_id, score)

    return jsonify({
        "card_id": card_id,
        "easiness": round(new_ef, 4),
        "interval": new_interval,
        "repetitions": new_reps,
        "next_review": next_review,
    })


# ── Smart study session ───────────────────────────────────────────────────────

@app.route("/api/study/session", methods=["GET"])
def study_session():
    """
    Return a difficulty-scaled session of up to `limit` due cards.

    Query params:
        subject_id — integer, session for one subject (optional)
        topic_id   — integer, session for one topic (optional)
        limit      — integer, max cards returned (default 15)

    Pass subject_id OR topic_id, or neither for a cross-subject session.
    """
    subject_id = request.args.get("subject_id", type=int)
    topic_id   = request.args.get("topic_id",   type=int)
    flk        = request.args.get("flk")         # 'FLK1' or 'FLK2'
    limit      = request.args.get("limit", default=15, type=int)

    cards = db.get_session_cards(subject_id=subject_id, topic_id=topic_id, flk=flk, limit=limit)
    return jsonify({"cards": cards, "total": len(cards)})


# ── Card browser ─────────────────────────────────────────────────────────────

@app.route("/api/cards", methods=["GET"])
def cards():
    """
    Search cards with optional filters.

    Query params:
        q          — text search across front, answer, IRAC fields, summary_line
        subject_id — integer, filter to one subject
        card_type  — integer 1–5, filter by card type
    """
    query      = request.args.get("q", "").strip() or None
    subject_id = request.args.get("subject_id", type=int)
    card_type  = request.args.get("card_type",  type=int)

    results = db.search_cards(query, subject_id, card_type)
    return jsonify({"cards": results, "total": len(results)})


# ── Topic map ────────────────────────────────────────────────────────────────

@app.route("/api/subjects/<int:subject_id>/map", methods=["GET"])
def subject_map(subject_id):
    """Full topic/subtopic tree for a subject with per-node progress data."""
    topics = db.get_subject_map(subject_id)
    if not topics:
        return jsonify({"error": f"Subject {subject_id} not found or has no topics."}), 404
    return jsonify(topics)


# ── Dashboard stats ──────────────────────────────────────────────────────────

@app.route("/api/stats", methods=["GET"])
def stats():
    """Streak, today's count, accuracy %, and all-time review count."""
    return jsonify(db.get_stats())


# ── Progress overview ─────────────────────────────────────────────────────────

@app.route("/api/progress", methods=["GET"])
def progress():
    """Overall progress per subject."""
    return jsonify(db.get_overall_progress())


# ── Dev entrypoint ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os
    db.init_db()
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_ENV") != "production"
    app.run(host="0.0.0.0", port=port, debug=debug)
