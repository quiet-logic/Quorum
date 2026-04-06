import React, { useState, useEffect } from 'react';
import './FlipCard.css';

const ratings = [
  { score: 0, label: "Blank" },
  { score: 1, label: "Hard" },
  { score: 2, label: "Wrong" },
  { score: 3, label: "Tricky" },
  { score: 4, label: "Good" },
  { score: 5, label: "Perfect" }
];

const FlipCard = ({
  question,
  answer,
  cardType = 1,
  cardCode,
  difficulty,
  summaryLine,
  issue,
  rule,
  application,
  conclusion,
  subjectAccent = '#C8A96E',
  currentCard,
  totalCards,
  onRate,
}) => {
  const [isFlipped, setIsFlipped]     = useState(false);
  const [showRating, setShowRating]   = useState(false);
  const [slideClass, setSlideClass]   = useState('');

  // Reset card state when question changes (new card loaded)
  useEffect(() => {
    setIsFlipped(false);
    setShowRating(false);
  }, [question]);

  // Show rating buttons after flip, with slight delay
  useEffect(() => {
    let timer;
    if (isFlipped) {
      timer = setTimeout(() => setShowRating(true), 300);
    } else {
      setShowRating(false);
    }
    return () => clearTimeout(timer);
  }, [isFlipped]);

  const handleFlip = () => setIsFlipped(prev => !prev);

  const handleRate = (e, score) => {
    e.stopPropagation();

    // Slide out, notify parent, parent updates question prop to trigger reset
    setSlideClass('slide-out');
    setTimeout(() => {
      onRate(score);
      setSlideClass('slide-in');
      setTimeout(() => setSlideClass(''), 280);
    }, 220);
  };

  // Card type label for meta row
  const typeLabel = {
    1: 'Q&A',
    2: 'IRAC',
    3: 'Scenario',
    4: 'Deeper',
    5: 'Trap',
  }[cardType] ?? 'Q&A';

  // Difficulty only shown on Types 1 and 3
  const showDifficulty = difficulty && [1, 3].includes(cardType);

  // Back content varies by card type
  const renderBack = () => {
    // Type 2: IRAC layout
    if (cardType === 2) {
      return (
        <>
          <span className="card-label mono">Answer</span>
          <div className="irac-grid">
            <div className="irac-section issue">
              <span className="irac-label mono">Issue</span>
              <p className="irac-text outfit">{issue}</p>
            </div>
            <div className="irac-section rule">
              <span className="irac-label mono">Rule</span>
              <p className="irac-text outfit">{rule}</p>
            </div>
            <div className="irac-section application">
              <span className="irac-label mono">Application</span>
              <p className="irac-text outfit">{application}</p>
            </div>
            <div className="irac-section conclusion">
              <span className="irac-label mono">Conclusion</span>
              <p className="irac-text outfit">{conclusion}</p>
            </div>
          </div>
          {summaryLine && (
            <div className="summary-line mono">{summaryLine}</div>
          )}
        </>
      );
    }

    // Type 5: Trap layout — same IRAC columns, relabelled
    if (cardType === 5) {
      return (
        <>
          <span className="card-label mono">Answer</span>
          <div className="irac-grid">
            <div className="irac-section issue">
              <span className="irac-label mono">The Trap</span>
              <p className="irac-text outfit">{issue}</p>
            </div>
            <div className="irac-section rule">
              <span className="irac-label mono">The Reality</span>
              <p className="irac-text outfit">{rule}</p>
            </div>
            <div className="irac-section application">
              <span className="irac-label mono">Why the Distractor Fails</span>
              <p className="irac-text outfit">{application}</p>
            </div>
            <div className="irac-section conclusion">
              <span className="irac-label mono">The Key Rule</span>
              <p className="irac-text outfit">{conclusion}</p>
            </div>
          </div>
        </>
      );
    }

    // Types 1, 3, 4: standard answer
    return (
      <>
        <span className="card-label mono">Answer</span>
        <p className="card-text outfit">{answer}</p>
        {summaryLine && (
          <div className="summary-line mono">
            {summaryLine.split('·').map((concept, i, arr) => (
              <React.Fragment key={i}>
                {concept.trim()}
                {i < arr.length - 1 && <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>}
              </React.Fragment>
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="study-card-container">

      {/* Progress Strip */}
      {totalCards > 0 && (
        <div className="progress-strip">
          {Array.from({ length: totalCards }).map((_, i) => (
            <div
              key={i}
              className={`progress-segment ${
                i < currentCard - 1 ? 'completed' :
                i === currentCard - 1 ? 'current' : ''
              }`}
              style={i === currentCard - 1
                ? { background: subjectAccent }
                : i < currentCard - 1
                ? { background: subjectAccent, opacity: 0.4 }
                : {}
              }
            />
          ))}
          <span className="progress-count mono">
            {currentCard}/{totalCards}
          </span>
        </div>
      )}

      {/* Meta Row */}
      <div className="meta-row">
        <span className="meta-tag mono">{typeLabel}</span>
        {showDifficulty && (
          <span className="meta-tag mono">{difficulty}</span>
        )}
        {cardCode && (
          <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>
            {cardCode}
          </span>
        )}
        <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
          {isFlipped ? 'Click to flip back' : 'Click to flip'}
        </span>
      </div>

      {/* Flip Card */}
      <div
        className={`flip-card ${isFlipped ? 'is-flipped' : ''} ${slideClass}`}
        onClick={handleFlip}
        style={{ '--subject-accent': subjectAccent }}
      >
        <div className="flip-card-inner">

          {/* Front */}
          <div className="flip-card-front">
            <span className="card-label mono">
              {cardType === 2 ? 'Case' : cardType === 5 ? '⚠️ Trap Card' : 'Question'}
            </span>
            <p className="card-text outfit">{question}</p>
          </div>

          {/* Back */}
          <div className="flip-card-back">
            {renderBack()}
          </div>

        </div>
      </div>

      {/* Rating Buttons — appear after flip */}
      <div className={`rating-container ${showRating ? 'visible' : ''}`}>
        <p className="rating-title mono">How well did you know this?</p>
        <div className="rating-buttons">
          {ratings.map((r) => (
            <button
              key={r.score}
              className="rating-btn"
              onClick={(e) => handleRate(e, r.score)}
            >
              <span className="score-num mono">{r.score}</span>
              <span className="score-label outfit">{r.label}</span>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
};

export default FlipCard;