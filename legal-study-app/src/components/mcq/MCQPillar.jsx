import { useState } from 'react';
import { useUser } from '../../UserContext';
import MCQHome from './MCQHome';
import MCQSession from './MCQSession';
import MCQResults from './MCQResults';

const MCQPillar = ({ onViewChange }) => {
  const { apiFetch } = useUser();
  const [view, setView]           = useState('home');   // 'home' | 'session' | 'results'

  const changeView = (v) => { setView(v); onViewChange?.(v); };
  const [questions, setQuestions] = useState([]);
  const [subjectName, setSubjectName] = useState('Practice');
  const [results, setResults]     = useState([]);
  const [error, setError]         = useState('');

  const startSession = async (subject) => {
    setError('');
    try {
      const res  = await apiFetch(`/api/mcq/random?subject_id=${subject.id}&limit=10`);
      const data = await res.json();
      if (!data.questions?.length) { setError('No questions available for this subject.'); return; }
      setQuestions(data.questions);
      setSubjectName(subject.name);
      setResults([]);
      changeView('session');
    } catch {
      setError('Could not load questions — is the backend running?');
    }
  };

  const startRandom = async () => {
    setError('');
    try {
      const res  = await apiFetch('/api/mcq/random?limit=10');
      const data = await res.json();
      if (!data.questions?.length) { setError('No questions available yet.'); return; }
      setQuestions(data.questions);
      setSubjectName('Mixed practice');
      setResults([]);
      changeView('session');
    } catch {
      setError('Could not load questions — is the backend running?');
    }
  };

  const handleComplete = (sessionResults) => {
    setResults(sessionResults);
    changeView('results');
  };

  const handleHome = () => {
    changeView('home');
    setError('');
  };

  const handleRetry = () => {
    setResults([]);
    changeView('session');
  };

  if (view === 'session') {
    return (
      <MCQSession
        questions={questions}
        subjectName={subjectName}
        onComplete={handleComplete}
        onHome={handleHome}
      />
    );
  }

  if (view === 'results') {
    return (
      <MCQResults
        results={results}
        subjectName={subjectName}
        onHome={handleHome}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <>
      {error && (
        <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color: '#C47B7B',
                    padding: '16px 32px', margin: 0 }}>
          {error}
        </p>
      )}
      <MCQHome onStartSubject={startSession} onStartRandom={startRandom} />
    </>
  );
};

export default MCQPillar;
