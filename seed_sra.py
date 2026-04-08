"""
seed_sra.py — load SRA official sample questions into the database.

SRA files live in legal-study-app/src/components/data/ and follow the pattern:
    sra_flk1_sample_questions.json
    sra_flk2_sample_questions.json

Each file has the structure:
    { "metadata": {...}, "questions": [{question_id, flk, stem, options, correct}] }

Usage:
    python seed_sra.py
"""

import glob
import json
import os
import sys

import database as db

DATA_DIR = os.path.join(
    os.path.dirname(__file__),
    "legal-study-app", "src", "components", "data"
)


def load_sra_questions(data_dir: str) -> list[tuple[str, list[dict]]]:
    """
    Load SRA question files. Returns list of (flk, questions) tuples.
    """
    pattern = os.path.join(data_dir, "sra_*.json")
    paths = sorted(glob.glob(pattern))

    if not paths:
        print(f"[seed_sra] No sra_*.json files found in {data_dir}")
        return []

    results = []
    for path in paths:
        filename = os.path.basename(path)
        try:
            with open(path, encoding="utf-8") as f:
                raw = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            print(f"[seed_sra] WARNING: skipping {filename} — {exc}", file=sys.stderr)
            continue

        questions = raw.get("questions", [])
        flk = raw.get("metadata", {}).get("flk", "")
        if not flk or not questions:
            print(f"[seed_sra] WARNING: skipping {filename} — missing flk or questions")
            continue

        print(f"[seed_sra] Loading {filename} — {len(questions)} questions ({flk})")
        results.append((flk, questions))

    return results


def main():
    db.init_db()

    batches = load_sra_questions(DATA_DIR)
    if not batches:
        print("[seed_sra] No SRA questions found — nothing to seed.")
        sys.exit(0)

    total_inserted = total_skipped = 0
    for flk, questions in batches:
        inserted, skipped = db.seed_sra_questions(questions, flk)
        print(f"[seed_sra] {flk}: {inserted} inserted, {skipped} skipped")
        total_inserted += inserted
        total_skipped += skipped

    print(f"[seed_sra] Done. Inserted: {total_inserted}  Skipped: {total_skipped}")


if __name__ == "__main__":
    main()
