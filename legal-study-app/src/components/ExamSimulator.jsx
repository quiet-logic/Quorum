import { useState, useEffect, useRef } from 'react';
import './ExamSimulator.css';

const CONFIGS = [
  { label: '30 min',  duration: 30,  cards: 15 },
  { label: '60 min',  duration: 60,  cards: 30 },
  { label: '3 hours', duration: 180, cards: 90 },
];

// ── Config screen ─────────────────────────────────────────────────────────────

const ExamConfig = ({ config, setConfig, flk, setFlk, onStart, onHome, loading }) => (
  <div className="exam-wrapper">
    <nav className="masthead">
      <div className="breadcrumb-session mono">Exam Simulator</div>
      <button className="end-session-btn outfit" onClick={onHome}>Back</button>
    </nav>
    <div className="session-container">
      <div className="exam-config">

        <div className="exam-config-heading">
          <h1 className="playfair" style={{ borderLeft: '3px solid #C8A96E', paddingLeft: '16px' }}>
            Exam Simulator
          </h1>
          <p className="mono" style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '8px' }}>
            Configure your practice paper
          </p>
        </div>

        <div className="exam-config-section">
          <p className="exam-config-label mono">Paper</p>
          <div className="exam-config-options">
            {[
              { value: 'FLK1', label: 'FLK 1' },
              { value: 'both', label: 'Both Papers' },
              { value: 'FLK2', label: 'FLK 2' },
            ].map(({ value, label }) => (
              <button
                key={value}
                className={`exam-config-opt ${flk === value ? 'active' : ''}`}
                onClick={() => setFlk(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="exam-config-section">
          <p className="exam-config-label mono">Duration</p>
          <div className="exam-config-options">
            {CONFIGS.map(c => (
              <button
                key={c.label}
                className={`exam-config-opt ${config.label === c.label ? 'active' : ''}`}
                onClick={() => setConfig(c)}
              >
                <span>{c.label}</span>
                <span className="exam-config-opt-meta">{c.cards} questions</span>
              </button>
            ))}
          </div>
        </div>

        <div className="exam-config-note mono">
          Questions drawn proportionally from all subjects in the selected paper.
          Covers full syllabus — not limited to due cards.
        </div>

        <button
          className="exam-start-btn outfit"
          onClick={onStart}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Start Exam'}
        </button>
      </div>
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

const ExamSimulator = ({ onHome, onComplete }) => {
  const [phase, setPhase]         = useState('config');   // config | running
  const [config, setConfig]       = useState(CONFIGS[0]);
  const [flk, setFlk]             = useState('both');
  const [cards, setCards]         = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed]   = useState(false);
  const [answers, setAnswers]     = useState([]);
  const [timeLeft, setTimeLeft]   = useState(0);
  const [loading, setLoading]     = useState(false);
  const timerRef                  = useRef(null);
  const answersRef                = useRef([]);   // keeps closure-safe copy for timer expiry

  // Keep ref in sync with state
  useEffect(() => { answersRef.current = answers; }, [answers]);

  const startExam = async () => {
    setLoading(true);
    const flkParam = flk === 'both' ? '' : `&flk=${flk}`;
    try {
      const res  = await fetch(`/api/study/exam?limit=${config.cards}${flkParam}`);
      const data = await res.json();
      if (!data.cards?.length) {
        alert('No cards available for this configuration.');
        setLoading(false);
        return;
      }
      const deck = data.cards.map(c => ({
        ...c,
        subjectName: c.subject_name,
        topicName:   c.topic_name,
      }));
      setCards(deck);
      setCurrentIndex(0);
      setAnswers([]);
      setRevealed(false);
      setTimeLeft(config.duration * 60);
      setPhase('running');
    } catch {
      alert('Could not load exam — is the backend running?');
    }
    setLoading(false);
  };

  // Countdown timer
  useEffect(() => {
    if (phase !== 'running') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          // Time's up — complete with whatever was answered
          onComplete(answersRef.current, config);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnswer = (correct) => {
    const card = cards[currentIndex];
    const updated = [...answers, { card, correct }];
    setAnswers(updated);
    answersRef.current = updated;

    if (currentIndex < cards.length - 1) {
      setCurrentIndex(i => i + 1);
      setRevealed(false);
    } else {
      clearInterval(timerRef.current);
      onComplete(updated, config);
    }
  };

  // ── Config phase ──
  if (phase === 'config') {
    return (
      <ExamConfig
        config={config} setConfig={setConfig}
        flk={flk} setFlk={setFlk}
        onStart={startExam} onHome={onHome}
        loading={loading}
      />
    );
  }

  // ── Running phase ──
  const card = cards[currentIndex];
  if (!card) return null;

  const minutes    = Math.floor(timeLeft / 60);
  const seconds    = timeLeft % 60;
  const timeStr    = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const timeWarn   = timeLeft > 0 && timeLeft < 600; // < 10 min remaining

  const isIrac = card.card_type === 2 || card.card_type === 5;
  const trapLabels = { issue: 'The Trap', rule: 'The Reality', application: 'Why the Distractor Fails', conclusion: 'The Key Rule' };

  return (
    <div className="exam-wrapper">
      <nav className="masthead">
        <div className="breadcrumb-session mono">Exam Simulator</div>
        <div className={`exam-timer mono${timeWarn ? ' exam-timer--warning' : ''}`}>
          {timeStr}
        </div>
        <button className="end-session-btn outfit" onClick={onHome}>End Exam</button>
      </nav>

      <div className="session-container">

        {/* Progress strip */}
        <div className="exam-progress-strip">
          {cards.map((_, i) => (
            <div
              key={i}
              className={`exam-progress-seg ${
                i < currentIndex
                  ? (answers[i]?.correct ? 'correct' : 'incorrect')
                  : i === currentIndex ? 'current' : ''
              }`}
            />
          ))}
          <span className="progress-count mono">{currentIndex + 1}/{cards.length}</span>
        </div>

        {/* Meta row */}
        <div className="meta-row">
          <span className="meta-tag mono">{card.card_type === 2 ? 'Case' : card.card_type === 5 ? 'Trap' : card.card_type === 3 ? 'Scenario' : 'Q&A'}</span>
          {card.difficulty && <span className="meta-tag mono">{card.difficulty}</span>}
          <span className="meta-tag mono">{card.subject_name}</span>
          <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>{card.card_code}</span>
        </div>

        {/* Question */}
        <div className="exam-card">
          <span className="card-label mono">{card.card_type === 2 ? 'Case' : card.card_type === 5 ? '⚠️ Trap Card' : 'Question'}</span>
          <p className="card-text outfit">{card.front}</p>
        </div>

        {/* Reveal / Answer */}
        {!revealed ? (
          <div className="exam-actions">
            <button className="exam-reveal-btn outfit" onClick={() => setRevealed(true)}>
              Reveal Answer
            </button>
          </div>
        ) : (
          <>
            <div className="exam-answer">
              <span className="exam-answer-label mono">Answer</span>
              {isIrac ? (
                <div className="exam-irac">
                  {['issue', 'rule', 'application', 'conclusion'].map(field => (
                    <div key={field} className={`exam-irac-row irac-section ${field}`}>
                      <span className="exam-irac-label mono">
                        {card.card_type === 5 ? trapLabels[field] : field.charAt(0).toUpperCase() + field.slice(1)}
                      </span>
                      <p className="exam-irac-text outfit">{card[field]}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="exam-answer-text outfit">{card.answer}</p>
              )}
              {card.summary_line && (
                <div className="exam-summary mono">{card.summary_line}</div>
              )}
            </div>

            <div className="exam-judge-btns">
              <button className="exam-judge-btn exam-judge-btn--correct outfit" onClick={() => handleAnswer(true)}>
                Correct
              </button>
              <button className="exam-judge-btn exam-judge-btn--incorrect outfit" onClick={() => handleAnswer(false)}>
                Incorrect
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default ExamSimulator;
