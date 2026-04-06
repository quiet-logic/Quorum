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
python seed_data.py

echo "✓ Build complete"
