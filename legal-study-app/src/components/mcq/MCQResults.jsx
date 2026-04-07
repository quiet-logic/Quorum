import './MCQResults.css';

const MCQResults = ({ results, subjectName, onHome, onRetry }) => {
  const total   = results.length;
  const correct = results.filter(r => r.correct).length;
  const pct     = Math.round((correct / total) * 100);

  const grade = pct >= 80 ? { label: 'Excellent', color: '#7EB8A4' }
              : pct >= 60 ? { label: 'Good',      color: '#C8A96E' }
              :              { label: 'Keep going', color: '#C47B7B' };

  return (
    <div className="mcq-results">
      <div className="mcq-results-inner">

        {/* Score */}
        <div className="mcq-results-hero">
          <p className="mcq-results-subject">{subjectName}</p>
          <div className="mcq-results-score">
            <span className="mcq-results-pct" style={{ color: grade.color }}>{pct}%</span>
            <span className="mcq-results-fraction">{correct} / {total}</span>
          </div>
          <p className="mcq-results-grade" style={{ color: grade.color }}>{grade.label}</p>
        </div>

        {/* Actions */}
        <div className="mcq-results-actions">
          <button className="mcq-results-btn mcq-results-btn--primary" onClick={onRetry}>
            Practice again
          </button>
          <button className="mcq-results-btn mcq-results-btn--outline" onClick={onHome}>
            All subjects
          </button>
        </div>

        {/* Breakdown */}
        <div className="mcq-results-breakdown">
          <p className="mcq-breakdown-label">Question breakdown</p>
          {results.map((r, i) => (
            <div key={i} className={`mcq-breakdown-row mcq-breakdown-row--${r.correct ? 'correct' : 'wrong'}`}>
              <div className="mcq-breakdown-indicator" />
              <div className="mcq-breakdown-content">
                <p className="mcq-breakdown-stem">{r.question.stem}</p>
                <p className="mcq-breakdown-answer">
                  {r.correct
                    ? <span className="mcq-bd-correct">Correct — {r.question.correct}</span>
                    : <span className="mcq-bd-wrong">You chose {r.selected} · Correct: {r.question.correct}</span>
                  }
                </p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

export default MCQResults;
