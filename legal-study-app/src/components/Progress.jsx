import { useState, useEffect } from 'react';
import { useUser } from '../UserContext';
import './Progress.css';
import { subjectColor } from '../subjectColor';

// Format YYYY-MM-DD → "Apr 6"
const fmtDate = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const Progress = ({ onHome }) => {
  const { apiFetch } = useUser();
  const [subjects,  setSubjects]  = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/subjects').then(r => r.json()),
      apiFetch('/api/analytics').then(r => r.json()),
    ])
      .then(([subs, anal]) => {
        setSubjects(subs);
        setAnalytics(anal);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="prog-wrapper">
      <nav className="prog-masthead">
        <div className="prog-masthead-left">
          <span className="wordmark-text playfair">Quorum</span>
          <div className="tm-separator" />
          <span className="tm-breadcrumb mono">Progress</span>
        </div>
        <button className="tm-back-btn outfit" onClick={onHome}>Dashboard</button>
      </nav>

      <div className="prog-container">
        {loading && <p className="mono tm-status">Loading…</p>}

        {!loading && analytics && (
          <>
            <SubjectOverview subjects={subjects} />
            <Heatmap data={analytics.heatmap} />
            <div className="prog-row">
              <Forecast data={analytics.forecast} />
              <Retention data={analytics.retention} />
            </div>
            <WeakTopics data={analytics.weak_topics} />
          </>
        )}
      </div>
    </div>
  );
};


// ── Subject Overview ──────────────────────────────────────────────────────────

const SubjectOverview = ({ subjects }) => (
  <section className="prog-section">
    <h2 className="prog-section-title playfair">Subject Progress</h2>
    <div className="prog-subject-grid">
      {subjects.map(s => (
        <div key={s.id} className="prog-subject-card">
          <div className="prog-subject-top">
            <span className="prog-subject-abbr mono" style={{ color: subjectColor(s.abbr) }}>
              {s.abbr}
            </span>
            <span className="prog-subject-pct mono">{s.progress_pct}%</span>
          </div>
          <p className="prog-subject-name outfit">{s.name}</p>
          <div className="prog-bar-track">
            <div
              className="prog-bar-fill"
              style={{ width: `${s.progress_pct}%`, background: subjectColor(s.abbr) }}
            />
          </div>
          <span className="prog-subject-meta mono">
            {s.reviewed} / {s.total_cards} reviewed
          </span>
        </div>
      ))}
    </div>
  </section>
);


// ── Heatmap ───────────────────────────────────────────────────────────────────

const Heatmap = ({ data }) => {
  // Build a full 60-day map so empty days render
  const map = Object.fromEntries(data.map(d => [d.date, d.count]));
  const days = [];
  for (let i = 59; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push({ date: iso, count: map[iso] ?? 0 });
  }
  const max = Math.max(...days.map(d => d.count), 1);

  return (
    <section className="prog-section">
      <h2 className="prog-section-title playfair">Activity — Last 60 Days</h2>
      <div className="heatmap-grid">
        {days.map(({ date, count }) => {
          const intensity = count === 0 ? 0 : Math.ceil((count / max) * 4);
          return (
            <div
              key={date}
              className={`heatmap-cell heatmap-cell--${intensity}`}
              title={`${fmtDate(date)}: ${count} review${count !== 1 ? 's' : ''}`}
            />
          );
        })}
      </div>
      <div className="heatmap-legend mono">
        <span>Less</span>
        {[0,1,2,3,4].map(i => <div key={i} className={`heatmap-cell heatmap-cell--${i}`} />)}
        <span>More</span>
      </div>
    </section>
  );
};


// ── Forecast ──────────────────────────────────────────────────────────────────

const Forecast = ({ data }) => {
  const max = Math.max(...data.map(d => d.due), 1);
  return (
    <section className="prog-section prog-section--half">
      <h2 className="prog-section-title playfair">Due This Week</h2>
      <div className="forecast-bars">
        {data.map(({ date, due }) => (
          <div key={date} className="forecast-col">
            <span className="forecast-count mono">{due > 0 ? due : ''}</span>
            <div className="forecast-bar-track">
              <div
                className="forecast-bar-fill"
                style={{ height: `${(due / max) * 100}%` }}
              />
            </div>
            <span className="forecast-label mono">{fmtDate(date)}</span>
          </div>
        ))}
      </div>
    </section>
  );
};


// ── Retention curve ───────────────────────────────────────────────────────────

const Retention = ({ data }) => {
  if (!data.length) {
    return (
      <section className="prog-section prog-section--half">
        <h2 className="prog-section-title playfair">Daily Accuracy</h2>
        <p className="mono tm-status" style={{ padding: '20px 0' }}>No data yet.</p>
      </section>
    );
  }

  const h = 120;
  const w = 100; // SVG viewBox units
  const pts = data.map((d, i) => {
    const x = data.length === 1 ? 50 : (i / (data.length - 1)) * w;
    const y = h - (d.pct / 100) * h;
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  const area = `0,${h} ${pts.join(' ')} ${w},${h}`;

  return (
    <section className="prog-section prog-section--half">
      <h2 className="prog-section-title playfair">Daily Accuracy (30 days)</h2>
      <div className="retention-chart">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="retention-svg">
          <polygon points={area} className="retention-area" />
          <polyline points={polyline} className="retention-line" fill="none" />
        </svg>
        <div className="retention-labels mono">
          <span>{data[0] ? fmtDate(data[0].date) : ''}</span>
          <span>{data[data.length - 1] ? fmtDate(data[data.length - 1].date) : ''}</span>
        </div>
      </div>
      <div className="retention-summary mono">
        Avg accuracy: {Math.round(data.reduce((s, d) => s + d.pct, 0) / data.length)}%
      </div>
    </section>
  );
};


// ── Weak Topics ───────────────────────────────────────────────────────────────

const WeakTopics = ({ data }) => (
  <section className="prog-section">
    <h2 className="prog-section-title playfair">Weak Spots</h2>
    {data.length === 0 ? (
      <p className="mono" style={{ fontSize: '12px', color: 'var(--muted)', padding: '20px 0' }}>
        Keep studying — weak spots appear after 3+ reviews per topic.
      </p>
    ) : (
      <div className="weak-list">
        {data.map((t, i) => (
          <div key={i} className="weak-row">
            <span className="weak-rank mono">{String(i + 1).padStart(2, '0')}</span>
            <div className="weak-info">
              <span className="weak-topic outfit">{t.topic}</span>
              <span className="weak-subject mono">{t.subject}</span>
            </div>
            <div className="weak-score-wrap">
              <div className="weak-bar-track">
                <div
                  className="weak-bar-fill"
                  style={{ width: `${(t.avg_score / 5) * 100}%` }}
                />
              </div>
              <span className="weak-score mono">{t.avg_score.toFixed(1)}</span>
            </div>
            <span className="weak-reviews mono">{t.reviews} reviews</span>
          </div>
        ))}
      </div>
    )}
  </section>
);


export default Progress;
