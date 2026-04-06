import { useState } from 'react';
import FlipCard from './FlipCard';
import './StudySession.css';

const StudySession = ({ onHome, onComplete, deckOverride, subjectAccent = '#C8A96E' }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState([]);

  const card = deckOverride[currentIndex];

  if (!card) return <div className="mono" style={{ padding: 40 }}>No cards to study.</div>;

  const handleRate = (score) => {
    // Fire-and-forget to backend — don't block UI on the response
    fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_code: card.card_code, score }),
    })
      .then(res => res.json())
      .then(data => console.log(`[SM-2] ${card.card_code} → next review ${data.next_review} (interval: ${data.interval}d)`))
      .catch(err => console.warn('[SM-2] Review sync failed:', err));

    const updatedResults = [...results, { card, score }];
    setResults(updatedResults);

    if (currentIndex < deckOverride.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      onComplete(updatedResults);
    }
  };

  return (
    <div className="session-wrapper">
      <nav className="masthead">
        <div className="breadcrumb-session mono">
          <span>{card.subjectName}</span>
          {card.topicName && <> · <span>{card.topicName}</span></>}
        </div>
        <button className="end-session-btn outfit" onClick={onHome}>End Session</button>
      </nav>

      <div className="session-container">
        <FlipCard
          question={card.front}
          answer={card.answer}
          cardType={card.card_type}
          cardCode={card.card_code}
          difficulty={card.difficulty}
          summaryLine={card.summary_line}
          issue={card.issue}
          rule={card.rule}
          application={card.application}
          conclusion={card.conclusion}
          subjectAccent={subjectAccent}
          currentCard={currentIndex + 1}
          totalCards={deckOverride.length}
          onRate={handleRate}
        />
      </div>
    </div>
  );
};

export default StudySession;
