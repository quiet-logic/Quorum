# Quorum — CLAUDE.md

## Project overview

Quorum is a SQE (Solicitors Qualifying Examination) study app with three pillars:
- **Flashcards** — spaced repetition (SM-2 algorithm) across 14 subjects
- **MCQs** — multiple-choice question bank, 1170 questions across 13 subjects
- **Exam Simulator** — timed mock exam mode

Production URL: https://quorumsqe.uk (Railway, also accessible at web-production-661c.up.railway.app)

## Stack

- **Backend**: Python/Flask, SQLite (via `database.py`), Gunicorn
- **Frontend**: React 19, Vite 7, vite-plugin-pwa (PWA)
- **Auth**: flask-login with email verification (Resend)
- **Billing**: Stripe subscriptions (webhooks + checkout)
- **Deploy**: Railway (Docker), `europe-west4` region
- **Python**: 3.12 in Docker

## Repo structure

```
app.py              — Flask routes (all /api/* + / /app /privacy /terms)
database.py         — All SQLite logic (no SQL outside this file)
auth.py             — Registration, login, email verification, password reset
stripe_service.py   — Stripe checkout, portal, webhook handling
seed_data.py        — Seeds flashcard JSON files into DB on startup
seed_mcq.py         — Seeds *_mcq.json files into DB on startup
srs.py              — SM-2 spaced repetition algorithm
Procfile            — python seed_data.py && python seed_mcq.py && gunicorn ...
Dockerfile          — Node 20 + Python 3.12, builds React then serves Flask
templates/          — landing.html, privacy.html, terms.html (Jinja2)
legal-study-app/    — React frontend (Vite)
  src/components/
    data/           — Flashcard JSONs (FLK*.json) + MCQ JSONs (*_mcq.json)
    flashcards/     — FlipCard, StudySession, Home, Progress, etc.
    mcq/            — MCQHome, MCQPillar, MCQSession, MCQResults
    auth/           — Login, Register, ForgotPassword
    shared/         — Masthead, Landing, CrossPillarHome, Paywall, CookieBanner
```

## Data files

### Flashcards
- One file per subject: `FLK1_CON.json`, `FLK2_SA.json`, etc.
- Structure: `{ "FLK1": { "Subject": { "Topic": { "Subtopic": [cards] } } } }`
- Seeded by `seed_data.py` — globs `FLK*.json`, excludes `*_mcq.json`

### MCQs
- One file per subject: `FLK1_CON_mcq.json`, `FLK2_SA_mcq.json`, etc.
- Structure: `{ "FLK1": { "Subject": [questions] } }`
- Seeded by `seed_mcq.py` — globs `*_mcq.json`
- Auto-creates missing topics/subtopics if they don't exist in flashcard DB

## Key behaviours

- Every Railway deploy starts with a **fresh SQLite DB** — seed scripts run on every startup via Procfile
- `seed_data.py` and `seed_mcq.py` are idempotent (skip existing records)
- MCQ seeder auto-creates subject/topic/subtopic rows if not found in flashcard data
- Stripe access gate: users need active subscription or invite_free_access flag
- `vite-plugin-pwa@1.2.0` only supports up to Vite 7 — do not upgrade Vite to v8

## Git workflow

- Commit directly to `main` and push — no feature branches or PRs
- Railway auto-deploys on push to main

## Environment variables (set in Railway)

- `SECRET_KEY` — Flask session secret
- `DATABASE_URL` / `DB_PATH` — SQLite path
- `RESEND_API_KEY` — email sending
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` — Stripe
- `BASE_URL` — for email links (https://quorumsqe.uk)
