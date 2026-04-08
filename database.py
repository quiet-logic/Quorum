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
    # ── accounts table (auth layer, separate from profiles/users) ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            email           TEXT    NOT NULL UNIQUE,
            password_hash   TEXT,
            email_verified  INTEGER NOT NULL DEFAULT 0,
            invite_code     TEXT,
            auth0_sub       TEXT    UNIQUE,
            created_at      TEXT    NOT NULL
        )
    """)

    # ── invite codes ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS invite_codes (
            code        TEXT    PRIMARY KEY,
            max_uses    INTEGER NOT NULL DEFAULT 1,
            used_count  INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT    NOT NULL,
            expires_at  TEXT
        )
    """)

    # ── password reset tokens ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            token       TEXT    PRIMARY KEY,
            account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            expires_at  TEXT    NOT NULL,
            used        INTEGER NOT NULL DEFAULT 0
        )
    """)

    # ── email verification tokens ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS email_verification_tokens (
            token       TEXT    PRIMARY KEY,
            account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            expires_at  TEXT    NOT NULL
        )
    """)

    # ── account_id on users (profiles) ──
    existing_users = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    if 'account_id' not in existing_users:
        conn.execute("ALTER TABLE users ADD COLUMN account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE")
    if 'avatar_seed' not in existing_users:
        conn.execute("ALTER TABLE users ADD COLUMN avatar_seed TEXT")
    if 'last_active' not in existing_users:
        conn.execute("ALTER TABLE users ADD COLUMN last_active TEXT")

    # is_conduct on cards
    existing_cards = {row[1] for row in conn.execute("PRAGMA table_info(cards)").fetchall()}
    if 'is_conduct' not in existing_cards:
        conn.execute("ALTER TABLE cards ADD COLUMN is_conduct INTEGER NOT NULL DEFAULT 0")

    # ── Stripe / billing columns on accounts ──
    existing_accounts = {row[1] for row in conn.execute("PRAGMA table_info(accounts)").fetchall()}
    if 'stripe_customer_id' not in existing_accounts:
        conn.execute("ALTER TABLE accounts ADD COLUMN stripe_customer_id TEXT")
    if 'subscription_status' not in existing_accounts:
        conn.execute("ALTER TABLE accounts ADD COLUMN subscription_status TEXT")
    if 'trial_ends_at' not in existing_accounts:
        conn.execute("ALTER TABLE accounts ADD COLUMN trial_ends_at TEXT")
    if 'invite_free_access' not in existing_accounts:
        conn.execute("ALTER TABLE accounts ADD COLUMN invite_free_access INTEGER NOT NULL DEFAULT 0")
        # Backfill: any existing account with an invite code gets free access
        conn.execute(
            "UPDATE accounts SET invite_free_access = 1 WHERE invite_code IS NOT NULL AND invite_code != ''"
        )

    # ── Stripe webhook deduplication ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS stripe_events (
            event_id     TEXT PRIMARY KEY,
            processed_at TEXT NOT NULL
        )
    """)

    # ── MCQ tables ──
    conn.execute("""
        CREATE TABLE IF NOT EXISTS mcq_questions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            question_id TEXT    NOT NULL UNIQUE,
            subtopic_id INTEGER REFERENCES subtopics(id),
            flk         TEXT    NOT NULL,
            difficulty  TEXT,
            stem        TEXT    NOT NULL,
            option_a    TEXT    NOT NULL,
            option_b    TEXT    NOT NULL,
            option_c    TEXT    NOT NULL,
            option_d    TEXT    NOT NULL,
            correct     TEXT    NOT NULL,
            explanation TEXT    NOT NULL,
            card_refs   TEXT,
            flag        INTEGER NOT NULL DEFAULT 0,
            generated_by TEXT   NOT NULL DEFAULT 'human'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS mcq_attempts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            question_id TEXT    NOT NULL REFERENCES mcq_questions(question_id),
            selected    TEXT    NOT NULL,
            correct     INTEGER NOT NULL,
            attempted_at TEXT   NOT NULL
        )
    """)

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


# ── Account management (auth layer) ─────────────────────────────────────────

_ACCOUNT_COLS = """
    id, email, password_hash, email_verified, auth0_sub, created_at,
    stripe_customer_id, subscription_status, trial_ends_at, invite_free_access
"""


def get_account(account_id: int) -> dict | None:
    with get_db() as conn:
        row = conn.execute(
            f"SELECT {_ACCOUNT_COLS} FROM accounts WHERE id = ?",
            (account_id,)
        ).fetchone()
        return dict(row) if row else None


def get_account_by_email(email: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute(
            f"SELECT {_ACCOUNT_COLS} FROM accounts WHERE email = ?",
            (email.strip().lower(),)
        ).fetchone()
        return dict(row) if row else None


def get_account_by_customer_id(customer_id: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute(
            f"SELECT {_ACCOUNT_COLS} FROM accounts WHERE stripe_customer_id = ?",
            (customer_id,)
        ).fetchone()
        return dict(row) if row else None


def create_account(
    email: str,
    password_hash: str,
    invite_code: str | None = None,
    invite_free_access: int = 0,
    trial_ends_at: str | None = None,
) -> dict:
    from datetime import datetime
    created_at = datetime.utcnow().isoformat()
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO accounts
               (email, password_hash, invite_code, invite_free_access, trial_ends_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (email.strip().lower(), password_hash, invite_code,
             invite_free_access, trial_ends_at, created_at)
        )
        return {
            "id": cur.lastrowid, "email": email.strip().lower(),
            "email_verified": 0, "invite_free_access": invite_free_access,
            "trial_ends_at": trial_ends_at, "created_at": created_at,
        }


def set_email_verified(account_id: int):
    with get_db() as conn:
        conn.execute("UPDATE accounts SET email_verified = 1 WHERE id = ?", (account_id,))


def update_account_password(account_id: int, password_hash: str):
    with get_db() as conn:
        conn.execute("UPDATE accounts SET password_hash = ? WHERE id = ?", (password_hash, account_id))


# ── Invite codes ──────────────────────────────────────────────────────────────

def get_invite_code(code: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute(
            "SELECT code, max_uses, used_count, expires_at FROM invite_codes WHERE code = ?",
            (code,)
        ).fetchone()
        return dict(row) if row else None


def use_invite_code(code: str):
    with get_db() as conn:
        conn.execute("UPDATE invite_codes SET used_count = used_count + 1 WHERE code = ?", (code,))


def create_invite_codes(codes: list[str], max_uses: int = 1, expires_at: str | None = None):
    from datetime import datetime
    created_at = datetime.utcnow().isoformat()
    with get_db() as conn:
        conn.executemany(
            "INSERT OR IGNORE INTO invite_codes (code, max_uses, used_count, created_at, expires_at) VALUES (?, ?, 0, ?, ?)",
            [(c, max_uses, created_at, expires_at) for c in codes]
        )


def list_invite_codes() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT code, max_uses, used_count, created_at, expires_at FROM invite_codes ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


# ── Auth tokens ───────────────────────────────────────────────────────────────

def create_verification_token(account_id: int, token: str, expires_at: str):
    with get_db() as conn:
        conn.execute("DELETE FROM email_verification_tokens WHERE account_id = ?", (account_id,))
        conn.execute(
            "INSERT INTO email_verification_tokens (token, account_id, expires_at) VALUES (?, ?, ?)",
            (token, account_id, expires_at)
        )


def consume_verification_token(token: str) -> int | None:
    """Return account_id if token is valid and unexpired, else None. Deletes on success."""
    from datetime import datetime
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        row = conn.execute(
            "SELECT account_id, expires_at FROM email_verification_tokens WHERE token = ?",
            (token,)
        ).fetchone()
        if not row or row["expires_at"] < now:
            return None
        conn.execute("DELETE FROM email_verification_tokens WHERE token = ?", (token,))
        return row["account_id"]


def create_reset_token(account_id: int, token: str, expires_at: str):
    with get_db() as conn:
        conn.execute("DELETE FROM password_reset_tokens WHERE account_id = ?", (account_id,))
        conn.execute(
            "INSERT INTO password_reset_tokens (token, account_id, expires_at) VALUES (?, ?, ?)",
            (token, account_id, expires_at)
        )


def consume_reset_token(token: str) -> int | None:
    """Return account_id if token is valid, unexpired, and unused. Marks used."""
    from datetime import datetime
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        row = conn.execute(
            "SELECT account_id, expires_at, used FROM password_reset_tokens WHERE token = ?",
            (token,)
        ).fetchone()
        if not row or row["used"] or row["expires_at"] < now:
            return None
        conn.execute("UPDATE password_reset_tokens SET used = 1 WHERE token = ?", (token,))
        return row["account_id"]


# ── User management ──────────────────────────────────────────────────────────

def list_users(account_id: int | None = None) -> list[dict]:
    with get_db() as conn:
        if account_id is not None:
            rows = conn.execute(
                "SELECT id, name, theme, avatar_seed, last_active, created_at FROM users WHERE account_id = ? ORDER BY created_at",
                (account_id,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, name, theme, avatar_seed, last_active, created_at FROM users ORDER BY created_at"
            ).fetchall()
        return [dict(r) for r in rows]


def list_users_with_progress(account_id: int | None = None) -> list[dict]:
    """Return all users with FLK1/FLK2 progress percentages for the landing page."""
    with get_db() as conn:
        if account_id is not None:
            users = conn.execute(
                "SELECT id, name, avatar_seed, last_active, created_at FROM users WHERE account_id = ? ORDER BY created_at",
                (account_id,)
            ).fetchall()
        else:
            users = conn.execute(
                "SELECT id, name, avatar_seed, last_active, created_at FROM users ORDER BY created_at"
            ).fetchall()

        # Total cards per FLK (shared across all users — computed once)
        totals = {}
        for flk in ('FLK1', 'FLK2'):
            row = conn.execute(
                "SELECT COUNT(*) as n FROM cards WHERE flk = ? AND is_deeper = 0", (flk,)
            ).fetchone()
            totals[flk] = row["n"] or 1  # avoid division by zero

        result = []
        for u in users:
            flk1_reviewed = conn.execute(
                """SELECT COUNT(*) as n FROM progress p
                   JOIN cards c ON c.id = p.card_id
                   WHERE p.user_id = ? AND c.flk = 'FLK1' AND c.is_deeper = 0
                     AND p.repetitions > 0""",
                (u["id"],)
            ).fetchone()["n"]

            flk2_reviewed = conn.execute(
                """SELECT COUNT(*) as n FROM progress p
                   JOIN cards c ON c.id = p.card_id
                   WHERE p.user_id = ? AND c.flk = 'FLK2' AND c.is_deeper = 0
                     AND p.repetitions > 0""",
                (u["id"],)
            ).fetchone()["n"]

            result.append({
                **dict(u),
                "flk1_pct": round(100 * flk1_reviewed / totals['FLK1']),
                "flk2_pct": round(100 * flk2_reviewed / totals['FLK2']),
            })

        return result


def get_user(user_id: int) -> dict | None:
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, name, theme, created_at FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        return dict(row) if row else None


def create_user(name: str, avatar_seed: str | None = None, account_id: int | None = None) -> dict:
    from datetime import datetime
    created_at = datetime.utcnow().isoformat()
    today = date.today().isoformat()
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO users (name, theme, avatar_seed, last_active, created_at, account_id) VALUES (?, 'default', ?, ?, ?, ?)",
            (name.strip(), avatar_seed, today, created_at, account_id)
        )
        return {"id": cur.lastrowid, "name": name.strip(), "theme": "default",
                "avatar_seed": avatar_seed, "last_active": today, "created_at": created_at,
                "account_id": account_id}


def profile_belongs_to_account(user_id: int, account_id: int) -> bool:
    """Security check — confirm a profile belongs to the authenticated account."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM users WHERE id = ? AND account_id = ?", (user_id, account_id)
        ).fetchone()
        return row is not None


def update_user(user_id: int, name: str | None = None, avatar_seed: str | None = None,
                last_active: str | None = None) -> dict | None:
    with get_db() as conn:
        fields, values = [], []
        if name is not None:
            fields.append("name = ?"); values.append(name.strip())
        if avatar_seed is not None:
            fields.append("avatar_seed = ?"); values.append(avatar_seed)
        if last_active is not None:
            fields.append("last_active = ?"); values.append(last_active)
        if not fields:
            row = conn.execute(
                "SELECT id, name, avatar_seed, last_active, created_at FROM users WHERE id = ?",
                (user_id,)
            ).fetchone()
            return dict(row) if row else None
        values.append(user_id)
        conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", values)
        row = conn.execute(
            "SELECT id, name, avatar_seed, last_active, created_at FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()
        return dict(row) if row else None


def delete_user(user_id: int) -> bool:
    with get_db() as conn:
        cur = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        return cur.rowcount > 0


def delete_account(account_id: int) -> bool:
    """Permanently delete an account and all associated data (GDPR right to erasure)."""
    with get_db() as conn:
        # Get all profile IDs for this account
        profiles = conn.execute(
            "SELECT id FROM users WHERE account_id = ?", (account_id,)
        ).fetchall()
        user_ids = [p["id"] for p in profiles]

        if user_ids:
            placeholders = ",".join("?" * len(user_ids))
            conn.execute(f"DELETE FROM progress WHERE user_id IN ({placeholders})", user_ids)
            conn.execute(f"DELETE FROM reviews WHERE user_id IN ({placeholders})", user_ids)
            conn.execute(f"DELETE FROM mcq_attempts WHERE user_id IN ({placeholders})", user_ids)
            conn.execute(f"DELETE FROM users WHERE id IN ({placeholders})", user_ids)

        conn.execute("DELETE FROM email_verification_tokens WHERE account_id = ?", (account_id,))
        conn.execute("DELETE FROM password_reset_tokens WHERE account_id = ?", (account_id,))
        cur = conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
        return cur.rowcount > 0


def update_user_theme(user_id: int, theme: str):
    with get_db() as conn:
        conn.execute("UPDATE users SET theme = ? WHERE id = ?", (theme, user_id))


# ── Stripe / billing ─────────────────────────────────────────────────────────

def set_stripe_customer_id(account_id: int, customer_id: str):
    with get_db() as conn:
        conn.execute(
            "UPDATE accounts SET stripe_customer_id = ? WHERE id = ?",
            (customer_id, account_id)
        )


def set_subscription_status(account_id: int, status: str):
    with get_db() as conn:
        conn.execute(
            "UPDATE accounts SET subscription_status = ? WHERE id = ?",
            (status, account_id)
        )


def set_subscription_status_by_customer(customer_id: str, status: str):
    with get_db() as conn:
        conn.execute(
            "UPDATE accounts SET subscription_status = ? WHERE stripe_customer_id = ?",
            (status, customer_id)
        )


def has_stripe_event(event_id: str) -> bool:
    with get_db() as conn:
        row = conn.execute(
            "SELECT 1 FROM stripe_events WHERE event_id = ?", (event_id,)
        ).fetchone()
        return row is not None


def record_stripe_event(event_id: str):
    from datetime import datetime
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO stripe_events (event_id, processed_at) VALUES (?, ?)",
            (event_id, datetime.utcnow().isoformat())
        )


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


# ── MCQ queries ───────────────────────────────────────────────────────────────

def get_mcq_subjects_with_stats(user_id: int) -> list[dict]:
    """All subjects that have MCQs, with attempt counts and accuracy for the user."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT s.id, s.name, s.abbr, s.flk,
                      COUNT(DISTINCT q.id)            AS total,
                      COUNT(DISTINCT a.id)            AS attempted,
                      SUM(CASE WHEN a.correct = 1 THEN 1 ELSE 0 END) AS correct_count
                 FROM mcq_questions q
                 JOIN subtopics st  ON st.id = q.subtopic_id
                 JOIN topics t      ON t.id  = st.topic_id
                 JOIN subjects s    ON s.id  = t.subject_id
                 LEFT JOIN mcq_attempts a
                        ON a.question_id = q.question_id AND a.user_id = ?
                GROUP BY s.id
                ORDER BY s.flk, s.name""",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_mcqs_for_subject(subject_id: int, user_id: int, limit: int = 0) -> list[dict]:
    """MCQs for a subject with last-attempt info for the user."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT q.*,
                      la.selected     AS last_selected,
                      la.correct      AS last_correct,
                      la.attempted_at AS last_attempted_at
                 FROM mcq_questions q
                 JOIN subtopics st ON st.id = q.subtopic_id
                 JOIN topics t     ON t.id  = st.topic_id
                 LEFT JOIN (
                     SELECT question_id,
                            selected,
                            correct,
                            attempted_at,
                            ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY id DESC) AS rn
                       FROM mcq_attempts WHERE user_id = ?
                 ) la ON la.question_id = q.question_id AND la.rn = 1
                WHERE t.subject_id = ?
                ORDER BY q.question_id""" + (" LIMIT ?" if limit else ""),
            (user_id, subject_id, limit) if limit else (user_id, subject_id),
        ).fetchall()
        return [dict(r) for r in rows]


def get_random_mcqs(subject_id: int | None, flk: str | None, limit: int, user_id: int) -> list[dict]:
    """Random MCQs, optionally scoped to a subject or FLK."""
    with get_db() as conn:
        params: list = [user_id]
        where = ""
        if subject_id:
            where += " AND t.subject_id = ?"
            params.append(subject_id)
        elif flk:
            where += " AND q.flk = ?"
            params.append(flk)
        params.append(limit)
        rows = conn.execute(
            f"""SELECT q.*,
                       la.selected     AS last_selected,
                       la.correct      AS last_correct,
                       la.attempted_at AS last_attempted_at
                  FROM mcq_questions q
                  JOIN subtopics st ON st.id = q.subtopic_id
                  JOIN topics t     ON t.id  = st.topic_id
                  LEFT JOIN (
                      SELECT question_id, selected, correct, attempted_at,
                             ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY id DESC) AS rn
                        FROM mcq_attempts WHERE user_id = ?
                  ) la ON la.question_id = q.question_id AND la.rn = 1
                 WHERE 1=1 {where}
                 ORDER BY RANDOM()
                 LIMIT ?""",
            params,
        ).fetchall()
        return [dict(r) for r in rows]


def record_mcq_attempt(user_id: int, question_id: str, selected: str, correct: bool) -> dict:
    """Save an MCQ attempt and return updated stats for that question."""
    from datetime import datetime
    attempted_at = datetime.utcnow().isoformat()
    with get_db() as conn:
        conn.execute(
            "INSERT INTO mcq_attempts (user_id, question_id, selected, correct, attempted_at) VALUES (?,?,?,?,?)",
            (user_id, question_id, selected, 1 if correct else 0, attempted_at),
        )
        stats = conn.execute(
            """SELECT COUNT(*) AS attempts,
                      SUM(correct) AS correct_count
                 FROM mcq_attempts WHERE user_id = ? AND question_id = ?""",
            (user_id, question_id),
        ).fetchone()
    return {
        "question_id":   question_id,
        "selected":      selected,
        "correct":       correct,
        "attempts":      stats["attempts"],
        "correct_count": stats["correct_count"],
    }


def get_mcq_progress(user_id: int) -> list[dict]:
    """Per-subject MCQ accuracy summary for the user."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT s.id, s.name, s.abbr, s.flk,
                      COUNT(DISTINCT q.id)              AS total_questions,
                      COUNT(DISTINCT a.question_id)     AS attempted,
                      COALESCE(SUM(a.correct), 0)       AS correct_count,
                      COALESCE(COUNT(a.id), 0)          AS total_attempts
                 FROM subjects s
                 JOIN topics t      ON t.subject_id  = s.id
                 JOIN subtopics st  ON st.topic_id   = t.id
                 JOIN mcq_questions q ON q.subtopic_id = st.id
                 LEFT JOIN mcq_attempts a
                        ON a.question_id = q.question_id AND a.user_id = ?
                GROUP BY s.id
                ORDER BY s.flk, s.name""",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def seed_mcqs(questions: list[dict]) -> tuple[int, int]:
    """
    Upsert MCQ questions from mcq_master.json.
    Returns (inserted, skipped) counts.
    question_id is the unique key — re-running is safe.
    """
    inserted = skipped = 0
    with get_db() as conn:
        for q in questions:
            subtopic_row = conn.execute(
                """SELECT st.id FROM subtopics st
                     JOIN topics t ON t.id = st.topic_id
                     JOIN subjects s ON s.id = t.subject_id
                    WHERE s.name = ? AND t.name = ? AND st.name = ?""",
                (q.get("subject"), q.get("topic"), q.get("subtopic")),
            ).fetchone()
            if subtopic_row:
                sid = subtopic_row["id"]
            else:
                # Auto-create missing topic/subtopic under the existing subject
                subject_row = conn.execute(
                    "SELECT id, abbr, flk FROM subjects WHERE name = ?",
                    (q.get("subject"),),
                ).fetchone()
                if not subject_row:
                    skipped += 1
                    continue
                topic_id = get_or_create_topic(conn, q.get("topic", ""), subject_row["id"])
                sid = get_or_create_subtopic(conn, q.get("subtopic", ""), topic_id)

            opts = q.get("options", {})
            existing = conn.execute(
                "SELECT question_id FROM mcq_questions WHERE question_id = ?",
                (q["question_id"],),
            ).fetchone()
            if existing:
                skipped += 1
                continue

            import json as _json
            conn.execute(
                """INSERT INTO mcq_questions
                   (question_id, subtopic_id, flk, difficulty, stem,
                    option_a, option_b, option_c, option_d,
                    correct, explanation, card_refs, flag, generated_by)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    q["question_id"], sid, q.get("flk", ""), q.get("difficulty"),
                    q["stem"],
                    opts.get("A", ""), opts.get("B", ""), opts.get("C", ""), opts.get("D", ""),
                    q["correct"], q["explanation"],
                    _json.dumps(q.get("card_refs", [])),
                    1 if q.get("flag") else 0,
                    q.get("generated_by", "human"),
                ),
            )
            inserted += 1
    return inserted, skipped
