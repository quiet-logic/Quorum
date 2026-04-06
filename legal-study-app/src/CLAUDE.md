# Quorum — Claude Code Project Brief

Quorum is a spaced repetition flashcard app for SQE1 (Solicitors Qualifying Examination) revision. Users flip cards, rate recall quality (0–5), and the SM-2 algorithm schedules future reviews. The card bank covers all FLK1 and FLK2 subjects.

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
├── seed_data.py        # Loads cards from data/cards.json into DB
├── data/
│   └── cards.json      # Card source data (nested: FLK > Subject > Topic > Subtopic > cards[])
├── quorum.db           # Auto-created — never edit manually
├── client/             # React/Vite front end
│   ├── src/
│   │   ├── components/ # Shared components (Masthead, FlipCard, etc.)
│   │   └── pages/      # Dashboard.jsx · TopicMap.jsx · Study.jsx · Results.jsx · CardBrowser.jsx
│   ├── public/assets/  # SVG brand assets (icon, wordmark)
│   └── vite.config.js  # Proxies /api/* to Flask :5000 in dev
├── requirements.txt
└── package.json
```

---

## How to Run

```bash
# Python backend
python3 -m venv venv && source venv/bin/activate
pip install flask
python database.py      # creates quorum.db
python seed_data.py     # loads cards
python app.py           # Flask at http://127.0.0.1:5000

# React front end (separate terminal)
cd client
npm install
npm run dev             # Vite at http://localhost:5173
```

---

## Current Build Status

**Card bank** — complete for all FLK1 subjects; FLK2 in progress. Card data lives in `data/cards.json`.

**App** — not yet built. All five screens are designed; React prototypes exist as reference files.

**Reference design files** (do not modify — read only for reference):
- `sqe-dashboard.jsx` · `sqe-topic-map.jsx` · `sqe-study-concept-a.jsx` · `sqe-results.jsx` · `sqe-card-browser.jsx`

**Detailed specs**: `PROJECT_SPEC.pdf` and `quorum_card_generation_manual_v4_1.pdf` in project root.

---

## Critical Conventions

**DB access:** All SQLite queries go through `database.py`. Never query the DB directly in `app.py`.

**API routes:** All Flask routes are prefixed `/api/`. The root `/` serves the React build in production.

**Card data structure:** `cards.json` is nested four levels before the cards array: `FLK > Subject > Topic > Subtopic > [cards]`. `seed_data.py` walks this structure to populate the DB.

**IRAC fields dual-purpose:** `issue / rule / application / conclusion` columns serve two roles — IRAC content for Type 2 case cards, and trap structure for Type 5 trap cards. `answer` is always null for Types 2 and 5.

**Type 4 cards** (`is_deeper = 1`) are excluded from progress tracking and toggle-gated in the UI.

**Card codes:** `FLK1-CON-047` · `FLK1-CON-CASE-021` · `FLK1-TORT-SCE-021` · `FLK1-TORT-DEEP-001` · `FLK1-TORT-TRAP-001`

---

## Database Schema (key tables)

**cards:** `id · card_code · subtopic_id · card_type (1–5) · difficulty · flk · front · answer · issue · rule · application · conclusion · summary_line · is_deeper`

**progress:** `id · card_id · easiness (2.5 start) · interval · repetitions · next_review · last_reviewed`

Full schema in `PROJECT_SPEC.pdf`.

---

## Flask API Routes

| Route | Method | Purpose |
|---|---|---|
| `/` | GET | Serve React build (production) |
| `/api/subjects` | GET | All subjects with progress |
| `/api/study/<subject_id>` | GET | Next due cards for subject |
| `/api/study/<subtopic_id>` | GET | Next due cards for subtopic |
| `/api/review` | POST | Submit rating, update SRS, return next card |
| `/api/progress` | GET | Overall progress per subject |

---

## Design System (apply to all React work)

**Typography:** Playfair Display (headings) · Outfit (UI/body) · DM Mono (numbers, codes, stats)

**Colours:**
- Background light: `#F5F2EC` · dark: `#0E0E0E`
- Surface light: `#FFFFFF` · dark: `#161616`
- Gold accent: `#C8A96E` (primary — progress bars, stats, title borders)
- Text light: `#1A1714` · dark: `#E8E4DC`
- Muted: `#8A847A`

**Subject accents:** CON `#C8A96E` · TORT `#7EB8A4` · CRIM `#C47B7B` · PROP `#9B8EC4` · DR `#7BAED4`

**Layout rules:**
- Square corners throughout — no `border-radius` anywhere
- Buttons: uppercase labels, `0.04–0.08em` letter-spacing
- Page titles: `3px` left border in subject accent colour
- Progress bars: `3px` height, no border-radius
- Index labels: DM Mono, `10px`, `0.14em` letter-spacing, uppercase, muted colour
- Max content width: `860–1080px`, centred

**Brand assets** live in `client/public/assets/`. Use `quorum-icon-dark.svg` on light backgrounds, `quorum-icon-light.svg` on dark.

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
