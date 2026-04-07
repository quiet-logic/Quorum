# Quorum — Claude Code Project Brief

Quorum is a spaced repetition flashcard app for SQE1 (Solicitors Qualifying Examination) revision. Users flip cards, rate recall quality (0–5), and the SM-2 algorithm schedules future reviews. The card bank covers all 14 subjects across FLK1, FLK2, and Professional Conduct.

---

## Git Workflow

**Always work on a feature branch — never commit directly to `main`.**

```bash
git checkout -b claude/<short-topic>   # start from main
# ... do work, commit ...
gh pr create                           # open PR against main
```

PRs should be reviewed before merging. Keep commits focused and descriptive.

---

## Stack

| Layer | Choice |
|---|---|
| Language | Python 3 |
| Web framework | Flask |
| Database | SQLite via built-in `sqlite3` |
| Front end | React (Vite) |
| SRS algorithm | SM-2 |

---

## Project Structure

```
quorum/
├── app.py              # Flask — routes and API endpoints only
├── database.py         # All DB interaction lives here — never query SQLite in app.py
├── srs.py              # SM-2 algorithm
├── seed_data.py        # Loads cards from JSON files into DB
├── quorum.db           # Auto-created — never edit manually
└── legal-study-app/    # React/Vite front end
    └── src/
        ├── App.jsx
        ├── subjectColor.js          # Shared subject → hex colour utility
        ├── components/
        │   ├── Home.jsx / Home.css
        │   ├── StudySession.jsx / StudySession.css
        │   ├── FlipCard.jsx / FlipCard.css
        │   ├── Results.jsx / Results.css
        │   ├── CardBrowser.jsx / CardBrowser.css
        │   ├── Progress.jsx / Progress.css
        │   ├── TopicMap.jsx / TopicMap.css
        │   ├── SyllabusMap.jsx / SyllabusMap.css
        │   ├── ExamSimulator.jsx / ExamSimulator.css
        │   └── ExamResults.jsx / ExamResults.css
        └── data/
            └── FLK1_*.json / FLK2_*.json / FLK_PC.json   # Card source data
```

---

## How to Run

```bash
# Python backend
python3 -m venv venv && source venv/bin/activate
pip install flask
python seed_data.py     # loads cards into quorum.db
python app.py           # Flask at http://127.0.0.1:5001

# React front end (separate terminal)
cd legal-study-app
npm install
npm run dev             # Vite at http://localhost:5173 (proxies /api/* to :5001)
```

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

**API routes:** All Flask routes are prefixed `/api/`. Backend runs on port 5001.

**Shared colour utility:** Subject → hex colour is in `src/subjectColor.js`. Import from there — never duplicate the map in components.

**IRAC fields dual-purpose:** `issue / rule / application / conclusion` columns serve two roles — IRAC content for Type 2 case cards, and trap structure for Type 5 trap cards. `answer` is always null for Types 2 and 5.

**Type 4 cards** (`is_deeper = 1`) are excluded from standard sessions and toggle-gated in the UI.

**Card codes:** `FLK1-CON-047` · `FLK1-CON-CASE-021` · `FLK1-TORT-SCE-021` · `FLK1-TORT-DEEP-001` · `FLK1-TORT-TRAP-001`

---

## Card Types

| Type | Label | Back layout |
|---|---|---|
| 1 | Q&A | Answer text |
| 2 | IRAC | Issue / Rule / Application / Conclusion |
| 3 | Scenario | Answer text |
| 4 | Deeper | Answer text (deeper knowledge) |
| 5 | Trap | The Trap / The Reality / Why the Distractor Fails / The Key Rule |

---

## Flask API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/subjects` | GET | All subjects with progress + due count |
| `/api/subjects/<id>/map` | GET | Topics + subtopics for a subject |
| `/api/stats` | GET | Streak, today count, accuracy, all-time |
| `/api/analytics` | GET | Heatmap, forecast, retention, weak topics |
| `/api/study/session` | GET | Due cards (params: subject_id, topic_id, limit, flk, include_deeper) |
| `/api/study/subtopic/<id>` | GET | Due cards for a specific subtopic |
| `/api/study/conduct` | GET | PC subject cards (was Conduct Mode) |
| `/api/cards` | GET | Search/browse cards (params: q, subject_id, card_type) |
| `/api/review` | POST | Submit SM-2 rating for a card |
| `/api/exam/session` | GET | Random exam draw (params: flk, limit) |

---

## Design System

**Typography:**
- Playfair Display → headings, section titles, wordmark, card question text
- Outfit → body text, subject/topic names, button labels, descriptions
- DM Mono → all data: counts, codes, percentages, tags, metadata, breadcrumbs

**Colours:**
- Background: `#F5F2EC` · Surface: `#FFFFFF`
- Text: `#1A1714` · Muted: `#8A847A`
- Border light: use CSS var `--border-light`
- Subject accents: defined in `src/subjectColor.js`

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
