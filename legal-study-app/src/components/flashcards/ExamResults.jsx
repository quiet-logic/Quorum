import './ExamResults.css';

const scoreColor = (pct) => {
  if (pct >= 70) return '#7EB8A4';
  if (pct >= 50) return '#C8A96E';
  return '#C47B7B';
};

const ExamResults = ({ answers, config, onHome, onStudyMissed }) => {
  const total     = answers.length;
  const correct   = answers.filter(a => a.correct).length;
  const incorrect = total - correct;
  const pct       = total ? Math.round(correct / total * 100) : 0;

  // By subject
  const bySubject = {};
  answers.forEach(({ card, correct: c }) => {
    const name = card.subject_name || card.subjectName || 'Unknown';
    if (!bySubject[name]) bySubject[name] = { correct: 0, total: 0 };
    bySubject[name].total++;
    if (c) bySubject[name].correct++;
  });

  // By difficulty
  const byDiff = {};
  const DIFF_ORDER = ['Foundation', 'Application', 'Complex'];
  answers.forEach(({ card, correct: c }) => {
    const d = card.difficulty || 'Case / Scenario';
    if (!byDiff[d]) byDiff[d] = { correct: 0, total: 0 };
    byDiff[d].total++;
    if (c) byDiff[d].correct++;
  });

  const missedCards = answers.filter(a => !a.correct).map(a => a.card);

  // Sort subjects by score ascending (weakest first)
  const subjectRows = Object.entries(bySubject).sort((a, b) => {
    const pA = a[1].correct / a[1].total;
    const pB = b[1].correct / b[1].total;
    return pA - pB;
  });

  const diffRows = [...DIFF_ORDER, 'Case / Scenario']
    .filter(d => byDiff[d])
    .map(d => [d, byDiff[d]]);

  return (
    <div className="exam-results-wrapper">
      <nav className="masthead">
        <div className="breadcrumb-session mono">Exam Results</div>
        <button className="end-session-btn outfit" onClick={onHome}>Back to Dashboard</button>
      </nav>

      <div className="exam-results-container">

        {/* Heading */}
        <div className="exam-results-heading">
          <h1 className="playfair" style={{ borderLeft: `3px solid ${scoreColor(pct)}`, paddingLeft: '16px' }}>
            {config?.label ?? 'Practice'} Paper
          </h1>
          <p className="mono exam-results-subtitle">Simulation complete</p>
        </div>

        {/* Score strip */}
        <div className="exam-score-strip">
          <div className="exam-score-stat">
            <span className="stat-value mono" style={{ color: scoreColor(pct) }}>
              {pct}<small>%</small>
            </span>
            <span className="stat-label mono">Score</span>
          </div>
          <div className="exam-score-stat">
            <span className="stat-value mono">{total}</span>
            <span className="stat-label mono">Attempted</span>
          </div>
          <div className="exam-score-stat">
            <span className="stat-value mono" style={{ color: '#7EB8A4' }}>{correct}</span>
            <span className="stat-label mono">Correct</span>
          </div>
          <div className="exam-score-stat">
            <span className="stat-value mono" style={{ color: '#C47B7B' }}>{incorrect}</span>
            <span className="stat-label mono">Incorrect</span>
          </div>
        </div>

        {/* Subject breakdown */}
        <div className="exam-breakdown">
          <p className="breakdown-title mono">By Subject — weakest first</p>
          {subjectRows.map(([name, data]) => {
            const p = Math.round(data.correct / data.total * 100);
            return (
              <div key={name} className="exam-breakdown-row">
                <span className="exam-breakdown-name outfit">{name}</span>
                <div className="score-bar-track">
                  <div
                    className="score-bar-fill"
                    style={{ width: `${p}%`, background: scoreColor(p) }}
                  />
                </div>
                <span className="exam-breakdown-score mono">{data.correct}/{data.total}</span>
              </div>
            );
          })}
        </div>

        {/* Difficulty breakdown */}
        <div className="exam-breakdown">
          <p className="breakdown-title mono">By Difficulty</p>
          {diffRows.map(([d, data]) => {
            const p = Math.round(data.correct / data.total * 100);
            return (
              <div key={d} className="exam-breakdown-row">
                <span className="exam-breakdown-name outfit">{d}</span>
                <div className="score-bar-track">
                  <div
                    className="score-bar-fill"
                    style={{ width: `${p}%`, background: scoreColor(p) }}
                  />
                </div>
                <span className="exam-breakdown-score mono">{data.correct}/{data.total}</span>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="results-actions">
          {missedCards.length > 0 && (
            <button
              className="results-btn results-btn--primary outfit"
              onClick={() => onStudyMissed(missedCards)}
            >
              Study {missedCards.length} Missed Card{missedCards.length !== 1 ? 's' : ''}
            </button>
          )}
          <button className="results-btn results-btn--ghost outfit" onClick={onHome}>
            Back to Dashboard
          </button>
        </div>

      </div>
    </div>
  );
};

export default ExamResults;
