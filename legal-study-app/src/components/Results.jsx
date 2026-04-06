import './Results.css';

const SCORE_META = [
  { score: 0, label: 'Blank',   group: 'reset'     },
  { score: 1, label: 'Hard',    group: 'reset'     },
  { score: 2, label: 'Wrong',   group: 'reset'     },
  { score: 3, label: 'Tricky',  group: 'advancing' },
  { score: 4, label: 'Good',    group: 'advancing' },
  { score: 5, label: 'Perfect', group: 'advancing' },
];

const Results = ({ results, subjectAccent = '#C8A96E', onHome, onStudyAgain }) => {
  const total = results.length;

  // Per-score counts
  const counts = Object.fromEntries(SCORE_META.map(m => [m.score, 0]));
  results.forEach(({ score }) => { counts[score] = (counts[score] ?? 0) + 1; });

  const advancing = results.filter(r => r.score >= 3).length;
  const reset     = total - advancing;
  const maxCount  = Math.max(...Object.values(counts), 1);

  const subjectName = results[0]?.card?.subjectName ?? 'Session';

  return (
    <div className="results-wrapper">
      <nav className="masthead">
        <div className="breadcrumb-session mono">Session Complete</div>
        <button className="end-session-btn outfit" onClick={onHome}>Back to Dashboard</button>
      </nav>

      <div className="results-container">

        {/* Heading */}
        <div className="results-heading">
          <h1 className="playfair" style={{ borderLeft: `3px solid ${subjectAccent}`, paddingLeft: '16px' }}>
            {subjectName}
          </h1>
          <p className="mono results-subtitle">Session complete</p>
        </div>

        {/* Stats strip */}
        <div className="results-stats">
          <div className="result-stat">
            <span className="stat-value mono">{total}</span>
            <span className="stat-label mono">Cards Reviewed</span>
          </div>
          <div className="result-stat" style={{ '--stat-accent': '#7EB8A4' }}>
            <span className="stat-value mono">{advancing}</span>
            <span className="stat-label mono">Advancing</span>
          </div>
          <div className="result-stat" style={{ '--stat-accent': '#C47B7B' }}>
            <span className="stat-value mono">{reset}</span>
            <span className="stat-label mono">Reset</span>
          </div>
        </div>

        {/* Score breakdown */}
        <div className="score-breakdown">
          <p className="breakdown-title mono">Score Breakdown</p>
          {SCORE_META.map(({ score, label, group }) => {
            const count = counts[score];
            const pct   = (count / maxCount) * 100;
            return (
              <div key={score} className={`score-row score-row--${group}`}>
                <span className="score-num mono">{score}</span>
                <span className="score-label-text outfit">{label}</span>
                <div className="score-bar-track">
                  <div className="score-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="score-count mono">{count}</span>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="results-actions">
          <button className="results-btn results-btn--primary outfit" onClick={onStudyAgain}>
            Study Again
          </button>
          <button className="results-btn results-btn--ghost outfit" onClick={onHome}>
            Back to Dashboard
          </button>
        </div>

      </div>
    </div>
  );
};

export default Results;
