import { useState } from 'react';
import Home from './components/Home';
import StudySession from './components/StudySession';
import Results from './components/Results';
import TopicMap from './components/TopicMap';
import CardBrowser from './components/CardBrowser';
import Progress from './components/Progress';
import ExamSimulator from './components/ExamSimulator';
import ExamResults from './components/ExamResults';
import SyllabusMap from './components/SyllabusMap';
import ProfilePicker from './components/ProfilePicker';
import { useUser } from './UserContext';

// Map home IDs → subject accent colours
const SUBJECT_ACCENT = {
  '01': '#C8A96E', // BLP
  '02': '#7BAED4', // DR
  '03': '#7EC47B', // CON
  '04': '#7EB8A4', // TORT
  '05': '#C4C26B', // LSEW
  '06': '#C46BC4', // LS
  '07': '#6BB4C4', // CAL
  '08': '#A4816B', // PC
  '09': '#9B8EC4', // PROP
  '10': '#C47B7B', // WTP
  '11': '#6BC49B', // SA
  '12': '#88B46B', // LAND
  '13': '#7B8EC4', // TRUST
  '14': '#C46B8E', // CRIM
};

function App() {
  const { activeUser, apiFetch } = useUser();
  const [view, setView]                   = useState('home');
  const [activeDeck, setActiveDeck]       = useState([]);
  const [activeAccent, setActiveAccent]   = useState('#C8A96E');
  const [activeSubject, setActiveSubject] = useState(null);
  const [sessionResults, setSessionResults] = useState([]);
  const [examAnswers, setExamAnswers]     = useState([]);
  const [examConfig, setExamConfig]       = useState(null);

  // ── Shared deck launcher ─────────────────────────────────────────────────

  const launchDeck = (cards, sub, accent = '#C8A96E') => {
    const deck = cards.map(c => ({
      ...c,
      subjectName: c.subject_name || c.subjectName,
      topicName:   c.topic_name   || c.topicName,
    }));
    setActiveDeck(deck);
    setActiveAccent(sub ? (SUBJECT_ACCENT[sub.id] ?? '#C8A96E') : accent);
    setActiveSubject(sub ?? null);
    setSessionResults([]);
    setView('study');
  };

  // Launch an arbitrary card array (e.g. missed exam cards)
  const launchCustomDeck = (cards, accent = '#C8A96E') => {
    const deck = cards.map(c => ({
      ...c,
      subjectName: c.subject_name || c.subjectName,
      topicName:   c.topic_name   || c.topicName,
    }));
    setActiveDeck(deck);
    setActiveAccent(accent);
    setActiveSubject(null);
    setSessionResults([]);
    setView('study');
  };

  // ── Session starters ─────────────────────────────────────────────────────

  const startStudySession = async (sub = null, topicId = null, flk = null) => {
    let url = '/api/study/session?limit=15';
    if (topicId)        url += `&topic_id=${topicId}`;
    else if (sub?.dbId) url += `&subject_id=${sub.dbId}`;
    if (flk)            url += `&flk=${flk}`;

    try {
      const res  = await apiFetch(url);
      const data = await res.json();
      const cards = data.cards ?? [];
      if (!cards.length) { alert('No cards due — check back tomorrow.'); return; }
      const accent = flk === 'FLK2' ? '#9B8EC4' : '#C8A96E';
      launchDeck(cards, sub, accent);
    } catch {
      alert('Could not load session — is the backend running?');
    }
  };

  const startDeeperSession = async (sub) => {
    let url = '/api/study/session?limit=15&include_deeper=true';
    if (sub?.dbId) url += `&subject_id=${sub.dbId}`;
    try {
      const res  = await apiFetch(url);
      const data = await res.json();
      const cards = data.cards ?? [];
      if (!cards.length) { alert('No deeper cards due right now.'); return; }
      launchDeck(cards, sub, sub ? (SUBJECT_ACCENT[sub.id] ?? '#C8A96E') : '#C8A96E');
    } catch {
      alert('Could not load session — is the backend running?');
    }
  };

  const startSubtopicStudy = async (sub, subtopicId) => {
    try {
      const res  = await apiFetch(`/api/study/subtopic/${subtopicId}`);
      const data = await res.json();
      const cards = data.cards ?? [];
      if (!cards.length) { alert('No cards due for this subtopic.'); return; }
      launchDeck(cards, sub);
    } catch {
      alert('Could not load session — is the backend running?');
    }
  };

  const startConductSession = async () => {
    try {
      const res  = await apiFetch('/api/study/conduct?limit=20');
      const data = await res.json();
      const cards = data.cards ?? [];
      if (!cards.length) { alert('No conduct cards due — check back tomorrow.'); return; }
      launchDeck(cards, null, '#7EB8A4');
    } catch {
      alert('Could not load conduct session — is the backend running?');
    }
  };

  // ── Navigation ────────────────────────────────────────────────────────────

  const viewTopicMap    = (subject) => { setActiveSubject(subject); setView('topicmap'); };
  const viewCardBrowser = () => setView('cardbrowser');
  const viewProgress    = () => setView('progress');
  const viewSyllabusMap = () => setView('syllabusmap');
  const viewExam        = () => setView('exam');

  const handleSessionComplete = (results) => {
    setSessionResults(results);
    setView('results');
  };

  const handleExamComplete = (answers, cfg) => {
    setExamAnswers(answers);
    setExamConfig(cfg);
    setView('examresults');
  };

  if (!activeUser) return <ProfilePicker />;

  return (
    <div className="App">
      {view === 'home' && (
        <Home
          onStartStudy={startStudySession}
          onViewTopicMap={viewTopicMap}
          onViewCardBrowser={viewCardBrowser}
          onViewProgress={viewProgress}
          onViewSyllabusMap={viewSyllabusMap}
          onStartConduct={startConductSession}
          onStartExam={viewExam}
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
          onGoDeeper={() => startDeeperSession(activeSubject)}
        />
      )}
      {view === 'progress' && (
        <Progress onHome={() => setView('home')} />
      )}
      {view === 'exam' && (
        <ExamSimulator
          onHome={() => setView('home')}
          onComplete={handleExamComplete}
        />
      )}
      {view === 'examresults' && (
        <ExamResults
          answers={examAnswers}
          config={examConfig}
          subjectAccent={activeAccent}
          onHome={() => setView('home')}
          onStudyMissed={(cards) => launchCustomDeck(cards, '#C47B7B')}
        />
      )}
      {view === 'syllabusmap' && (
        <SyllabusMap
          onHome={() => setView('home')}
          onStudySubtopic={(subtopicId, subject) => startSubtopicStudy(
            { id: subject.id, dbId: subject.id, name: subject.name },
            subtopicId,
          )}
        />
      )}
    </div>
  );
}

export default App;
