"""
seed_mcq.py — load MCQ questions from data/quorum_mcq_master.json into the database.

Expected format:
{
  "FLK1": {
    "Contract Law": [
      {
        "question_id": "FLK1-CON-MCQ-001",
        "flk": "FLK1",
        "subject": "Contract Law",
        "topic": "Formation",
        "subtopic": "Offer vs Invitation to Treat",
        "difficulty": "Foundation",
        "stem": "...",
        "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
        "correct": "C",
        "explanation": "...",
        "card_refs": ["FLK1-CON-001"],
        "flag": false,
        "generated_by": "human"
      }
    ]
  }
}

Usage:
    python seed_mcq.py
    python seed_mcq.py --path path/to/quorum_mcq_master.json
"""

import json
import sys
import argparse
import database as db

DEFAULT_PATH = "legal-study-app/src/components/data/quorum_mcq_master.json"


def load_questions(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)

    questions = []
    for flk, subjects in raw.items():
        for subject, qs in subjects.items():
            for q in qs:
                # Normalise: ensure flk and subject are set from the outer keys
                # if not already present in the question object
                q.setdefault("flk", flk)
                q.setdefault("subject", subject)
                questions.append(q)
    return questions


def main():
    parser = argparse.ArgumentParser(description="Seed MCQ bank into Quorum database")
    parser.add_argument("--path", default=DEFAULT_PATH,
                        help=f"Path to quorum_mcq_master.json (default: {DEFAULT_PATH})")
    args = parser.parse_args()

    db.init_db()

    try:
        questions = load_questions(args.path)
    except FileNotFoundError:
        print(f"[seed_mcq] File not found: {args.path}")
        print("[seed_mcq] MCQ bank has not been generated yet — nothing to seed.")
        sys.exit(0)
    except json.JSONDecodeError as e:
        print(f"[seed_mcq] JSON parse error in {args.path}: {e}")
        sys.exit(1)

    if not questions:
        print("[seed_mcq] No questions found in file.")
        sys.exit(0)

    print(f"[seed_mcq] Found {len(questions)} questions — inserting…")
    inserted, skipped = db.seed_mcqs(questions)
    print(f"[seed_mcq] Done. Inserted: {inserted}  Skipped (already exists): {skipped}")


if __name__ == "__main__":
    main()
