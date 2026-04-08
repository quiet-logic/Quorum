"""
seed_mcq.py — load MCQ questions from per-subject *_mcq.json files into the database.

Each file follows the format:
{
  "FLK1": {
    "Contract Law": [
      {
        "question_id": "FLK1-CON-MCQ-001",
        ...
      }
    ]
  }
}

Usage:
    python seed_mcq.py
    python seed_mcq.py --dir path/to/data/dir
"""

import glob
import json
import os
import sys
import argparse

import database as db

DEFAULT_DIR = os.path.join(
    os.path.dirname(__file__),
    "legal-study-app", "src", "components", "data"
)


def load_questions(data_dir: str) -> list[dict]:
    pattern = os.path.join(data_dir, "*_mcq.json")
    paths = sorted(glob.glob(pattern))

    if not paths:
        print(f"[seed_mcq] No *_mcq.json files found in {data_dir}")
        return []

    questions = []
    for path in paths:
        filename = os.path.basename(path)
        try:
            with open(path, encoding="utf-8") as f:
                raw = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            print(f"[seed_mcq] WARNING: skipping {filename} — {exc}", file=sys.stderr)
            continue

        count = 0
        for flk, subjects in raw.items():
            for subject, qs in subjects.items():
                for q in qs:
                    q.setdefault("flk", flk)
                    q.setdefault("subject", subject)
                    questions.append(q)
                    count += 1
        print(f"[seed_mcq] Loading {filename} — {count} questions")

    return questions


def main():
    parser = argparse.ArgumentParser(description="Seed MCQ bank into Quorum database")
    parser.add_argument("--dir", default=DEFAULT_DIR,
                        help=f"Directory containing *_mcq.json files (default: {DEFAULT_DIR})")
    args = parser.parse_args()

    db.init_db()

    questions = load_questions(args.dir)

    if not questions:
        print("[seed_mcq] No questions found — nothing to seed.")
        sys.exit(0)

    print(f"[seed_mcq] Found {len(questions)} questions — inserting…")
    inserted, skipped = db.seed_mcqs(questions)
    print(f"[seed_mcq] Done. Inserted: {inserted}  Skipped (already exists): {skipped}")


if __name__ == "__main__":
    main()
