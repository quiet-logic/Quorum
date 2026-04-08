import { useState } from 'react';
import { useUser } from '../../UserContext';
import './MCQSession.css';

const MCQSession = ({ questions, subjectName, onComplete, onHome }) => {
  const { apiFetch } = useUser();
  const [index, setIndex]       = useState(0);
  const [selected, setSelected] = useState(null);  // null | 'A'|'B'|'C'|'D'|'E'
  const [revealed, setRevealed] = useState(false);
  const [results, setResults]   = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const question = questions[index];
  const progress = ((index) / questions.length) * 100;

  const options = [
    { key: 'A', text: question.option_a },
    { key: 'B', text: question.option_b },
    { key: 'C', text: question.option_c },
    { key: 'D', text: question.option_d },
    ...(question.option_e ? [{ key: 'E', text: question.option_e }] : []),
  ];

  const handleSelect = async (key) => {
    if (revealed || submitting) return;
    setSelected(key);
    setRevealed(true);
    setSubmitting(true);

    try {
      await apiFetch('/api/mcq/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: question.question_id, selected: key }),
      });
    } catch { /* non-fatal */ }

    setResults(prev => [...prev, {
      question,
      selected: key,
      correct: key === question.correct,
    }]);
    setSubmitting(false);
  };

  const handleNext = () => {
    if (index + 1 >= questions.length) {
      onComplete([...results]);
    } else {
      setIndex(i => i + 1);
      setSelected(null);
      setRevealed(false);
    }
  };

  const optionState = (key) => {
    if (!revealed) return 'default';
    if (key === question.correct) return 'correct';
    if (key === selected) return 'wrong';
    return 'default';
  };

  return (
    <div className="mcq-session">
      {/* Session nav */}
      <div className="mcq-session-nav">
        <button className="mcq-nav-home" onClick={onHome}>← Exit</button>
        <div className="mcq-nav-centre">
          <span className="mcq-nav-subject">{subjectName}</span>
          <span className="mcq-nav-count">{index + 1} / {questions.length}</span>
        </div>
        <div className="mcq-nav-spacer" />
      </div>

      {/* Progress bar */}
      <div className="mcq-progress-track">
        <div className="mcq-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Question */}
      <div className="mcq-content">
        <div className="mcq-card">
          <p className="mcq-code">{question.question_id}</p>
          <p className="mcq-stem">{question.stem}</p>

          <div className="mcq-options">
            {options.map(({ key, text }) => (
              <button
                key={key}
                className={`mcq-option mcq-option--${optionState(key)}`}
                onClick={() => handleSelect(key)}
                disabled={revealed}
              >
                <span className="mcq-option-key">{key}</span>
                <span className="mcq-option-text">{text}</span>
              </button>
            ))}
          </div>

          {/* Explanation */}
          {revealed && (
            <div className={`mcq-explanation mcq-explanation--${selected === question.correct ? 'correct' : 'wrong'}`}>
              <p className="mcq-explanation-verdict">
                {selected === question.correct ? 'Correct' : `Incorrect — answer is ${question.correct}`}
              </p>
              <p className="mcq-explanation-text">{question.explanation}</p>
            </div>
          )}
        </div>

        {revealed && (
          <button className="mcq-next-btn" onClick={handleNext}>
            {index + 1 >= questions.length ? 'See results' : 'Next question'}
          </button>
        )}
      </div>
    </div>
  );
};

export default MCQSession;
