import { useState, useEffect } from 'react';
import Landing from './components/shared/Landing';
import Masthead from './components/shared/Masthead';
import DisplayModeSelector from './components/shared/DisplayModeSelector';
import CrossPillarHome from './components/shared/CrossPillarHome';
import Home from './components/flashcards/Home';
import StudySession from './components/flashcards/StudySession';
import Results from './components/flashcards/Results';
import TopicMap from './components/flashcards/TopicMap';
import CardBrowser from './components/flashcards/CardBrowser';
import Progress from './components/flashcards/Progress';
import ExamSimulator from './components/flashcards/ExamSimulator';
import ExamResults from './components/flashcards/ExamResults';
import SyllabusMap from './components/flashcards/SyllabusMap';
import MCQPillar from './components/mcq/MCQPillar';
import CookieBanner from './components/shared/CookieBanner';
import Paywall from './components/shared/Paywall';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';
import './components/auth/AuthScreens.css';
import { useUser } from './UserContext';
import { useAuth } from './AuthContext';

// ── Subscription access check ──────────────────────────────────────────────────

function hasAccess(account) {
  if (!account) return false;
  if (account.invite_free_access) return true;
  const status = account.subscription_status;
  if (['active', 'past_due', 'trialing'].includes(status)) return true;
  // Server-side 1-day trial (no Stripe subscription yet)
  if (!status && account.trial_ends_at) {
    return new Date(account.trial_ends_at) > new Date();
  }
  return false;
}

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

// ── URL-based route detection (no React Router needed) ────────────────────────

function detectUrlRoute() {
  const path   = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if (path === '/reset-password') return { view: 'reset',  token: params.get('token') };
  if (path === '/verify-email')   return { view: 'verify', token: params.get('token') };
  return null;
}

// ── Email verification splash (auto-submits on mount) ─────────────────────────

function VerifyEmailScreen({ token, onGoLogin }) {
  const [status, setStatus] = useState('loading'); // 'loading' | 'ok' | 'error'
  const [msg, setMsg]       = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setMsg('Missing token.'); return; }
    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok) { setStatus('ok');    setMsg(d.message || 'Email verified — you can now sign in.'); }
        else    { setStatus('error'); setMsg(d.error   || 'Verification failed. The link may have expired.'); }
      })
      .catch(() => { setStatus('error'); setMsg('Something went wrong.'); });
  }, [token]);

  return (
    <div className="auth-wrapper">
      <div className="auth-brand">
        <h1 className="auth-wordmark">Quorum</h1>
        <p className="auth-tagline">For the SQE</p>
      </div>
      <div className="auth-card">
        {status === 'loading' && <p className="auth-subtitle">Verifying…</p>}
        {status === 'ok'      && <>
          <h2 className="auth-title">Email verified</h2>
          <p className="auth-subtitle">{msg}</p>
          <div className="auth-divider" />
          <button type="button" className="auth-submit" onClick={onGoLogin}>Sign in</button>
        </>}
        {status === 'error'   && <>
          <h2 className="auth-title">Verification failed</h2>
          <p className="auth-error">{msg}</p>
          <div className="auth-divider" />
          <button type="button" className="auth-link" onClick={onGoLogin}>Back to sign in</button>
        </>}
      </div>
    </div>
  );
}

function App() {
  const { account, setAccount } = useAuth();
  const { activeUser, apiFetch } = useUser();

  // After Stripe Checkout redirect: refresh account data so subscription_status is current
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscribed') === '1' && account) {
      window.history.replaceState(null, '', '/app');
      fetch('/api/auth/me', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.account) setAccount(data.account); })
        .catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auth screen sub-navigation
  const [authView, setAuthView] = useState(() => {
    const route  = detectUrlRoute();
    const params = new URLSearchParams(window.location.search);
    if (route?.view === 'reset')  return 'reset';
    if (route?.view === 'verify') return 'verify';
    if (params.get('register'))   return 'register';
    return 'login';
  });

  // Top-level navigation: null = cross-pillar home, or 'flashcards' | 'mcqs' | 'podcast'
  const [activePillar, setActivePillar] = useState(null);

  // Flashcards sub-navigation — all hooks must be declared before any early returns
  const [flashView, setFlashView]           = useState('home');
  const [activeDeck, setActiveDeck]         = useState([]);
  const [activeAccent, setActiveAccent]     = useState('#C8A96E');
  const [activeSubject, setActiveSubject]   = useState(null);
  const [sessionResults, setSessionResults] = useState([]);
  const [examAnswers, setExamAnswers]       = useState([]);
  const [examConfig, setExamConfig]         = useState(null);
  const [mcqView, setMcqView]               = useState('home'); // 'home' | 'session' | 'results'

  // Derived from URL — computed once, stable across renders
  const urlRoute   = detectUrlRoute();
  const resetToken = urlRoute?.view === 'reset'  ? urlRoute.token : null;
  const verifyToken= urlRoute?.view === 'verify' ? urlRoute.token : null;

  // ── Auth loading ──────────────────────────────────────────────────────────────
  if (account === null) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '12px', color: 'var(--color-text-muted)', letterSpacing: '0.08em' }}>
          LOADING…
        </p>
      </div>
    );
  }

  // ── Unauthenticated ───────────────────────────────────────────────────────────
  if (!account) {
    const goLogin = () => { window.history.replaceState(null, '', '/'); setAuthView('login'); };
    if (authView === 'verify')   return <VerifyEmailScreen token={verifyToken} onGoLogin={goLogin} />;
    if (authView === 'reset')    return <ResetPassword token={resetToken} onGoLogin={goLogin} />;
    if (authView === 'register') return <Register onGoLogin={() => setAuthView('login')} />;
    if (authView === 'forgot')   return <ForgotPassword onGoLogin={() => setAuthView('login')} />;
    return (
      <Login
        onGoRegister={() => setAuthView('register')}
        onGoForgotPassword={() => setAuthView('forgot')}
      />
    );
  }

  // ── Pillar navigation ──────────────────────────────────────────────────────

  const goToPillar = (pillar) => {
    setActivePillar(pillar);
    // Reset flashcard sub-view when re-entering
    if (pillar === 'flashcards') setFlashView('home');
  };

  const goHome = () => setActivePillar(null);

  // ── Shared deck launcher ───────────────────────────────────────────────────

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
    setActivePillar('flashcards');
    setFlashView('study');
  };

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
    setActivePillar('flashcards');
    setFlashView('study');
  };

  // ── Session starters ───────────────────────────────────────────────────────

  const startStudySession = async (sub = null, topicId = null, flk = null) => {
    let url = '/api/study/session?limit=15';
    if (topicId)        url += `&topic_id=${topicId}`;
    else if (sub?.dbId) url += `&subject_id=${sub.dbId}`;
    if (flk)            url += `&flk=${flk}`;

    try {
      const res   = await apiFetch(url);
      const data  = await res.json();
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
      const res   = await apiFetch(url);
      const data  = await res.json();
      const cards = data.cards ?? [];
      if (!cards.length) { alert('No deeper cards due right now.'); return; }
      launchDeck(cards, sub, sub ? (SUBJECT_ACCENT[sub.id] ?? '#C8A96E') : '#C8A96E');
    } catch {
      alert('Could not load session — is the backend running?');
    }
  };

  const startSubtopicStudy = async (sub, subtopicId) => {
    try {
      const res   = await apiFetch(`/api/study/subtopic/${subtopicId}`);
      const data  = await res.json();
      const cards = data.cards ?? [];
      if (!cards.length) { alert('No cards due for this subtopic.'); return; }
      launchDeck(cards, sub);
    } catch {
      alert('Could not load session — is the backend running?');
    }
  };

  const startConductSession = async () => {
    try {
      const res   = await apiFetch('/api/study/conduct?limit=20');
      const data  = await res.json();
      const cards = data.cards ?? [];
      if (!cards.length) { alert('No conduct cards due — check back tomorrow.'); return; }
      launchDeck(cards, null, '#7EB8A4');
    } catch {
      alert('Could not load conduct session — is the backend running?');
    }
  };

  // ── Flashcard sub-nav helpers ──────────────────────────────────────────────

  const viewTopicMap    = (subject) => { setActiveSubject(subject); setFlashView('topicmap'); };
  const viewCardBrowser = () => setFlashView('cardbrowser');
  const viewProgress    = () => setFlashView('progress');
  const viewSyllabusMap = () => setFlashView('syllabusmap');
  const viewExam        = () => setFlashView('exam');
  const backToFlash     = () => setFlashView('home');

  const handleSessionComplete = (results) => {
    setSessionResults(results);
    setFlashView('results');
  };

  const handleExamComplete = (answers, cfg) => {
    setExamAnswers(answers);
    setExamConfig(cfg);
    setFlashView('examresults');
  };

  // ── Subscription gate ──────────────────────────────────────────────────────

  if (!hasAccess(account)) return <Paywall account={account} />;

  // ── Not logged in ──────────────────────────────────────────────────────────

  if (!activeUser) return <Landing />;

  // Full-screen views have their own session-nav; hide the shared masthead
  const hideMasthead = (activePillar === 'flashcards' && (flashView === 'study' || flashView === 'exam'))
                    || (activePillar === 'mcqs' && mcqView === 'session');

  // ── Logged in ──────────────────────────────────────────────────────────────

  return (
    <div className="App">
      <a href="#main-content" className="skip-nav">Skip to main content</a>
      {!hideMasthead && (
        <Masthead
          activePillar={activePillar}
          onPillarChange={goToPillar}
          onHome={goHome}
        />
      )}
      <DisplayModeSelector />

      <main id="main-content">
      {/* Cross-pillar home */}
      {activePillar === null && (
        <CrossPillarHome
          onGoFlashcards={() => goToPillar('flashcards')}
          onGoMCQs={() => goToPillar('mcqs')}
          onGoPodcast={() => goToPillar('podcast')}
        />
      )}

      {/* Flashcards pillar */}
      {activePillar === 'flashcards' && flashView === 'home' && (
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
      {activePillar === 'flashcards' && flashView === 'cardbrowser' && (
        <CardBrowser onHome={backToFlash} />
      )}
      {activePillar === 'flashcards' && flashView === 'topicmap' && (
        <TopicMap
          subject={activeSubject}
          onHome={backToFlash}
          onStartStudy={() => startStudySession(activeSubject)}
          onStudySubtopic={(subtopicId) => startSubtopicStudy(activeSubject, subtopicId)}
        />
      )}
      {activePillar === 'flashcards' && flashView === 'study' && (
        <StudySession
          deckOverride={activeDeck}
          subjectAccent={activeAccent}
          onHome={backToFlash}
          onComplete={handleSessionComplete}
        />
      )}
      {activePillar === 'flashcards' && flashView === 'results' && (
        <Results
          results={sessionResults}
          subjectAccent={activeAccent}
          onHome={backToFlash}
          onStudyAgain={() => startStudySession(activeSubject)}
          onGoDeeper={() => startDeeperSession(activeSubject)}
        />
      )}
      {activePillar === 'flashcards' && flashView === 'progress' && (
        <Progress onHome={backToFlash} />
      )}
      {activePillar === 'flashcards' && flashView === 'exam' && (
        <ExamSimulator
          onHome={backToFlash}
          onComplete={handleExamComplete}
        />
      )}
      {activePillar === 'flashcards' && flashView === 'examresults' && (
        <ExamResults
          answers={examAnswers}
          config={examConfig}
          subjectAccent={activeAccent}
          onHome={backToFlash}
          onStudyMissed={(cards) => launchCustomDeck(cards, '#C47B7B')}
        />
      )}
      {activePillar === 'flashcards' && flashView === 'syllabusmap' && (
        <SyllabusMap
          onHome={backToFlash}
          onStudySubtopic={(subtopicId, subject) => startSubtopicStudy(
            { id: subject.id, dbId: subject.id, name: subject.name },
            subtopicId,
          )}
        />
      )}

      {/* MCQs pillar */}
      {activePillar === 'mcqs' && <MCQPillar onViewChange={setMcqView} />}

      {/* Podcast pillar — Phase 3 stub */}
      {activePillar === 'podcast' && (
        <div style={{ padding: '80px 36px', textAlign: 'center', color: 'var(--muted)', fontFamily: 'DM Mono, monospace', fontSize: '13px' }}>
          Podcast — coming in Phase 3
        </div>
      )}
      </main>

      <CookieBanner />
    </div>
  );
}

export default App;
