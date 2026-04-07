"""
seed_data.py — walks per-subject JSON files and populates quorum.db.

Run once (or re-run safely; duplicate card_codes are skipped).

Usage:
    python database.py     # create schema first
    python seed_data.py    # load cards

Card files live in legal-study-app/src/components/ and follow the naming
pattern FLK1_CON.json, FLK2_CRIM.json, etc. Each file has the structure:
    { "FLK1": { "Subject Name": { "Topic": { "Subtopic": [cards] } } } }
"""

import glob
import json
import os
import sys

import database as db

# Directory containing the per-subject JSON files
DATA_DIR = os.path.join(
    os.path.dirname(__file__),
    "legal-study-app", "src", "components"
)

# Map subject names → abbreviations (must match Home.jsx SUBJECTS)
SUBJECT_ABBR = {
    "Business Law & Practice":              "BLP",
    "Dispute Resolution":                   "DR",
    "Contract Law":                         "CON",
    "Tort Law":                             "TORT",
    "Legal System of England & Wales":      "LSEW",
    "Legal Services":                       "LS",
    "Constitutional & Administrative Law":  "CAL",
    "Property Practice":                    "PROP",
    "Wills & Administration":               "WTP",
    "Solicitors' Accounts":                 "SA",
    "Land Law":                             "LAND",
    "Trusts":                               "TRUST",
    "Criminal Law & Practice":              "CRIM",
    "Professional Conduct":                 "PC",
}


def _count_cards(data: dict) -> int:
    """Count leaf card objects across the full FLK > Subject > Topic > Subtopic tree."""
    total = 0
    for subjects in data.values():
        for topics in subjects.values():
            for subtopics in topics.values():
                for cards in subtopics.values():
                    if isinstance(cards, list):
                        total += len(cards)
    return total


def _load_files() -> list[tuple[str, dict]]:
    """
    Glob all FLK*.json files from DATA_DIR.
    Returns a list of (filename, parsed_data) tuples.
    Files that fail to parse are logged and skipped.
    """
    pattern = os.path.join(DATA_DIR, "FLK*.json")
    paths = sorted(glob.glob(pattern))

    if not paths:
        print(f"ERROR: no FLK*.json files found in {DATA_DIR}", file=sys.stderr)
        sys.exit(1)

    loaded = []
    for path in paths:
        filename = os.path.basename(path)
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            card_count = _count_cards(data)
            print(f"Loading {filename} — {card_count} cards")
            loaded.append((filename, data))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"WARNING: skipping {filename} — {exc}", file=sys.stderr)

    return loaded


def seed():
    files = _load_files()

    inserted = 0
    skipped = 0

    with db.get_db() as conn:
        for _filename, data in files:
            # Walk FLK > Subject > Topic > Subtopic > [cards]
            for flk_key, subjects in data.items():
                for subject_name, topics in subjects.items():
                    abbr = SUBJECT_ABBR.get(subject_name, subject_name[:4].upper())
                    subject_id = db.get_or_create_subject(conn, subject_name, abbr, flk_key)

                    for topic_name, subtopics in topics.items():
                        topic_id = db.get_or_create_topic(conn, topic_name, subject_id)

                        for subtopic_name, cards in subtopics.items():
                            if not isinstance(cards, list):
                                continue
                            subtopic_id = db.get_or_create_subtopic(conn, subtopic_name, topic_id)

                            for card in cards:
                                new_id = db.insert_card(
                                    conn,
                                    card_code    = card.get("card_code", ""),
                                    subtopic_id  = subtopic_id,
                                    card_type    = card.get("card_type", 1),
                                    difficulty   = card.get("difficulty"),
                                    flk          = flk_key,
                                    front        = card.get("front", ""),
                                    answer       = card.get("answer"),
                                    issue        = card.get("issue"),
                                    rule         = card.get("rule"),
                                    application  = card.get("application"),
                                    conclusion   = card.get("conclusion"),
                                    summary_line = card.get("summary_line"),
                                    is_deeper    = int(card.get("is_deeper", 0)),
                                    is_conduct   = int(card.get("is_conduct", 0)),
                                )
                                if new_id:
                                    inserted += 1
                                else:
                                    skipped += 1

    print(f"Seed complete — {inserted} cards inserted, {skipped} already existed.")


if __name__ == "__main__":
    db.init_db()
    seed()
