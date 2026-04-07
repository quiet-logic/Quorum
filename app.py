"""
app.py — Flask API for Quorum.

Routes only. All DB access goes through database.py.
All routes prefixed /api/. Root / serves the React build in production.
"""

from flask import Flask, jsonify, request, send_from_directory, Response
from datetime import date
import json
import os
import random

import database as db
from srs import sm2, next_review_date

app = Flask(__name__, static_folder="legal-study-app/dist", static_url_path="")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _user_id() -> tuple[int | None, object | None]:
    """Extract user_id from query string (GET) or JSON body (POST/PATCH).
    Returns (user_id, error_response) — one of which is None."""
    if request.method == 'GET':
        uid = request.args.get('user_id', type=int)
    else:
        body = request.get_json(silent=True) or {}
        uid = body.get('user_id')
    if not uid:
        return None, (jsonify({"error": "user_id is required"}), 400)
    return uid, None


# ── Production: serve React build ────────────────────────────────────────────

@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")


# ── User management ───────────────────────────────────────────────────────────

@app.route("/api/users", methods=["GET"])
def list_users():
    """List all profiles."""
    return jsonify(db.list_users())


@app.route("/api/users", methods=["POST"])
def create_user():
    """Create a new profile. Body: { name }"""
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    if len(name) > 40:
        return jsonify({"error": "name must be 40 characters or fewer"}), 400
    try:
        user = db.create_user(name)
        return jsonify(user), 201
    except Exception:
        return jsonify({"error": "A profile with that name already exists"}), 409


@app.route("/api/users/<int:user_id>", methods=["DELETE"])
def delete_user(user_id):
    """Delete a profile and all its progress/reviews."""
    deleted = db.delete_user(user_id)
    if not deleted:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"deleted": True})


@app.route("/api/users/<int:user_id>/export", methods=["GET"])
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
def subjects():
    user_id, err = _user_id()
    if err:
        return err
    return jsonify(db.get_subjects_with_progress(user_id))


# ── Study (due cards) ─────────────────────────────────────────────────────────

@app.route("/api/study/subject/<int:subject_id>", methods=["GET"])
def study_subject(subject_id):
    user_id, err = _user_id()
    if err:
        return err
    cards = db.get_due_cards_for_subject(subject_id, user_id)
    if not cards:
        return jsonify({"cards": [], "message": "No cards due for this subject."})
    return jsonify({"cards": cards})


@app.route("/api/study/subtopic/<int:subtopic_id>", methods=["GET"])
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
def syllabus():
    user_id, err = _user_id()
    if err:
        return err
    return jsonify(db.get_full_syllabus(user_id))


# ── Card browser ─────────────────────────────────────────────────────────────

@app.route("/api/cards", methods=["GET"])
def cards():
    # Card browser doesn't depend on user progress, so no user_id required
    query      = request.args.get("q", "").strip() or None
    subject_id = request.args.get("subject_id", type=int)
    card_type  = request.args.get("card_type",  type=int)
    results = db.search_cards(query, subject_id, card_type)
    return jsonify({"cards": results, "total": len(results)})


# ── Topic map ────────────────────────────────────────────────────────────────

@app.route("/api/subjects/<int:subject_id>/map", methods=["GET"])
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
def stats():
    user_id, err = _user_id()
    if err:
        return err
    return jsonify(db.get_stats(user_id))


# ── Progress overview ─────────────────────────────────────────────────────────

@app.route("/api/progress", methods=["GET"])
def progress():
    user_id, err = _user_id()
    if err:
        return err
    return jsonify(db.get_overall_progress(user_id))


# ── Analytics ─────────────────────────────────────────────────────────────────

@app.route("/api/analytics", methods=["GET"])
def analytics():
    user_id, err = _user_id()
    if err:
        return err
    return jsonify(db.get_analytics(user_id))


# ── Dev entrypoint ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os
    db.init_db()
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_ENV") != "production"
    app.run(host="0.0.0.0", port=port, debug=debug)
