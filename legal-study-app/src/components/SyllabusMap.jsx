import { useState, useEffect } from 'react';
import { useUser } from '../UserContext';
import './SyllabusMap.css';

// Colour based on progress %
const nodeColor = (reviewed, total) => {
  if (!total || !reviewed) return null;          // not started
  const pct = reviewed / total;
  if (pct >= 1)   return '#3D7A62';             // mastered
  if (pct >= 0.5) return '#7EB8A4';             // progressing
  return '#C8A96E';                              // started
};

const LEGEND = [
  { color: null,      label: 'Not started' },
  { color: '#C8A96E', label: 'In progress' },
  { color: '#7EB8A4', label: 'Progressing (≥50%)' },
  { color: '#3D7A62', label: 'Mastered' },
];

const ProgressDot = ({ reviewed, total, size = 'md' }) => {
  const color = nodeColor(reviewed, total);
  return (
    <div
      className={`syllabus-dot syllabus-dot--${size}`}
      style={{
        background: color ?? 'transparent',
        border: color ? 'none' : '1px solid var(--border-light)',
      }}
    />
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

const SyllabusMap = ({ onHome, onStudySubtopic }) => {
  const { apiFetch } = useUser();
  const [data, setData]                     = useState([]);
  const [loading, setLoading]               = useState(true);
  const [flkFilter, setFlkFilter]           = useState('all');
  const [expandedSubjects, setExpandedSubjects] = useState({});
  const [expandedTopics, setExpandedTopics]     = useState({});

  useEffect(() => {
    apiFetch('/api/syllabus')
      .then(r => r.json())
      .then(d => {
        setData(d);
        // Expand all subjects by default
        const exp = {};
        d.forEach(s => { exp[s.id] = true; });
        setExpandedSubjects(exp);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toggleSubject = (id) =>
    setExpandedSubjects(p => ({ ...p, [id]: !p[id] }));

  const toggleTopic = (id) =>
    setExpandedTopics(p => ({ ...p, [id]: !p[id] }));

  const filtered = data.filter(s =>
    flkFilter === 'all' || s.flk === flkFilter
  );

  return (
    <div className="syllabus-wrapper">
      <nav className="masthead">
        <div className="masthead-left">
          <span className="wordmark-text playfair">Quorum</span>
          <div className="separator" />
          <div className="nav-links">
            <span className="nav-link" onClick={onHome} style={{ cursor: 'pointer' }}>Dashboard</span>
            <span className="nav-link active">Syllabus</span>
          </div>
        </div>
        <div className="flk-btns">
          {[
            { value: 'all',  label: 'All'   },
            { value: 'FLK1', label: 'FLK 1' },
            { value: 'FLK2', label: 'FLK 2' },
          ].map(({ value, label }) => (
            <button
              key={value}
              className="flk-btn mono"
              style={flkFilter !== value ? {
                background: 'none',
                color: 'var(--text-light)',
                border: '1px solid var(--border-light)',
              } : {}}
              onClick={() => setFlkFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <div className="syllabus-container">

        {/* Heading */}
        <div className="syllabus-heading">
          <h1 className="playfair" style={{ borderLeft: '3px solid #C8A96E', paddingLeft: '16px' }}>
            Syllabus Map
          </h1>
          <p className="mono syllabus-subtitle">SQE1 topic coverage — colour-coded by progress</p>
        </div>

        {/* Legend */}
        <div className="syllabus-legend">
          {LEGEND.map(({ color, label }) => (
            <div key={label} className="syllabus-legend-item">
              <div
                className="syllabus-dot syllabus-dot--sm"
                style={{
                  background:  color ?? 'transparent',
                  border: color ? 'none' : '1px solid var(--border-light)',
                }}
              />
              <span className="mono">{label}</span>
            </div>
          ))}
        </div>

        {loading && (
          <p className="mono" style={{ color: 'var(--muted)', fontSize: '11px' }}>Loading syllabus…</p>
        )}

        {/* Subject list */}
        {filtered.map(subject => {
          const isOpen = expandedSubjects[subject.id];
          const subPct = subject.total_cards
            ? Math.round((subject.reviewed / subject.total_cards) * 100)
            : 0;
          const subColor = nodeColor(subject.reviewed, subject.total_cards);

          return (
            <div key={subject.id} className="syllabus-subject">

              {/* Subject header */}
              <div
                className="syllabus-subject-header"
                onClick={() => toggleSubject(subject.id)}
              >
                <ProgressDot reviewed={subject.reviewed} total={subject.total_cards} size="md" />
                <span className="syllabus-subject-name outfit">{subject.name}</span>
                <span className="mono syllabus-pct" style={{ color: subColor ?? 'var(--muted)' }}>
                  {subPct}%
                </span>
                <span className="syllabus-meta-count mono">
                  {subject.reviewed}/{subject.total_cards}
                </span>
                <span className="mono syllabus-chevron">{isOpen ? '−' : '+'}</span>
              </div>

              {/* Topics */}
              {isOpen && (
                <div className="syllabus-topics">
                  {(subject.topics ?? []).map(topic => {
                    const isTopicOpen = expandedTopics[topic.id];
                    const tColor      = nodeColor(topic.reviewed_cards, topic.total_cards);

                    return (
                      <div key={topic.id} className="syllabus-topic">

                        {/* Topic header */}
                        <div
                          className="syllabus-topic-header"
                          onClick={() => toggleTopic(topic.id)}
                        >
                          <ProgressDot reviewed={topic.reviewed_cards} total={topic.total_cards} size="sm" />
                          <span className="syllabus-topic-name outfit">{topic.name}</span>
                          <span className="mono syllabus-topic-meta" style={{ color: tColor ?? 'var(--muted)' }}>
                            {topic.reviewed_cards}/{topic.total_cards}
                          </span>
                          <span className="mono syllabus-chevron-sm">{isTopicOpen ? '−' : '+'}</span>
                        </div>

                        {/* Subtopics */}
                        {isTopicOpen && (
                          <div className="syllabus-subtopics">
                            {(topic.subtopics ?? []).map(st => {
                              const stColor = nodeColor(st.reviewed_cards, st.total_cards);
                              return (
                                <div key={st.id} className="syllabus-subtopic">
                                  <ProgressDot reviewed={st.reviewed_cards} total={st.total_cards} size="xs" />
                                  <span className="syllabus-subtopic-name outfit">{st.name}</span>
                                  <span className="mono syllabus-subtopic-meta" style={{ color: stColor ?? 'var(--muted)' }}>
                                    {st.reviewed_cards}/{st.total_cards}
                                  </span>
                                  {onStudySubtopic && st.due_cards > 0 && (
                                    <button
                                      className="syllabus-study-btn mono"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onStudySubtopic(st.id, subject);
                                      }}
                                    >
                                      {st.due_cards} due
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

      </div>
    </div>
  );
};

export default SyllabusMap;
