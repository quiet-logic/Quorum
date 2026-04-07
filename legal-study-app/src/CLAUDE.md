# Quorum — Claude Code Project Brief

Quorum is a spaced repetition flashcard + MCQ practice app for SQE1 (Solicitors Qualifying Examination) revision. Users flip cards, rate recall quality (0–5), and the SM-2 algorithm schedules future reviews. The card bank covers all 14 subjects across FLK1, FLK2, and Professional Conduct.

---

## Git Workflow

Commit directly to `main` and push. No feature branches or PRs needed.

```bash
git add <files>
git commit -m "Description"
git push
```

---

## Stack

| Layer | Choice |
|---|---|
| Language | Python 3 |
| Web framework | Flask + Flask-Login |
| Database | SQLite via built-in `sqlite3` |
| Front end | React (Vite) |
| SRS algorithm | SM-2 |
| Email | Resend (console fallback in dev) |
| Auth | Email + password, invite-only beta. Auth0-ready (`auth0_sub` column on accounts) |
| Python deps | `flask`, `flask-login`, `resend`, `gunicorn` |

---

## Project Structure

```
quorum/
├── app.py              # Flask — routes only. No SQL here.
├── database.py         # All DB interaction. Never query SQLite in app.py.
├── auth.py             # Flask-Login setup, register/login/verify/reset logic
├── email_service.py    # Resend abstraction — swap backend by changing _send() only
├── srs.py              # SM-2 algorithm
├── seed_data.py        # Loads FLK*.json card files into DB
├── seed_mcq.py         # Loads mcq_master.json MCQ bank into DB
├── manage_invites.py   # CLI: python manage_invites.py generate 20 / list
├── Dockerfile          # Builds frontend + installs Python deps for deployment
├── requirements.txt    # flask, flask-login, resend, gunicorn
├── quorum.db           # Auto-created. Never edit manually.
└── legal-study-app/    # React/Vite front end
    └── src/
        ├── App.jsx             # Auth gate + pillar navigation
        ├── AuthContext.jsx     # Account-level auth state (account vs profile)
        ├── UserContext.jsx     # Active profile state + apiFetch helper
        ├── DisplayModeContext.jsx  # 7 display modes (system/light/dark/focus/reading/calm/visual)
        ├── subjectColor.js     # Subject → hex colour. Import from here, never duplicate.
        ├── components/
        │   ├── Login.jsx / Register.jsx / ForgotPassword.jsx / ResetPassword.jsx
        │   ├── AuthScreens.css         # Shared auth screen styles
        │   ├── Landing.jsx             # Profile picker with FLK progress bars
        │   ├── Masthead.jsx            # 80px top nav with pillar tabs
        │   ├── CrossPillarHome.jsx     # Home between pillars
        │   ├── Home.jsx / Home.css     # Flashcards pillar home
        │   ├── StudySession.jsx        # Card study session
        │   ├── FlipCard.jsx            # Two-phase flip animation card
        │   ├── Results.jsx             # Post-session results
        │   ├── CardBrowser.jsx         # Browse/search all cards
        │   ├── Progress.jsx            # Per-subject progress overview
        │   ├── TopicMap.jsx            # Topic breakdown for a subject
        │   ├── SyllabusMap.jsx         # Full syllabus tree
        │   ├── ExamSimulator.jsx       # Timed exam mode
        │   ├── ExamResults.jsx         # Exam results + missed card drill
        │   ├── DisplayModeSelector.jsx # Floating ◑ mode picker
        │   └── data/
        │       └── FLK1_*.json / FLK2_*.json / FLK_PC.json  # Card source data
        │       └── quorum_mcq_master.json  # MCQ bank — 390 questions across 13 subjects
```

---

## How to Run

```bash
# Python backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python seed_data.py         # load cards (run once)
python seed_mcq.py          # load MCQs from quorum_mcq_master.json
python app.py               # Flask at http://127.0.0.1:5001

# First time only — generate invite codes for beta access
python manage_invites.py generate 20

# React front end (separate terminal)
cd legal-study-app
npm install
npm run dev                 # Vite at http://localhost:5173 (proxies /api/* to :5001)
```

**Required env vars (copy `.env.example` to `.env`):**
- `SECRET_KEY` — Flask session signing (required in prod)
- `DB_PATH` — defaults to `quorum.db`
- `RESEND_API_KEY` — email sending; omit to print to console
- `APP_URL` — base URL for email links (default: `http://localhost:5173`)
- `SKIP_EMAIL_VERIFY=1` — bypass email verification in dev

---

## Auth Architecture

Two-layer model: **accounts** (email + password) → **users/profiles** (named profiles within an account).

- `auth.py` handles all auth logic. `app.py` calls it, never duplicates it.
- `AuthContext.jsx` — `account` state: `null` (loading) | `false` (unauthenticated) | `object` (authenticated)
- `UserContext.jsx` — `activeUser` state: which profile is selected within the account
- All profile routes use `@login_required` + `profile_belongs_to_account()` ownership check
- Auth0 migration path: `auth0_sub TEXT UNIQUE` column on `accounts` table exists from day one

---

## Subjects

14 subjects across three groups:

| Group | Subjects |
|---|---|
| FLK 1 | BLP · DR · CON · TORT · LSEW · LS · CAL |
| FLK 2 | PROP · WTP · SA · LAND · TRUST · CRIM |
| PC | Professional Conduct |

---

## Critical Conventions

**DB access:** All SQLite queries go through `database.py`. Never query the DB directly in `app.py`.

**API routes:** All Flask routes are prefixed `/api/`. Backend runs on port 5001. Root `/<path>` serves the React SPA (catch-all route).

**Shared colour utility:** Subject → hex colour is in `src/subjectColor.js`. Import from there — never duplicate the map in components.

**IRAC fields dual-purpose:** `issue / rule / application / conclusion` columns serve two roles — IRAC content for Type 2 case cards, and trap structure for Type 5 trap cards. `answer` is always null for Types 2 and 5.

**Type 4 cards** (`is_deeper = 1`) are excluded from standard sessions and toggle-gated in the UI.

**Display modes:** Set via `data-mode` attribute on `<html>`. 7 modes: `system`, `light`, `dark`, `focus`, `reading`, `calm`, `visual`. CSS custom properties cascade from these.

**Card surface:** White (`#FFFFFF`) in light mode. CSS var `--color-surface-card`.

---

## Card Types

| Type | Label | Back layout |
|---|---|---|
| 1 | Q&A | Answer text |
| 2 | IRAC | Issue / Rule / Application / Conclusion |
| 3 | Scenario | Answer text |
| 4 | Deeper | Answer text (deeper knowledge, toggle-gated) |
| 5 | Trap | The Trap / The Reality / Why the Distractor Fails / The Key Rule |

---

## Flask API Routes

### Auth
| Route | Method | Purpose |
|---|---|---|
| `/api/auth/register` | POST | Create account (requires invite code) |
| `/api/auth/login` | POST | Email + password login |
| `/api/auth/logout` | POST | End session |
| `/api/auth/me` | GET | Current account |
| `/api/auth/verify-email` | POST | Consume email verification token |
| `/api/auth/resend-verification` | POST | Resend verification email |
| `/api/auth/forgot-password` | POST | Send password reset email |
| `/api/auth/reset-password` | POST | Consume reset token + set new password |

### Profiles (login required)
| Route | Method | Purpose |
|---|---|---|
| `/api/users` | GET | List profiles for current account |
| `/api/users` | POST | Create profile |
| `/api/users/<id>` | PUT | Update profile (name, avatar_seed, last_active) |
| `/api/users/<id>` | DELETE | Delete profile + all progress |
| `/api/users/<id>/export` | GET | Download JSON backup |
| `/api/users/<id>/import` | POST | Restore from JSON backup |

### Flashcards
| Route | Method | Purpose |
|---|---|---|
| `/api/subjects` | GET | All subjects with progress + due count |
| `/api/subjects/<id>/map` | GET | Topics + subtopics for a subject |
| `/api/stats` | GET | Streak, today count, accuracy, all-time |
| `/api/analytics` | GET | Heatmap, forecast, retention, weak topics |
| `/api/study/session` | GET | Due cards (params: subject_id, topic_id, limit, flk, include_deeper) |
| `/api/study/subtopic/<id>` | GET | Due cards for a specific subtopic |
| `/api/study/conduct` | GET | Professional Conduct cards only |
| `/api/study/exam` | GET | Random exam draw (params: flk, limit) |
| `/api/cards` | GET | Search/browse cards (params: q, subject_id, card_type) |
| `/api/review` | POST | Submit SM-2 rating for a card |
| `/api/progress` | GET | Per-subject progress summary |
| `/api/syllabus` | GET | Full syllabus tree with progress |

### MCQ
| Route | Method | Purpose |
|---|---|---|
| `/api/mcq/subjects` | GET | Subjects with MCQ stats for current user |
| `/api/mcq/subject/<id>` | GET | All MCQs for a subject |
| `/api/mcq/random` | GET | Random MCQs (params: subject_id, flk, limit) |
| `/api/mcq/attempt` | POST | Submit answer (question_id, selected) |
| `/api/mcq/progress` | GET | Per-subject MCQ accuracy |

---

## MCQ Data Format

`legal-study-app/src/components/data/quorum_mcq_master.json` — 390 questions across 13 subjects (30 per subject).

```json
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
```

Run `python seed_mcq.py` after creating the file.

---

## Design System

**Typography:**
- Playfair Display → headings, section titles, wordmark, card question text
- Outfit → body text, subject/topic names, button labels, descriptions
- DM Mono → all data: counts, codes, percentages, tags, metadata, breadcrumbs

**Colours (CSS custom properties — do not hardcode):**
- `--color-bg` · `--color-surface` · `--color-surface-card`
- `--color-text` · `--color-text-muted`
- `--color-border` · `--color-faint` · `--color-accent-gold`

Light mode defaults: bg `#F5F2EC`, surface/card `#FFFFFF`, text `#1A1714`, muted `#8A847A`, border `#D8D3C8`, gold `#C8A96E`

**Layout rules:**
- Square corners throughout — no `border-radius` anywhere
- Buttons: uppercase labels, `0.04–0.08em` letter-spacing, Outfit font
- Page titles: `3px` left border in subject accent colour, Playfair 28–42px weight 400
- Progress bars: `1–3px` height, no border-radius
- Max content width: `1140px`, centred
- Mobile breakpoint: `640px`

---

## SM-2 Rating Scale

| Score | Label | Behaviour |
|---|---|---|
| 0 | Blank | Reset |
| 1 | Hard | Reset |
| 2 | Wrong | Reset |
| 3 | Tricky | Space further |
| 4 | Good | Space further |
| 5 | Perfect | Space further |

Cards rated below 3 reset interval to 1 day. Cards rated 3+ increase interval using the easiness factor.

---

## Build Status

| Component | Status |
|---|---|
| Card bank | Complete — 2,753 cards, 14 subjects |
| MCQ bank | Complete — 390 questions, 13 subjects, all subtopics linked |
| Flashcard app | Complete |
| Auth system | Complete — email + password + invite codes |
| Exam simulator | Complete |
| Analytics | Complete |
| MCQ infrastructure | Complete — DB tables + API routes ready |
| MCQ practice UI | Complete — home, session, results |
| Podcast | Phase 3 stub |
| Deployment | Dockerfile + Render guide ready |
