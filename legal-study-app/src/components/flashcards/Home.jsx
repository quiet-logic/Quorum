import { useState, useEffect } from 'react';
import { useUser } from '../../UserContext';
import './Home.css';

// Static per-subject metadata — colour and home-id never come from the API
const SUBJECT_META = {
  'Business Law & Practice':              { homeId: '01', abbr: 'BLP',   flk: 1,    color: '#C8A96E' },
  'Dispute Resolution':                   { homeId: '02', abbr: 'DR',    flk: 1,    color: '#7BAED4' },
  'Contract Law':                         { homeId: '03', abbr: 'CON',   flk: 1,    color: '#7EC47B' },
  'Tort Law':                             { homeId: '04', abbr: 'TORT',  flk: 1,    color: '#7EB8A4' },
  'Legal System of England & Wales':      { homeId: '05', abbr: 'LSEW',  flk: 1,    color: '#C4C26B' },
  'Legal Services':                       { homeId: '06', abbr: 'LS',    flk: 1,    color: '#C46BC4' },
  'Constitutional & Administrative Law':  { homeId: '07', abbr: 'CAL',   flk: 1,    color: '#6BB4C4' },
  'Professional Conduct':                 { homeId: '08', abbr: 'PC',    flk: 'pc', color: '#A4816B' },
  'Property Practice':                    { homeId: '09', abbr: 'PROP',  flk: 2,    color: '#9B8EC4' },
  'Wills & Administration':               { homeId: '10', abbr: 'WTP',   flk: 2,    color: '#C47B7B' },
  "Solicitors' Accounts":                 { homeId: '11', abbr: 'SA',    flk: 2,    color: '#6BC49B' },
  'Land Law':                             { homeId: '12', abbr: 'LAND',  flk: 2,    color: '#88B46B' },
  'Trusts':                               { homeId: '13', abbr: 'TRUST', flk: 2,    color: '#7B8EC4' },
  'Criminal Law & Practice':              { homeId: '14', abbr: 'CRIM',  flk: 2,    color: '#C46B8E' },
};

// Render immediately with zeros; API data fills in on load
const DEFAULT_SUBJECTS = Object.entries(SUBJECT_META).map(([name, meta]) => ({
  id: meta.homeId, dbId: null, name, abbr: meta.abbr, flk: meta.flk, color: meta.color,
  progress: 0, due: 0,
}));

const DEFAULT_STATS = { streak: 0, today: 0, accuracy: 0, all_time: 0 };

// ── Component ────────────────────────────────────────────────────────────────

const Home = ({ onStartStudy, onViewTopicMap, onViewCardBrowser, onViewProgress, onViewSyllabusMap, onStartConduct, onStartExam }) => {
  const { apiFetch }   = useUser();
  const [subjects, setSubjects]             = useState(DEFAULT_SUBJECTS);
  const [stats, setStats]                   = useState(DEFAULT_STATS);
  const [expandedSubjectId, setExpandedSubjectId] = useState(null);
  const [flk1Open, setFlk1Open]             = useState(true);
  const [flk2Open, setFlk2Open]             = useState(true);
  const [flkPcOpen, setFlkPcOpen]           = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/subjects').then(r => r.json()),
      apiFetch('/api/stats').then(r => r.json()),
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
              flk:      s.flk === 'FLK1' ? 1 : s.flk === 'FLK2' ? 2 : 'pc',
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
  const flkPc = subjects.filter(s => s.flk === 'pc');

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
      <div className="flashcards-subnav">
        <div className="flashcards-subnav-links">
          <span className="nav-link active">Dashboard</span>
          <span className="nav-link" onClick={onViewCardBrowser}>Browse Cards</span>
          <span className="nav-link" onClick={onViewProgress}>Progress</span>
          <span className="nav-link" onClick={onViewSyllabusMap}>Syllabus</span>
        </div>
        <div className="flk-btns">
          <button className="flk-btn mono" onClick={() => onStartStudy(null, null, 'FLK1')}>FLK 1</button>
          <button className="flk-btn mono" onClick={() => onStartStudy(null, null, 'FLK2')}>FLK 2</button>
        </div>
      </div>

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

            {flkPc.length > 0 && (
              <>
                <div className="flk-section-header" style={{ marginTop: '40px' }} onClick={() => setFlkPcOpen(o => !o)}>
                  <h2 className="playfair">Professional Conduct</h2>
                  <span className="flk-section-chevron mono">{flkPcOpen ? '−' : '+'}</span>
                </div>
                {flkPcOpen && <div className="subject-list">{renderSubjectList(flkPc)}</div>}
              </>
            )}
          </div>

          <aside className="sidebar">
            <div className="section-header"><h2 className="playfair">Quick Study</h2></div>
            <div className="quick-study-list">
              {subjects.filter(s => s.due > 0).map(sub => (
                <button
                  key={sub.id}
                  className="quick-row"
                  onClick={() => onStartStudy(sub, null)}
                >
                  <span className="quick-row-abbr mono" style={{ color: sub.color }}>{sub.abbr}</span>
                  <div className="quick-row-body">
                    <div className="quick-row-top">
                      <span className="quick-row-name outfit">{sub.name}</span>
                      <span className="quick-row-due mono" style={{ color: sub.color }}>{sub.due} due</span>
                    </div>
                    <div className="quick-row-bar-track">
                      <div className="quick-row-bar-fill" style={{ width: `${sub.progress}%`, background: sub.color }} />
                    </div>
                  </div>
                </button>
              ))}
              {subjects.every(s => s.due === 0) && (
                <p className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  No cards due — check back tomorrow.
                </p>
              )}
            </div>

            <div>
              <div className="section-header"><h2 className="playfair">Modes</h2></div>
              <div className="mode-list">
                <button className="mode-btn" onClick={onStartConduct}>
                  <span className="mode-btn-title outfit">Conduct Mode</span>
                  <span className="mode-btn-desc outfit">Cross-subject conduct cards in rotation</span>
                </button>
                <button className="mode-btn" onClick={onStartExam}>
                  <span className="mode-btn-title outfit">Exam Simulator</span>
                  <span className="mode-btn-desc outfit">Timed paper with proportional subject draw</span>
                </button>
                <button className="mode-btn" onClick={onViewSyllabusMap}>
                  <span className="mode-btn-title outfit">Syllabus Map</span>
                  <span className="mode-btn-desc outfit">Full topic tree colour-coded by progress</span>
                </button>
              </div>
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
  const { apiFetch } = useUser();
  const [topics, setTopics] = useState(null);

  useEffect(() => {
    if (!sub.dbId) return;
    apiFetch(`/api/subjects/${sub.dbId}/map`)
      .then(r => r.json())
      .then(data => setTopics(Array.isArray(data) ? data : []))
      .catch(() => setTopics([]));
  }, [sub.dbId]);

  return (
    <div className="subject-panel">
      <div className="subject-panel-inner" style={{ '--panel-accent': sub.color }}>

        <button className="panel-study-all outfit" onClick={onStudyAll}>
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
