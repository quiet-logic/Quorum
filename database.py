"""
database.py — all SQLite interaction for Quorum.

Convention: no SQL lives outside this module.
"""

import sqlite3
from datetime import date
from contextlib import contextmanager

import os
DB_PATH = os.environ.get("DB_PATH", "quorum.db")


# ── Connection ──────────────────────────────────────────────────────────────

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── Schema ───────────────────────────────────────────────────────────────────

def _migrate_schema(conn):
    """Add columns/tables introduced after the initial schema — safe to re-run."""
    # is_conduct on cards
    existing_cards = {row[1] for row in conn.execute("PRAGMA table_info(cards)").fetchall()}
    if 'is_conduct' not in existing_cards:
        conn.execute("ALTER TABLE cards ADD COLUMN is_conduct INTEGER NOT NULL DEFAULT 0")

    # user_id on progress/reviews — drop and recreate if missing (data not preserved by design)
    existing_prog = {row[1] for row in conn.execute("PRAGMA table_info(progress)").fetchall()}
    if 'user_id' not in existing_prog:
        conn.execute("DROP TABLE IF EXISTS reviews")
        conn.execute("DROP TABLE IF EXISTS progress")
        conn.execute("""
            CREATE TABLE progress (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                card_id       INTEGER NOT NULL REFERENCES cards(id),
                easiness      REAL    NOT NULL DEFAULT 2.5,
                interval      INTEGER NOT NULL DEFAULT 1,
                repetitions   INTEGER NOT NULL DEFAULT 0,
                next_review   TEXT    NOT NULL,
                last_reviewed TEXT,
                UNIQUE (user_id, card_id)
            )
        """)
        conn.execute("""
            CREATE TABLE reviews (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                card_id     INTEGER NOT NULL REFERENCES cards(id),
                score       INTEGER NOT NULL,
                reviewed_at TEXT    NOT NULL
            )
        """)


def init_db():
    """Create all tables if they don't already exist."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT    NOT NULL UNIQUE,
                theme      TEXT    NOT NULL DEFAULT 'default',
                created_at TEXT    NOT NULL
            );

            CREATE TABLE IF NOT EXISTS subjects (
                id   INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                abbr TEXT NOT NULL,
                flk  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS topics (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT    NOT NULL,
                subject_id INTEGER NOT NULL REFERENCES subjects(id),
                UNIQUE (name, subject_id)
            );

            CREATE TABLE IF NOT EXISTS subtopics (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                name     TEXT    NOT NULL,
                topic_id INTEGER NOT NULL REFERENCES topics(id),
                UNIQUE (name, topic_id)
            );

            CREATE TABLE IF NOT EXISTS cards (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                card_code    TEXT    UNIQUE NOT NULL,
                subtopic_id  INTEGER NOT NULL REFERENCES subtopics(id),
                card_type    INTEGER NOT NULL,
                difficulty   TEXT,
                flk          TEXT    NOT NULL,
                front        TEXT    NOT NULL,
                answer       TEXT,
                issue        TEXT,
                rule         TEXT,
                application  TEXT,
                conclusion   TEXT,
                summary_line TEXT,
                is_deeper    INTEGER NOT NULL DEFAULT 0,
                is_conduct   INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS progress (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                card_id       INTEGER NOT NULL REFERENCES cards(id),
                easiness      REAL    NOT NULL DEFAULT 2.5,
                interval      INTEGER NOT NULL DEFAULT 1,
                repetitions   INTEGER NOT NULL DEFAULT 0,
                next_review   TEXT    NOT NULL,
                last_reviewed TEXT,
                UNIQUE (user_id, card_id)
            );

            CREATE TABLE IF NOT EXISTS reviews (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                card_id     INTEGER NOT NULL REFERENCES cards(id),
                score       INTEGER NOT NULL,
                reviewed_at TEXT    NOT NULL
            );
        """)
        _migrate_schema(conn)


# ── User management ──────────────────────────────────────────────────────────

def list_users() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, name, theme, created_at FROM users ORDER BY created_at"
        ).fetchall()
        return [dict(r) for r in rows]


def get_user(user_id: int) -> dict | None:
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, name, theme, created_at FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        return dict(row) if row else None


def create_user(name: str) -> dict:
    from datetime import datetime
    created_at = datetime.utcnow().isoformat()
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO users (name, theme, created_at) VALUES (?, 'default', ?)",
            (name.strip(), created_at)
        )
        return {"id": cur.lastrowid, "name": name.strip(), "theme": "default", "created_at": created_at}


def delete_user(user_id: int) -> bool:
    with get_db() as conn:
        cur = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        return cur.rowcount > 0


def update_user_theme(user_id: int, theme: str):
    with get_db() as conn:
        conn.execute("UPDATE users SET theme = ? WHERE id = ?", (theme, user_id))


# ── Export / Import ──────────────────────────────────────────────────────────

def export_user_data(user_id: int) -> dict | None:
    with get_db() as conn:
        user = conn.execute(
            "SELECT id, name, theme, created_at FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if not user:
            return None

        progress_rows = conn.execute(
            """SELECT c.card_code, p.easiness, p.interval, p.repetitions,
                      p.next_review, p.last_reviewed
               FROM progress p
               JOIN cards c ON c.id = p.card_id
               WHERE p.user_id = ?""",
            (user_id,)
        ).fetchall()

        review_rows = conn.execute(
            """SELECT c.card_code, r.score, r.reviewed_at
               FROM reviews r
               JOIN cards c ON c.id = r.card_id
               WHERE r.user_id = ?""",
            (user_id,)
        ).fetchall()

        return {
            "version": 1,
            "user": dict(user),
            "progress": [dict(r) for r in progress_rows],
            "reviews": [dict(r) for r in review_rows],
        }


def import_user_data(user_id: int, data: dict) -> dict:
    with get_db() as conn:
        user = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            return {"error": "User not found"}

        if "user" in data and "theme" in data["user"]:
            conn.execute(
                "UPDATE users SET theme = ? WHERE id = ?",
                (data["user"]["theme"], user_id)
            )

        conn.execute("DELETE FROM reviews WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM progress WHERE user_id = ?", (user_id,))

        for p in data.get("progress", []):
            card = conn.execute(
                "SELECT id FROM cards WHERE card_code = ?", (p["card_code"],)
            ).fetchone()
            if not card:
                continue
            conn.execute(
                """INSERT INTO progress
                   (user_id, card_id, easiness, interval, repetitions, next_review, last_reviewed)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (user_id, card["id"], p["easiness"], p["interval"],
                 p["repetitions"], p["next_review"], p.get("last_reviewed"))
            )

        for r in data.get("reviews", []):
            card = conn.execute(
                "SELECT id FROM cards WHERE card_code = ?", (r["card_code"],)
            ).fetchone()
            if not card:
                continue
            conn.execute(
                "INSERT INTO reviews (user_id, card_id, score, reviewed_at) VALUES (?, ?, ?, ?)",
                (user_id, card["id"], r["score"], r["reviewed_at"])
            )

        return {"imported": True, "progress": len(data.get("progress", [])),
                "reviews": len(data.get("reviews", []))}


# ── Seed helpers (used by seed_data.py) ─────────────────────────────────────

def get_or_create_subject(conn, name: str, abbr: str, flk: str) -> int:
    row = conn.execute(
        "SELECT id FROM subjects WHERE name = ?", (name,)
    ).fetchone()
    if row:
        return row["id"]
    cur = conn.execute(
        "INSERT INTO subjects (name, abbr, flk) VALUES (?, ?, ?)",
        (name, abbr, flk)
    )
    return cur.lastrowid


def get_or_create_topic(conn, name: str, subject_id: int) -> int:
    row = conn.execute(
        "SELECT id FROM topics WHERE name = ? AND subject_id = ?",
        (name, subject_id)
    ).fetchone()
    if row:
        return row["id"]
    cur = conn.execute(
        "INSERT INTO topics (name, subject_id) VALUES (?, ?)",
        (name, subject_id)
    )
    return cur.lastrowid


def get_or_create_subtopic(conn, name: str, topic_id: int) -> int:
    row = conn.execute(
        "SELECT id FROM subtopics WHERE name = ? AND topic_id = ?",
        (name, topic_id)
    ).fetchone()
    if row:
        return row["id"]
    cur = conn.execute(
        "INSERT INTO subtopics (name, topic_id) VALUES (?, ?)",
        (name, topic_id)
    )
    return cur.lastrowid


def insert_card(conn, card_code, subtopic_id, card_type, difficulty, flk,
                front, answer, issue, rule, application, conclusion,
                summary_line, is_deeper, is_conduct=0) -> int | None:
    """Insert a card, skipping if card_code already exists. Returns new id or None."""
    existing = conn.execute(
        "SELECT id FROM cards WHERE card_code = ?", (card_code,)
    ).fetchone()
    if existing:
        return None
    cur = conn.execute(
        """INSERT INTO cards
           (card_code, subtopic_id, card_type, difficulty, flk, front, answer,
            issue, rule, application, conclusion, summary_line, is_deeper, is_conduct)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (card_code, subtopic_id, card_type, difficulty, flk, front, answer,
         issue, rule, application, conclusion, summary_line, is_deeper, is_conduct)
    )
    return cur.lastrowid


# ── Progress helpers ─────────────────────────────────────────────────────────

def get_or_create_progress(conn, card_id: int, user_id: int) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM progress WHERE card_id = ? AND user_id = ?", (card_id, user_id)
    ).fetchone()
    if row:
        return row
    today = date.today().isoformat()
    conn.execute(
        """INSERT INTO progress (user_id, card_id, easiness, interval, repetitions, next_review)
           VALUES (?, ?, 2.5, 1, 0, ?)""",
        (user_id, card_id, today)
    )
    return conn.execute(
        "SELECT * FROM progress WHERE card_id = ? AND user_id = ?", (card_id, user_id)
    ).fetchone()


def update_progress(conn, card_id: int, user_id: int, easiness: float, interval: int,
                    repetitions: int, next_review: str):
    today = date.today().isoformat()
    conn.execute(
        """UPDATE progress
           SET easiness = ?, interval = ?, repetitions = ?,
               next_review = ?, last_reviewed = ?
           WHERE card_id = ? AND user_id = ?""",
        (easiness, interval, repetitions, next_review, today, card_id, user_id)
    )


# ── API query functions ───────────────────────────────────────────────────────

def get_subjects_with_progress(user_id: int) -> list[dict]:
    """
    Return all subjects with card counts and progress for a specific user.
    Progress % = reviewed cards (repetitions > 0) / total trackable cards.
    Due count = cards with next_review <= today (or never reviewed by this user).
    Type 4 (is_deeper) cards are excluded from tracking per spec.
    """
    today = date.today().isoformat()
    with get_db() as conn:
        subjects = conn.execute(
            "SELECT id, name, abbr, flk FROM subjects ORDER BY flk, name"
        ).fetchall()

        result = []
        for s in subjects:
            total = conn.execute(
                """SELECT COUNT(*) as n FROM cards c
                   JOIN subtopics st ON c.subtopic_id = st.id
                   JOIN topics t     ON st.topic_id   = t.id
                   WHERE t.subject_id = ? AND c.is_deeper = 0""",
                (s["id"],)
            ).fetchone()["n"]

            reviewed = conn.execute(
                """SELECT COUNT(*) as n FROM cards c
                   JOIN subtopics st ON c.subtopic_id = st.id
                   JOIN topics t     ON st.topic_id   = t.id
                   JOIN progress p   ON p.card_id     = c.id AND p.user_id = ?
                   WHERE t.subject_id = ? AND c.is_deeper = 0
                     AND p.repetitions > 0""",
                (user_id, s["id"])
            ).fetchone()["n"]

            due_reviewed = conn.execute(
                """SELECT COUNT(*) as n FROM cards c
                   JOIN subtopics st ON c.subtopic_id = st.id
                   JOIN topics t     ON st.topic_id   = t.id
                   JOIN progress p   ON p.card_id     = c.id AND p.user_id = ?
                   WHERE t.subject_id = ? AND c.is_deeper = 0
                     AND p.next_review <= ?""",
                (user_id, s["id"], today)
            ).fetchone()["n"]

            due_new = conn.execute(
                """SELECT COUNT(*) as n FROM cards c
                   JOIN subtopics st ON c.subtopic_id = st.id
                   JOIN topics t     ON st.topic_id   = t.id
                   LEFT JOIN progress p ON p.card_id  = c.id AND p.user_id = ?
                   WHERE t.subject_id = ? AND c.is_deeper = 0
                     AND p.id IS NULL""",
                (user_id, s["id"])
            ).fetchone()["n"]

            progress_pct = round((reviewed / total * 100) if total else 0)

            result.append({
                "id": s["id"],
                "name": s["name"],
                "abbr": s["abbr"],
                "flk": s["flk"],
                "total_cards": total,
                "reviewed": reviewed,
                "due_cards": due_reviewed + due_new,
                "progress_pct": progress_pct,
            })

        return result


def get_due_cards_for_subject(subject_id: int, user_id: int) -> list[dict]:
    today = date.today().isoformat()
    with get_db() as conn:
        rows = conn.execute(
            """SELECT c.*,
                      st.name AS subtopic_name,
                      t.name  AS topic_name,
                      s.name  AS subject_name,
                      p.easiness, p.interval, p.repetitions, p.next_review
               FROM cards c
               JOIN subtopics st ON c.subtopic_id = st.id
               JOIN topics    t  ON st.topic_id   = t.id
               JOIN subjects  s  ON t.subject_id  = s.id
               LEFT JOIN progress p ON p.card_id  = c.id AND p.user_id = ?
               WHERE s.id = ?
                 AND c.is_deeper = 0
                 AND (p.id IS NULL OR p.next_review <= ?)
               ORDER BY
                 CASE WHEN p.id IS NULL THEN 0 ELSE 1 END,
                 p.next_review ASC""",
            (user_id, subject_id, today)
        ).fetchall()
        return [dict(r) for r in rows]


def get_due_cards_for_subtopic(subtopic_id: int, user_id: int) -> list[dict]:
    today = date.today().isoformat()
    with get_db() as conn:
        rows = conn.execute(
            """SELECT c.*,
                      st.name AS subtopic_name,
                      t.name  AS topic_name,
                      s.name  AS subject_name,
                      p.easiness, p.interval, p.repetitions, p.next_review
               FROM cards c
               JOIN subtopics st ON c.subtopic_id = st.id
               JOIN topics    t  ON st.topic_id   = t.id
               JOIN subjects  s  ON t.subject_id  = s.id
               LEFT JOIN progress p ON p.card_id  = c.id AND p.user_id = ?
               WHERE st.id = ?
                 AND c.is_deeper = 0
                 AND (p.id IS NULL OR p.next_review <= ?)
               ORDER BY
                 CASE WHEN p.id IS NULL THEN 0 ELSE 1 END,
                 p.next_review ASC""",
            (user_id, subtopic_id, today)
        ).fetchall()
        return [dict(r) for r in rows]


def get_card(card_id: int) -> dict | None:
    with get_db() as conn:
        row = conn.execute(
            """SELECT c.*,
                      st.name AS subtopic_name,
                      t.name  AS topic_name,
                      s.name  AS subject_name
               FROM cards c
               JOIN subtopics st ON c.subtopic_id = st.id
               JOIN topics    t  ON st.topic_id   = t.id
               JOIN subjects  s  ON t.subject_id  = s.id
               WHERE c.id = ?""",
            (card_id,)
        ).fetchone()
        return dict(row) if row else None


def get_card_by_code(card_code: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute(
            """SELECT c.*,
                      st.name AS subtopic_name,
                      t.name  AS topic_name,
                      s.name  AS subject_name
               FROM cards c
               JOIN subtopics st ON c.subtopic_id = st.id
               JOIN topics    t  ON st.topic_id   = t.id
               JOIN subjects  s  ON t.subject_id  = s.id
               WHERE c.card_code = ?""",
            (card_code,)
        ).fetchone()
        return dict(row) if row else None


def insert_review(conn, card_id: int, score: int, user_id: int):
    """Record a single review event in the reviews history table."""
    from datetime import datetime
    conn.execute(
        "INSERT INTO reviews (user_id, card_id, score, reviewed_at) VALUES (?, ?, ?, ?)",
        (user_id, card_id, score, datetime.utcnow().isoformat())
    )


def get_subject_map(subject_id: int, user_id: int) -> list[dict]:
    today = date.today().isoformat()
    with get_db() as conn:
        topics = conn.execute(
            "SELECT id, name FROM topics WHERE subject_id = ? ORDER BY name",
            (subject_id,)
        ).fetchall()

        result = []
        for t in topics:
            subtopics = conn.execute(
                """SELECT st.id,
                          st.name,
                          COUNT(c.id)                                                              AS total_cards,
                          COUNT(CASE WHEN p.id IS NULL OR p.next_review <= ? THEN 1 END)          AS due_cards,
                          COUNT(CASE WHEN p.repetitions > 0                  THEN 1 END)          AS reviewed_cards
                   FROM subtopics st
                   JOIN cards c ON c.subtopic_id = st.id
                   LEFT JOIN progress p ON p.card_id = c.id AND p.user_id = ?
                   WHERE st.topic_id = ? AND c.is_deeper = 0
                   GROUP BY st.id, st.name
                   ORDER BY st.name""",
                (today, user_id, t["id"])
            ).fetchall()

            subs = [dict(s) for s in subtopics]
            result.append({
                "id":             t["id"],
                "name":           t["name"],
                "total_cards":    sum(s["total_cards"]    for s in subs),
                "due_cards":      sum(s["due_cards"]      for s in subs),
                "reviewed_cards": sum(s["reviewed_cards"] for s in subs),
                "subtopics":      subs,
            })

        return result


def _diff_rank_sql(advanced: bool) -> str:
    if advanced:
        return """CASE c.difficulty
            WHEN 'Complex'     THEN 1
            WHEN 'Application' THEN 2
            WHEN 'Foundation'  THEN 4
            ELSE 3 END"""
    return """CASE c.difficulty
        WHEN 'Foundation'  THEN 1
        WHEN 'Application' THEN 3
        WHEN 'Complex'     THEN 4
        ELSE 2 END"""


def get_session_cards(user_id: int, subject_id=None, topic_id=None, flk=None,
                      limit=15, include_deeper=False) -> list[dict]:
    today = date.today().isoformat()
    with get_db() as conn:
        conditions: list[str] = []
        scope_params: list    = []

        if subject_id is not None:
            conditions.append("t.subject_id = ?")
            scope_params.append(subject_id)
        elif topic_id is not None:
            conditions.append("st.topic_id = ?")
            scope_params.append(topic_id)

        if flk is not None:
            conditions.append("c.flk = ?")
            scope_params.append(flk)

        scope_clause = " AND ".join(conditions) if conditions else "1 = 1"
        deeper_clause = "" if include_deeper else "AND c.is_deeper = 0"

        avg_row = conn.execute(
            f"""SELECT AVG(p.repetitions) AS avg_reps
                  FROM cards c
                  JOIN subtopics st ON c.subtopic_id = st.id
                  JOIN topics    t  ON st.topic_id   = t.id
                  LEFT JOIN progress p ON p.card_id  = c.id AND p.user_id = ?
                 WHERE {scope_clause}
                   {deeper_clause}
                   AND p.repetitions IS NOT NULL""",
            [user_id, *scope_params],
        ).fetchone()
        diff_rank = _diff_rank_sql((avg_row["avg_reps"] or 0.0) >= 3.0)

        if flk and subject_id is None and topic_id is None:
            rows = conn.execute(
                f"""WITH ranked AS (
                        SELECT c.*,
                               st.name AS subtopic_name,
                               t.name  AS topic_name,
                               s.name  AS subject_name,
                               s.id    AS subject_db_id,
                               p.easiness, p.interval, p.repetitions, p.next_review,
                               ROW_NUMBER() OVER (
                                   PARTITION BY s.id
                                   ORDER BY ({diff_rank}),
                                            COALESCE(p.next_review, '0000-00-00') ASC
                               ) AS rn
                          FROM cards c
                          JOIN subtopics st ON c.subtopic_id = st.id
                          JOIN topics    t  ON st.topic_id   = t.id
                          JOIN subjects  s  ON t.subject_id  = s.id
                          LEFT JOIN progress p ON p.card_id  = c.id AND p.user_id = ?
                         WHERE c.flk = ?
                           {deeper_clause}
                           AND (p.id IS NULL OR p.next_review <= ?)
                    )
                    SELECT * FROM ranked
                     ORDER BY rn, subject_db_id
                     LIMIT ?""",
                (user_id, flk, today, limit),
            ).fetchall()
            return [dict(r) for r in rows]

        rows = conn.execute(
            f"""SELECT c.*,
                       st.name AS subtopic_name,
                       t.name  AS topic_name,
                       s.name  AS subject_name,
                       p.easiness, p.interval, p.repetitions, p.next_review
                  FROM cards c
                  JOIN subtopics st ON c.subtopic_id = st.id
                  JOIN topics    t  ON st.topic_id   = t.id
                  JOIN subjects  s  ON t.subject_id  = s.id
                  LEFT JOIN progress p ON p.card_id  = c.id AND p.user_id = ?
                 WHERE {scope_clause}
                   {deeper_clause}
                   AND (p.id IS NULL OR p.next_review <= ?)
                 ORDER BY ({diff_rank}),
                          COALESCE(p.next_review, '0000-00-00') ASC
                 LIMIT ?""",
            [user_id, *scope_params, today, limit],
        ).fetchall()

        return [dict(r) for r in rows]


def get_due_pc_cards(user_id: int, limit: int = 2) -> list[dict]:
    today = date.today().isoformat()
    with get_db() as conn:
        pc = conn.execute(
            "SELECT id FROM subjects WHERE abbr = 'PC'"
        ).fetchone()
        if not pc:
            return []
        rows = conn.execute(
            """SELECT c.*,
                      st.name AS subtopic_name,
                      t.name  AS topic_name,
                      s.name  AS subject_name,
                      p.easiness, p.interval, p.repetitions, p.next_review
               FROM cards c
               JOIN subtopics st ON c.subtopic_id = st.id
               JOIN topics    t  ON st.topic_id   = t.id
               JOIN subjects  s  ON t.subject_id  = s.id
               LEFT JOIN progress p ON p.card_id  = c.id AND p.user_id = ?
               WHERE s.id = ? AND c.is_deeper = 0
                 AND (p.id IS NULL OR p.next_review <= ?)
               ORDER BY RANDOM()
               LIMIT ?""",
            (user_id, pc["id"], today, limit),
        ).fetchall()
        return [dict(r) for r in rows]


def get_conduct_session_cards(user_id: int, limit: int = 20) -> list[dict]:
    today = date.today().isoformat()
    with get_db() as conn:
        pc = conn.execute(
            "SELECT id FROM subjects WHERE abbr = 'PC'"
        ).fetchone()
        if not pc:
            return []
        rows = conn.execute(
            """SELECT c.*,
                      st.name AS subtopic_name,
                      t.name  AS topic_name,
                      s.name  AS subject_name,
                      p.easiness, p.interval, p.repetitions, p.next_review
               FROM cards c
               JOIN subtopics st ON c.subtopic_id = st.id
               JOIN topics    t  ON st.topic_id   = t.id
               JOIN subjects  s  ON t.subject_id  = s.id
               LEFT JOIN progress p ON p.card_id  = c.id AND p.user_id = ?
               WHERE s.id = ? AND c.is_deeper = 0
                 AND (p.id IS NULL OR p.next_review <= ?)
               ORDER BY COALESCE(p.next_review, '0000-00-00') ASC
               LIMIT ?""",
            (user_id, pc["id"], today, limit),
        ).fetchall()
        return [dict(r) for r in rows]


def get_exam_cards(user_id: int, limit: int = 90, flk: str | None = None) -> list[dict]:
    import random as _random

    with get_db() as conn:
        flk_clause = "AND c.flk = ?" if flk else ""
        params_base = [flk] if flk else []

        subjects = conn.execute(
            f"""SELECT s.id, COUNT(c.id) AS card_count
                  FROM cards c
                  JOIN subtopics st ON c.subtopic_id = st.id
                  JOIN topics    t  ON st.topic_id   = t.id
                  JOIN subjects  s  ON t.subject_id  = s.id
                 WHERE c.is_deeper = 0 {flk_clause}
                 GROUP BY s.id""",
            params_base,
        ).fetchall()

        total_pool = sum(s["card_count"] for s in subjects)
        if not total_pool:
            return []

        result = []
        remaining = limit

        for i, s in enumerate(subjects):
            n = remaining if i == len(subjects) - 1 else round(s["card_count"] / total_pool * limit)
            remaining -= n
            if n <= 0:
                continue
            rows = conn.execute(
                """SELECT c.*,
                          st.name AS subtopic_name,
                          t.name  AS topic_name,
                          s.name  AS subject_name,
                          p.easiness, p.interval, p.repetitions, p.next_review
                     FROM cards c
                     JOIN subtopics st ON c.subtopic_id = st.id
                     JOIN topics    t  ON st.topic_id   = t.id
                     JOIN subjects  s  ON t.subject_id  = s.id
                     LEFT JOIN progress p ON p.card_id  = c.id AND p.user_id = ?
                    WHERE s.id = ? AND c.is_deeper = 0
                    ORDER BY RANDOM()
                    LIMIT ?""",
                (user_id, s["id"], n),
            ).fetchall()
            result.extend([dict(r) for r in rows])

        _random.shuffle(result)
        return result


def get_full_syllabus(user_id: int) -> list[dict]:
    subjects = get_subjects_with_progress(user_id)
    result = []
    for s in subjects:
        topics = get_subject_map(s["id"], user_id)
        result.append({**s, "topics": topics})
    return result


def search_cards(query: str | None, subject_id: int | None, card_type: int | None) -> list[dict]:
    with get_db() as conn:
        conditions = []
        params: list = []

        if query and query.strip():
            term = f"%{query.strip()}%"
            conditions.append(
                """(c.front        LIKE ? OR c.answer      LIKE ?
                 OR c.issue        LIKE ? OR c.rule        LIKE ?
                 OR c.application  LIKE ? OR c.conclusion  LIKE ?
                 OR c.summary_line LIKE ?)"""
            )
            params.extend([term] * 7)

        if subject_id is not None:
            conditions.append("s.id = ?")
            params.append(subject_id)

        if card_type is not None:
            conditions.append("c.card_type = ?")
            params.append(card_type)

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        rows = conn.execute(
            f"""SELECT c.*,
                       st.name AS subtopic_name,
                       t.name  AS topic_name,
                       s.name  AS subject_name,
                       s.abbr  AS subject_abbr,
                       s.id    AS subject_db_id
                FROM cards c
                JOIN subtopics st ON c.subtopic_id = st.id
                JOIN topics    t  ON st.topic_id   = t.id
                JOIN subjects  s  ON t.subject_id  = s.id
                {where}
                ORDER BY s.name, t.name, c.card_code
                LIMIT 150""",
            params
        ).fetchall()

        return [dict(r) for r in rows]


def get_stats(user_id: int) -> dict:
    from datetime import timedelta

    with get_db() as conn:
        all_time = conn.execute(
            "SELECT COUNT(*) AS n FROM reviews WHERE user_id = ?", (user_id,)
        ).fetchone()["n"]

        today_str = date.today().isoformat()
        today = conn.execute(
            "SELECT COUNT(*) AS n FROM reviews WHERE user_id = ? AND DATE(reviewed_at) = ?",
            (user_id, today_str)
        ).fetchone()["n"]

        correct = conn.execute(
            "SELECT COUNT(*) AS n FROM reviews WHERE user_id = ? AND score >= 3",
            (user_id,)
        ).fetchone()["n"]
        accuracy = round((correct / all_time * 100) if all_time else 0)

        days = {
            row["day"] for row in conn.execute(
                "SELECT DISTINCT DATE(reviewed_at) AS day FROM reviews WHERE user_id = ?",
                (user_id,)
            ).fetchall()
        }
        streak = 0
        current = date.today()
        if today_str not in days:
            current -= timedelta(days=1)
        while current.isoformat() in days:
            streak += 1
            current -= timedelta(days=1)

        return {
            "streak":   streak,
            "today":    today,
            "accuracy": accuracy,
            "all_time": all_time,
        }


def get_overall_progress(user_id: int) -> list[dict]:
    return get_subjects_with_progress(user_id)


def get_analytics(user_id: int) -> dict:
    from datetime import timedelta

    today = date.today()

    with get_db() as conn:
        since_60 = (today - timedelta(days=59)).isoformat()
        heatmap_rows = conn.execute(
            """SELECT DATE(reviewed_at) AS day, COUNT(*) AS count
                 FROM reviews
                WHERE user_id = ? AND DATE(reviewed_at) >= ?
                GROUP BY day
                ORDER BY day""",
            (user_id, since_60),
        ).fetchall()
        heatmap = [{"date": r["day"], "count": r["count"]} for r in heatmap_rows]

        since_30 = (today - timedelta(days=29)).isoformat()
        retention_rows = conn.execute(
            """SELECT DATE(reviewed_at) AS day,
                      ROUND(100.0 * SUM(CASE WHEN score >= 3 THEN 1 ELSE 0 END) / COUNT(*)) AS pct
                 FROM reviews
                WHERE user_id = ? AND DATE(reviewed_at) >= ?
                GROUP BY day
               HAVING COUNT(*) >= 1
                ORDER BY day""",
            (user_id, since_30),
        ).fetchall()
        retention = [{"date": r["day"], "pct": r["pct"]} for r in retention_rows]

        forecast = []
        for offset in range(7):
            day = today + timedelta(days=offset)
            day_str = day.isoformat()
            due = conn.execute(
                """SELECT COUNT(*) AS n FROM progress
                    WHERE user_id = ? AND next_review = ? AND repetitions >= 0""",
                (user_id, day_str),
            ).fetchone()["n"]
            if offset == 0:
                new_cards = conn.execute(
                    """SELECT COUNT(*) AS n FROM cards c
                        LEFT JOIN progress p ON p.card_id = c.id AND p.user_id = ?
                        WHERE p.id IS NULL AND c.is_deeper = 0""",
                    (user_id,)
                ).fetchone()["n"]
                due += new_cards
            forecast.append({"date": day_str, "due": due})

        weak_rows = conn.execute(
            """SELECT s.name AS subject,
                      t.name AS topic,
                      ROUND(AVG(r.score), 2) AS avg_score,
                      COUNT(r.id) AS reviews
                 FROM reviews r
                 JOIN cards c     ON c.id          = r.card_id
                 JOIN subtopics st ON st.id         = c.subtopic_id
                 JOIN topics t    ON t.id           = st.topic_id
                 JOIN subjects s  ON s.id           = t.subject_id
                WHERE r.user_id = ?
                GROUP BY t.id
               HAVING COUNT(r.id) >= 3
                ORDER BY avg_score ASC
                LIMIT 10""",
            (user_id,),
        ).fetchall()
        weak_topics = [dict(r) for r in weak_rows]

    return {
        "heatmap":     heatmap,
        "retention":   retention,
        "forecast":    forecast,
        "weak_topics": weak_topics,
    }
