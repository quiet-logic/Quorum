import { useState, useEffect } from 'react';
import './Home.css';

// Static per-subject metadata — colour and home-id never come from the API
const SUBJECT_META = {
  'Business Law & Practice':          { homeId: '01', abbr: 'BLP',   flk: 1, color: '#C8A96E' },
  'Dispute Resolution':               { homeId: '02', abbr: 'DR',    flk: 1, color: '#7BAED4' },
  'Contract Law':                     { homeId: '03', abbr: 'CON',   flk: 1, color: '#C8A96E' },
  'Tort Law':                         { homeId: '04', abbr: 'TORT',  flk: 1, color: '#7EB8A4' },
  'Legal System of England & Wales':  { homeId: '05', abbr: 'LSEW',  flk: 1, color: '#7BAED4' },
  'Legal Services':                   { homeId: '06', abbr: 'LS',    flk: 1, color: '#7BAED4' },
  'Property Practice':                { homeId: '07', abbr: 'PROP',  flk: 2, color: '#9B8EC4' },
  'Wills & Administration':           { homeId: '08', abbr: 'WTP',   flk: 2, color: '#C47B7B' },
  "Solicitors' Accounts":             { homeId: '09', abbr: 'SA',    flk: 2, color: '#7BAED4' },
  'Land Law':                         { homeId: '10', abbr: 'LAND',  flk: 2, color: '#9B8EC4' },
  'Trusts':                           { homeId: '11', abbr: 'TRUST', flk: 2, color: '#9B8EC4' },
  'Criminal Law & Practice':          { homeId: '12', abbr: 'CRIM',  flk: 2, color: '#C47B7B' },
};

// Render immediately with zeros; API data fills in on load
const DEFAULT_SUBJECTS = Object.entries(SUBJECT_META).map(([name, meta]) => ({
  id: meta.homeId, dbId: null, name, abbr: meta.abbr, flk: meta.flk, color: meta.color,
  progress: 0, due: 0,
}));

const DEFAULT_STATS = { streak: 0, today: 0, accuracy: 0, all_time: 0 };

// ── Component ────────────────────────────────────────────────────────────────

const Home = ({ onStartStudy, onViewTopicMap, onViewCardBrowser, onViewProgress }) => {
  const [subjects, setSubjects]             = useState(DEFAULT_SUBJECTS);
  const [stats, setStats]                   = useState(DEFAULT_STATS);
  const [expandedSubjectId, setExpandedSubjectId] = useState(null);
  const [flk1Open, setFlk1Open]             = useState(true);
  const [flk2Open, setFlk2Open]             = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/subjects').then(r => r.json()),
      fetch('/api/stats').then(r => r.json()),
    ])
      .then(([apiSubjects, apiStats]) => {
        const enriched = apiSubjects
          .filter(s => SUBJECT_META[s.name])
          .map(s => {
            const meta = SUBJECT_META[s.name];
            return {
              id:       meta.homeId,
              dbId:     s.id,          // DB integer id for API calls
              name:     s.name,
              abbr:     s.abbr || meta.abbr,
              flk:      s.flk === 'FLK1' ? 1 : 2,
              color:    meta.color,
              progress: s.progress_pct,
              due:      s.due_cards,
            };
          })
          .sort((a, b) => a.id.localeCompare(b.id));

        if (enriched.length) setSubjects(enriched);
        setStats(apiStats);
      })
      .catch(() => {
        // Backend not running — silently keep default zeros
      });
  }, []);

  const toggleSubject = (subId) => {
    setExpandedSubjectId(prev => prev === subId ? null : subId);
  };

  const flk1 = subjects.filter(s => s.flk === 1);
  const flk2 = subjects.filter(s => s.flk === 2);

  const renderSubjectList = (list) => list.map(sub => (
    <div key={sub.id} className="subject-row-group">
      <SubjectRow
        sub={sub}
        expanded={expandedSubjectId === sub.id}
        onToggle={() => toggleSubject(sub.id)}
        onMap={() => onViewTopicMap(sub)}
      />
      {expandedSubjectId === sub.id && (
        <SubjectPanel
          sub={sub}
          onStudyAll={() => { setExpandedSubjectId(null); onStartStudy(sub, null); }}
          onStudyTopic={(topicId) => { setExpandedSubjectId(null); onStartStudy(sub, topicId); }}
        />
      )}
    </div>
  ));

  return (
    <div className="home-wrapper">
      <nav className="masthead">
        <div className="masthead-left">
          <span className="wordmark-text playfair">Quorum</span>
          <div className="separator" />
          <div className="nav-links">
            <span className="nav-link active">Dashboard</span>
            <span className="nav-link" onClick={onViewCardBrowser}>Browse Cards</span>
            <span className="nav-link" onClick={onViewProgress}>Progress</span>
          </div>
        </div>
        <div className="flk-btns">
          <button className="flk-btn mono" onClick={() => onStartStudy(null, null, 'FLK1')}>FLK 1</button>
          <button className="flk-btn mono" onClick={() => onStartStudy(null, null, 'FLK2')}>FLK 2</button>
        </div>
      </nav>

      <main className="home-container">
        <section className="stats-strip">
          <div className="stat-card">
            <span className="stat-label mono">Streak</span>
            <span className="stat-value mono">{stats.streak}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label mono">Today</span>
            <span className="stat-value mono">{stats.today}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label mono">Accuracy</span>
            <span className="stat-value mono">{stats.accuracy}<small>%</small></span>
          </div>
          <div className="stat-card">
            <span className="stat-label mono">All Time</span>
            <span className="stat-value mono">{stats.all_time.toLocaleString()}</span>
          </div>
        </section>

        <div className="home-grid">
          <div className="main-col">
            <div className="flk-section-header" onClick={() => setFlk1Open(o => !o)}>
              <h2 className="playfair">FLK 1</h2>
              <span className="flk-section-chevron mono">{flk1Open ? '−' : '+'}</span>
            </div>
            {flk1Open && <div className="subject-list">{renderSubjectList(flk1)}</div>}

            <div className="flk-section-header" style={{ marginTop: '40px' }} onClick={() => setFlk2Open(o => !o)}>
              <h2 className="playfair">FLK 2</h2>
              <span className="flk-section-chevron mono">{flk2Open ? '−' : '+'}</span>
            </div>
            {flk2Open && <div className="subject-list">{renderSubjectList(flk2)}</div>}
          </div>

          <aside className="sidebar">
            <div className="section-header"><h2 className="playfair">Quick Study</h2></div>
            <div className="quick-study-grid">
              {subjects.filter(s => s.due > 0).map(sub => (
                <button
                  key={sub.id}
                  className="quick-btn"
                  style={{ '--subject-accent': sub.color }}
                  onClick={() => onStartStudy(sub, null)}
                >
                  <span className="mono" style={{ color: sub.color }}>{sub.abbr}</span>
                </button>
              ))}
              {subjects.every(s => s.due === 0) && (
                <p className="mono" style={{ fontSize: '11px', color: 'var(--muted)', gridColumn: '1/-1' }}>
                  No cards due — check back tomorrow.
                </p>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

// ── SubjectRow ────────────────────────────────────────────────────────────────

const SubjectRow = ({ sub, expanded, onToggle, onMap }) => (
  <div className={`subject-row ${expanded ? 'is-expanded' : ''}`}>
    <span className="sub-index mono">{sub.id}</span>
    <div className="sub-info" onClick={onToggle} style={{ cursor: 'pointer' }}>
      <span className="sub-name">{sub.name}</span>
      <div className="progress-container">
        <div className="progress-fill" style={{ width: `${sub.progress}%`, backgroundColor: sub.color }} />
      </div>
    </div>
    <span className="sub-perc mono">{sub.progress}%</span>
    <span className="sub-chevron mono">{expanded ? '−' : '+'}</span>
    <button className="map-btn mono" onClick={(e) => { e.stopPropagation(); onMap(); }}>
      Map
    </button>
  </div>
);

// ── SubjectPanel ──────────────────────────────────────────────────────────────

const SubjectPanel = ({ sub, onStudyAll, onStudyTopic }) => {
  const [topics, setTopics] = useState(null);

  useEffect(() => {
    if (!sub.dbId) return;
    fetch(`/api/subjects/${sub.dbId}/map`)
      .then(r => r.json())
      .then(data => setTopics(Array.isArray(data) ? data : []))
      .catch(() => setTopics([]));
  }, [sub.dbId]);

  return (
    <div className="subject-panel">
      <div className="subject-panel-inner" style={{ '--panel-accent': sub.color }}>

        <button className="panel-study-all mono" onClick={onStudyAll}>
          <span>Study All</span>
          <span className="panel-study-meta">15 cards · difficulty scaled</span>
        </button>

        <div className="panel-topics">
          {topics === null && (
            <span className="mono panel-status">Loading topics…</span>
          )}
          {topics?.map(topic => (
            <button
              key={topic.id}
              className="panel-topic-btn"
              onClick={() => onStudyTopic(topic.id)}
            >
              <span className="panel-topic-name outfit">{topic.name}</span>
              <span className="panel-topic-due mono">
                {topic.due_cards > 0
                  ? <span style={{ color: sub.color }}>{topic.due_cards} due</span>
                  : <span>{topic.total_cards} cards</span>
                }
              </span>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
};

export default Home;
