import { useState } from 'react';
import Home from './components/Home';
import StudySession from './components/StudySession';
import Results from './components/Results';
import TopicMap from './components/TopicMap';
import CardBrowser from './components/CardBrowser';

// Map home IDs → subject accent colours
const SUBJECT_ACCENT = {
  '01': '#C8A96E', // BLP
  '02': '#7BAED4', // DR
  '03': '#C8A96E', // CON
  '04': '#7EB8A4', // TORT
  '05': '#7BAED4', // LSEW
  '06': '#7BAED4', // LS
  '07': '#9B8EC4', // PROP
  '08': '#C47B7B', // WTP
  '09': '#7BAED4', // SA
  '10': '#9B8EC4', // LAND
  '11': '#9B8EC4', // TRUST
  '12': '#C47B7B', // CRIM
};

function App() {
  const [view, setView]                 = useState('home');
  const [activeDeck, setActiveDeck]     = useState([]);
  const [activeAccent, setActiveAccent] = useState('#C8A96E');
  const [activeSubject, setActiveSubject] = useState(null);
  const [sessionResults, setSessionResults] = useState([]);

  // ── Shared deck launcher ─────────────────────────────────────────────────

  const launchDeck = (cards, sub, accent = '#C8A96E') => {
    // Normalise API snake_case fields to camelCase for StudySession/FlipCard
    const deck = cards.map(c => ({
      ...c,
      subjectName: c.subject_name,
      topicName:   c.topic_name,
    }));
    setActiveDeck(deck);
    setActiveAccent(sub ? (SUBJECT_ACCENT[sub.id] ?? '#C8A96E') : accent);
    setActiveSubject(sub ?? null);
    setSessionResults([]);
    setView('study');
  };

  // ── Session starters ─────────────────────────────────────────────────────

  // General or topic-level session: 15 cards, difficulty-scaled via /api/study/session
  const startStudySession = async (sub = null, topicId = null, flk = null) => {
    let url = '/api/study/session?limit=15';
    if (topicId)        url += `&topic_id=${topicId}`;
    else if (sub?.dbId) url += `&subject_id=${sub.dbId}`;
    if (flk)            url += `&flk=${flk}`;

    try {
      const res  = await fetch(url);
      const data = await res.json();
      const cards = data.cards ?? [];
      if (!cards.length) {
        alert('No cards due — check back tomorrow.');
        return;
      }
      const accent = flk === 'FLK2' ? '#9B8EC4' : '#C8A96E';
      launchDeck(cards, sub, accent);
    } catch {
      alert('Could not load session — is the backend running?');
    }
  };

  // Subtopic-level session: all due cards for one subtopic (from TopicMap)
  const startSubtopicStudy = async (sub, subtopicId) => {
    try {
      const res  = await fetch(`/api/study/subtopic/${subtopicId}`);
      const data = await res.json();
      const cards = data.cards ?? [];
      if (!cards.length) {
        alert('No cards due for this subtopic.');
        return;
      }
      launchDeck(cards, sub);
    } catch {
      alert('Could not load session — is the backend running?');
    }
  };

  // ── Navigation ────────────────────────────────────────────────────────────

  const viewTopicMap = (subject) => {
    setActiveSubject(subject);
    setView('topicmap');
  };

  const viewCardBrowser = () => setView('cardbrowser');

  const handleSessionComplete = (results) => {
    setSessionResults(results);
    setView('results');
  };

  return (
    <div className="App">
      {view === 'home' && (
        <Home
          onStartStudy={startStudySession}
          onViewTopicMap={viewTopicMap}
          onViewCardBrowser={viewCardBrowser}
        />
      )}
      {view === 'cardbrowser' && (
        <CardBrowser onHome={() => setView('home')} />
      )}
      {view === 'topicmap' && (
        <TopicMap
          subject={activeSubject}
          onHome={() => setView('home')}
          onStartStudy={() => startStudySession(activeSubject)}
          onStudySubtopic={(subtopicId) => startSubtopicStudy(activeSubject, subtopicId)}
        />
      )}
      {view === 'study' && (
        <StudySession
          deckOverride={activeDeck}
          subjectAccent={activeAccent}
          onHome={() => setView('home')}
          onComplete={handleSessionComplete}
        />
      )}
      {view === 'results' && (
        <Results
          results={sessionResults}
          subjectAccent={activeAccent}
          onHome={() => setView('home')}
          onStudyAgain={() => startStudySession(activeSubject)}
        />
      )}
    </div>
  );
}

export default App;
