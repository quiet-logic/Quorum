import React, { useState, useEffect, useRef } from 'react';
import { useDisplayMode } from '../../DisplayModeContext';
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
  const { mode } = useDisplayMode();
  const isCalm = mode === 'calm';
  const isFocus = mode === 'focus';

  const [phase, setPhase]           = useState('front');   // 'front' | 'collapsing' | 'back'
  const [showRating, setShowRating] = useState(false);
  const [slideClass, setSlideClass] = useState('');
  const [frontHeight, setFrontHeight] = useState(null);
  const [perfectFlash, setPerfectFlash] = useState(false); // focus mode micro-reward

  const frontRef  = useRef(null);
  const touchStart = useRef(null);

  const isFlipped = phase === 'back';

  // Measure front height on mount and on card change
  useEffect(() => {
    setPhase('front');
    setShowRating(false);
    setPerfectFlash(false);
    setFrontHeight(null);
  }, [question]);

  useEffect(() => {
    if (phase === 'front' && frontRef.current) {
      setFrontHeight(frontRef.current.offsetHeight);
    }
  }, [phase, question]);

  // Show rating after flip
  useEffect(() => {
    let timer;
    if (isFlipped) {
      timer = setTimeout(() => setShowRating(true), 300);
    } else {
      setShowRating(false);
    }
    return () => clearTimeout(timer);
  }, [isFlipped]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleFlip();
      } else if (showRating && e.key >= '0' && e.key <= '5') {
        handleRate({ stopPropagation: () => {} }, parseInt(e.key, 10));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, showRating]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFlip = () => {
    if (phase !== 'front') return; // only flip forward

    if (isCalm) {
      // Calm mode: instant crossfade, no rotation
      setPhase('back');
      return;
    }

    // Two-phase collapse → expand
    setPhase('collapsing');
    setTimeout(() => {
      setPhase('back');
    }, 200); // Phase 1 duration
  };

  // Touch handlers
  const handleTouchStart = (e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
    if (Math.abs(dy) > Math.abs(dx)) {
      handleFlip();
    } else if (isFlipped && showRating) {
      handleRate(e, dx < 0 ? 1 : 4);
    }
  };

  const handleRate = (e, score) => {
    e.stopPropagation();

    // Focus mode: micro-reward flash on Perfect (score 5)
    if (isFocus && score === 5) {
      setPerfectFlash(true);
      setTimeout(() => setPerfectFlash(false), 350);
    }

    setSlideClass('slide-out');
    setTimeout(() => {
      onRate(score);
      setSlideClass('slide-in');
      setTimeout(() => setSlideClass(''), 280);
    }, 220);
  };

  const typeLabel = {
    1: 'Q&A', 2: 'IRAC', 3: 'Scenario', 4: 'Deeper', 5: 'Trap',
  }[cardType] ?? 'Q&A';

  const showDifficulty = difficulty && [1, 3].includes(cardType);

  // Summary line rendered separately so it stays pinned to the card bottom
  const renderSummary = () => {
    if (!summaryLine) return null;
    return (
      <div className="summary-line mono">
        {summaryLine.split('·').map((concept, i, arr) => (
          <React.Fragment key={i}>
            {concept.trim()}
            {i < arr.length - 1 && <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // Scrollable back content (label + summary excluded — both pinned separately)
  const renderBack = () => {
    if (cardType === 2) {
      return (
        <>
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
        </>
      );
    }

    if (cardType === 5) {
      return (
        <>
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

    return <p className="card-text outfit">{answer}</p>;
  };

  return (
    <div className="study-card-container">

      {/* Progress Strip */}
      {totalCards > 0 && (
        <div className="progress-strip">
          {Array.from({ length: totalCards }).map((_, i) => (
            <div
              key={i}
              className={`progress-segment${
                i < currentCard - 1 ? ' completed' :
                i === currentCard - 1 ? ' current' : ''
              }${isFocus && i === currentCard - 1 && !isFlipped ? ' focus-pulse' : ''}`}
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
        {showDifficulty && <span className="meta-tag mono">{difficulty}</span>}
        {cardCode && (
          <span className="mono" style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
            {cardCode}
          </span>
        )}
        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
          {isFlipped ? 'Space · click to flip back' : 'Space · click to flip'}
        </span>
      </div>

      {/* Flip Card */}
      <div
        className={`flip-card flip-card--${phase} ${slideClass}`}
        style={{
          '--subject-accent': subjectAccent,
          minHeight: phase === 'front' && frontHeight ? `${frontHeight}px` : undefined,
        }}
        onClick={phase === 'front' ? handleFlip : undefined}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {phase !== 'back' ? (
          <div ref={frontRef} className="card-face card-front">
            <span className="card-label mono">
              {cardType === 2 ? 'Case' : cardType === 5 ? '⚠ Trap Card' : 'Question'}
            </span>
            <p className="card-text outfit">{question}</p>
          </div>
        ) : (
          <div className="card-face card-back">
            <span className="card-label card-label--back mono">Answer</span>
            <div className="card-back-scroll">
              {renderBack()}
            </div>
            {renderSummary()}
          </div>
        )}
      </div>

      {/* Rating Buttons */}
      <div className={`rating-container${showRating ? ' visible' : ''}`}>
        <p className="rating-title mono">
          How well did you know this?{' '}
          <span style={{ opacity: 0.45 }}>· press 0–5</span>
        </p>
        <div className="rating-buttons">
          {ratings.map((r) => (
            <button
              key={r.score}
              className={`rating-btn${perfectFlash && r.score === 5 ? ' perfect-flash' : ''}`}
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
