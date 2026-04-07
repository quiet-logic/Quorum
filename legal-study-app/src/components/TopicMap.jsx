import { useState, useEffect } from 'react';
import { useUser } from '../UserContext';
import './TopicMap.css';

const TopicMap = ({ subject, onHome, onStartStudy, onStudySubtopic }) => {
  const { apiFetch } = useUser();
  const [topics, setTopics]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const dbId = subject.dbId ?? subject.id;
    apiFetch(`/api/subjects/${dbId}/map`)
      .then(res => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!cancelled) {
          setTopics(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [subject.name]);

  const toggleTopic = (topicId) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(topicId) ? next.delete(topicId) : next.add(topicId);
      return next;
    });
  };

  const totalCards    = topics.reduce((n, t) => n + t.total_cards, 0);
  const totalReviewed = topics.reduce((n, t) => n + t.reviewed_cards, 0);
  const totalDue      = topics.reduce((n, t) => n + t.due_cards, 0);

  return (
    <div className="topicmap-wrapper" style={{ '--subject-accent': subject.color, '--tm-accent': subject.color }}>
      <nav className="topicmap-masthead">
        <div className="topicmap-masthead-left">
          <span className="wordmark-text playfair">Quorum</span>
          <div className="tm-separator" />
          <span className="tm-breadcrumb mono">{subject.name}</span>
        </div>
        <div className="topicmap-masthead-right">
          <button
            className="tm-study-all-btn outfit"
            onClick={() => onStartStudy()}
          >
            Study All
          </button>
          <button className="tm-back-btn outfit" onClick={onHome}>Dashboard</button>
        </div>
      </nav>

      <div className="topicmap-container">

        {/* Subject heading */}
        <div className="tm-heading" style={{ borderLeft: `3px solid ${subject.color}`, paddingLeft: '16px' }}>
          <h1 className="playfair">{subject.name}</h1>
          <p className="mono tm-heading-meta">
            {subject.flk === 1 ? 'FLK 1' : 'FLK 2'}
            <span className="tm-dot">·</span>
            {totalCards} cards
            <span className="tm-dot">·</span>
            {totalReviewed} reviewed
          </p>
        </div>

        {/* Content */}
        {loading && (
          <p className="mono tm-status">Loading topics…</p>
        )}

        {error && (
          <p className="mono tm-status tm-error">
            Could not load topic map — is the backend running?
            <br /><span style={{ opacity: 0.6 }}>{error}</span>
          </p>
        )}

        {!loading && !error && (
          <div className="tm-topics">
            {topics.map(topic => (
              <TopicRow
                key={topic.id}
                topic={topic}
                accent={subject.color}
                expanded={expanded.has(topic.id)}
                onToggle={() => toggleTopic(topic.id)}
                onStudySubtopic={onStudySubtopic}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
};


const TopicRow = ({ topic, accent, expanded, onToggle, onStudySubtopic }) => {
  const pct = topic.total_cards > 0
    ? Math.round((topic.reviewed_cards / topic.total_cards) * 100)
    : 0;

  return (
    <div className={`tm-topic ${expanded ? 'is-expanded' : ''}`}>

      {/* Topic header — click to expand */}
      <div className="tm-topic-header" onClick={onToggle}>
        <div className="tm-topic-info">
          <span className="tm-topic-name outfit">{topic.name}</span>
          <div className="tm-topic-bar-track">
            <div
              className="tm-topic-bar-fill"
              style={{ width: `${pct}%`, background: accent }}
            />
          </div>
        </div>
        <div className="tm-topic-meta">
          <span className="mono tm-topic-counts">
            {topic.reviewed_cards}/{topic.total_cards}
          </span>
          <span className="tm-chevron mono">{expanded ? '−' : '+'}</span>
        </div>
      </div>

      {/* Subtopics */}
      {expanded && (
        <div className="tm-subtopics">
          {topic.subtopics.map(sub => (
            <SubtopicRow
              key={sub.id}
              sub={sub}
              accent={accent}
              onStudy={() => onStudySubtopic(sub.id)}
            />
          ))}
        </div>
      )}

    </div>
  );
};


const SubtopicRow = ({ sub, accent, onStudy }) => {
  const pct = sub.total_cards > 0
    ? Math.round((sub.reviewed_cards / sub.total_cards) * 100)
    : 0;

  return (
    <div className="tm-subtopic-row">
      <div className="tm-subtopic-info">
        <span className="tm-subtopic-name outfit">{sub.name}</span>
        <div className="tm-subtopic-bar-track">
          <div
            className="tm-subtopic-bar-fill"
            style={{ width: `${pct}%`, background: accent, opacity: 0.5 }}
          />
        </div>
      </div>
      <div className="tm-subtopic-meta">
        <span className="mono tm-subtopic-counts">
          {sub.reviewed_cards}/{sub.total_cards}
        </span>
        <button
          className="tm-study-btn mono"
          style={{ '--tm-accent': accent }}
          onClick={onStudy}
        >
          Study →
        </button>
      </div>
    </div>
  );
};


export default TopicMap;
