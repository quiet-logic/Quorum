#!/bin/bash
set -e

echo "→ Installing Python dependencies"
pip install -r requirements.txt

echo "→ Building React frontend"
cd legal-study-app
npm install
npm run build
cd ..

echo "→ Initialising database"
# Only seed if the DB doesn't already exist (preserves data on redeploy)
DB_FILE="${DB_PATH:-quorum.db}"
if [ ! -f "$DB_FILE" ]; then
  echo "  No DB found — seeding fresh"
  python seed_data.py
else
  echo "  DB exists — skipping seed to preserve progress data"
fi

echo "✓ Build complete"
