import { useState, useEffect } from 'react';
import { useUser } from '../../UserContext';
import './MCQHome.css';

const SUBJECT_META = {
  'Business Law & Practice':             { abbr: 'BLP',   flk: 'FLK1', color: '#C8A96E' },
  'Dispute Resolution':                  { abbr: 'DR',    flk: 'FLK1', color: '#7BAED4' },
  'Contract Law':                        { abbr: 'CON',   flk: 'FLK1', color: '#7EC47B' },
  'Tort Law':                            { abbr: 'TORT',  flk: 'FLK1', color: '#7EB8A4' },
  'Legal System of England & Wales':     { abbr: 'LSEW',  flk: 'FLK1', color: '#C4C26B' },
  'Legal Services':                      { abbr: 'LS',    flk: 'FLK1', color: '#C46BC4' },
  'Constitutional & Administrative Law': { abbr: 'CAL',   flk: 'FLK1', color: '#6BB4C4' },
  'Property Practice':                   { abbr: 'PROP',  flk: 'FLK2', color: '#9B8EC4' },
  'Wills & Administration of Estates':   { abbr: 'WTP',   flk: 'FLK2', color: '#C47B7B' },
  "Solicitors' Accounts":                { abbr: 'SA',    flk: 'FLK2', color: '#6BC49B' },
  'Land Law':                            { abbr: 'LAND',  flk: 'FLK2', color: '#88B46B' },
  'Trusts':                              { abbr: 'TRUST', flk: 'FLK2', color: '#7B8EC4' },
  'Criminal Law & Practice':             { abbr: 'CRIM',  flk: 'FLK2', color: '#C46B8E' },
};

const MCQHome = ({ onStartSubject, onStartRandom }) => {
  const { apiFetch } = useUser();
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    apiFetch('/api/mcq/subjects')
      .then(r => r.json())
      .then(data => { setSubjects(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const flk1 = subjects.filter(s => SUBJECT_META[s.name]?.flk === 'FLK1');
  const flk2 = subjects.filter(s => SUBJECT_META[s.name]?.flk === 'FLK2');

  const totalAttempted = subjects.reduce((n, s) => n + (s.attempted || 0), 0);
  const totalCorrect   = subjects.reduce((n, s) => n + (s.correct_count || 0), 0);
  const totalQuestions = subjects.reduce((n, s) => n + (s.total || 0), 0);
  const overallPct     = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : null;

  return (
    <div className="mcq-home">
      <div className="mcq-home-inner">

        {/* Header */}
        <div className="mcq-home-header">
          <div className="mcq-home-title-row">
            <div>
              <h1 className="mcq-home-title">Multiple Choice</h1>
              <p className="mcq-home-sub">390 questions · 13 subjects</p>
            </div>
            <button className="mcq-quick-btn" onClick={onStartRandom}>
              Quick practice <span className="mcq-quick-count">10 random</span>
            </button>
          </div>

          {totalAttempted > 0 && (
            <div className="mcq-overview-stats">
              <div className="mcq-stat">
                <span className="mcq-stat-val">{totalAttempted}</span>
                <span className="mcq-stat-label">attempted</span>
              </div>
              <div className="mcq-stat">
                <span className="mcq-stat-val">{overallPct}%</span>
                <span className="mcq-stat-label">accuracy</span>
              </div>
              <div className="mcq-stat">
                <span className="mcq-stat-val">{totalQuestions - totalAttempted}</span>
                <span className="mcq-stat-label">unseen</span>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <p className="mcq-loading">Loading…</p>
        ) : (
          <>
            <SubjectGroup label="FLK 1" subjects={flk1} onStart={onStartSubject} />
            <SubjectGroup label="FLK 2" subjects={flk2} onStart={onStartSubject} />
          </>
        )}
      </div>
    </div>
  );
};

const SubjectGroup = ({ label, subjects, onStart }) => (
  <div className="mcq-group">
    <div className="mcq-group-label">{label}</div>
    <div className="mcq-subject-grid">
      {subjects.map(s => {
        const meta    = SUBJECT_META[s.name] || {};
        const pct     = s.attempted > 0 ? Math.round((s.correct_count / s.attempted) * 100) : null;
        const unseen  = s.total - (s.attempted || 0);
        return (
          <button
            key={s.id}
            className="mcq-subject-card"
            style={{ '--subject-color': meta.color || 'var(--color-accent-gold)' }}
            onClick={() => onStart(s)}
          >
            <div className="mcq-subject-top">
              <span className="mcq-subject-abbr">{meta.abbr}</span>
              {pct !== null && (
                <span className="mcq-subject-pct" style={{ color: pct >= 70 ? '#7EB8A4' : pct >= 50 ? '#C8A96E' : '#C47B7B' }}>
                  {pct}%
                </span>
              )}
            </div>
            <div className="mcq-subject-name">{s.name}</div>
            <div className="mcq-subject-meta">
              <span>{s.total} questions</span>
              {unseen > 0 && <span className="mcq-unseen">{unseen} unseen</span>}
            </div>
            {s.attempted > 0 && (
              <div className="mcq-subject-bar">
                <div
                  className="mcq-subject-bar-fill"
                  style={{ width: `${Math.round((s.correct_count / s.total) * 100)}%`, background: meta.color }}
                />
              </div>
            )}
          </button>
        );
      })}
    </div>
  </div>
);

export default MCQHome;
