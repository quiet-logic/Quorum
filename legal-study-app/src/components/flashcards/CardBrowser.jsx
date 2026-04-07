import { useState, useEffect, useRef } from 'react';
import { useUser } from '../../UserContext';
import './CardBrowser.css';
import { subjectColor } from '../../subjectColor';

const TYPE_LABEL = { 1: 'Q&A', 2: 'IRAC', 3: 'Scenario', 4: 'Deeper', 5: 'Trap' };
const TYPES = [1, 2, 3, 4, 5];

// IRAC section labels per card type
const IRAC_LABELS = {
  2: ['Issue', 'Rule', 'Application', 'Conclusion'],
  5: ['The Trap', 'The Reality', 'Why the Distractor Fails', 'The Key Rule'],
};

const CardBrowser = ({ onHome }) => {
  const { apiFetch } = useUser();
  const [query, setQuery]               = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [subjects, setSubjects]         = useState([]);
  const [results, setResults]           = useState([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(false);
  const [expandedId, setExpandedId]     = useState(null);
  const debounceRef = useRef(null);

  // Load subjects for the filter dropdown
  useEffect(() => {
    apiFetch('/api/subjects')
      .then(r => r.json())
      .then(data => setSubjects(data))
      .catch(() => {});
  }, []);

  // Debounced search whenever query or filters change
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim())  params.set('q', query.trim());
      if (subjectFilter) params.set('subject_id', subjectFilter);
      if (typeFilter)    params.set('card_type', typeFilter);

      setLoading(true);
      setExpandedId(null);
      fetch(`/api/cards?${params}`)
        .then(r => r.json())
        .then(data => {
          setResults(data.cards ?? []);
          setTotal(data.total ?? 0);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, 320);

    return () => clearTimeout(debounceRef.current);
  }, [query, subjectFilter, typeFilter]);

  const toggleExpand = (id) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="cb-wrapper">
      <nav className="cb-masthead">
        <div className="cb-masthead-left">
          <span className="wordmark-text playfair">Quorum</span>
          <div className="tm-separator" />
          <span className="tm-breadcrumb mono">Card Browser</span>
        </div>
        <button className="tm-back-btn outfit" onClick={onHome}>Dashboard</button>
      </nav>

      <div className="cb-container">

        {/* Search + filters */}
        <div className="cb-controls">
          <input
            className="cb-search outfit"
            type="text"
            placeholder="Search cards — rules, cases, concepts…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <div className="cb-filters">
            <select
              className="cb-select mono"
              value={subjectFilter}
              onChange={e => setSubjectFilter(e.target.value)}
            >
              <option value="">All Subjects</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <div className="cb-type-pills">
              <button
                className={`cb-type-pill mono ${typeFilter === '' ? 'active' : ''}`}
                onClick={() => setTypeFilter('')}
              >
                All
              </button>
              {TYPES.map(t => (
                <button
                  key={t}
                  className={`cb-type-pill mono ${typeFilter === String(t) ? 'active' : ''}`}
                  onClick={() => setTypeFilter(typeFilter === String(t) ? '' : String(t))}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results count */}
        <div className="cb-meta mono">
          {loading
            ? 'Searching…'
            : `${total} card${total !== 1 ? 's' : ''}${total === 150 ? ' (showing first 150)' : ''}`
          }
        </div>

        {/* Results */}
        <div className="cb-results">
          {!loading && results.length === 0 && (
            <p className="cb-empty mono">No cards match your search.</p>
          )}
          {results.map(card => (
            <CardRow
              key={card.id}
              card={card}
              expanded={expandedId === card.id}
              onToggle={() => toggleExpand(card.id)}
            />
          ))}
        </div>

      </div>
    </div>
  );
};


const CardRow = ({ card, expanded, onToggle }) => {
  const typeLabel = TYPE_LABEL[card.card_type] ?? 'Q&A';

  return (
    <div className={`cb-row ${expanded ? 'is-expanded' : ''}`}>

      {/* Row header */}
      <div className="cb-row-header" onClick={onToggle}>
        <span className="cb-code mono">{card.card_code}</span>
        <div className="cb-row-info">
          <span className="cb-subject-tag mono" style={{ color: subjectColor(card.subject_abbr) }}>
            {card.subject_abbr}
          </span>
          <span className="cb-location outfit">{card.topic_name} · {card.subtopic_name}</span>
        </div>
        <div className="cb-row-meta">
          <span className="cb-type-badge mono">{typeLabel}</span>
          {card.difficulty && (
            <span className="cb-difficulty mono">{card.difficulty}</span>
          )}
        </div>
        <p className="cb-front-preview outfit">{card.front}</p>
        <span className="cb-chevron mono">{expanded ? '−' : '+'}</span>
      </div>

      {/* Expanded detail */}
      {expanded && <CardDetail card={card} />}

    </div>
  );
};


const CardDetail = ({ card }) => {
  const isIrac = card.card_type === 2 || card.card_type === 5;
  const labels = IRAC_LABELS[card.card_type];

  return (
    <div className="cb-detail">
      {/* Front */}
      <div className="cb-detail-section">
        <span className="cb-detail-label mono">
          {card.card_type === 2 ? 'Case' : card.card_type === 5 ? 'Trap Card' : 'Question'}
        </span>
        <p className="cb-detail-text playfair">{card.front}</p>
      </div>

      {/* Answer — standard types */}
      {!isIrac && card.answer && (
        <div className="cb-detail-section cb-detail-answer">
          <span className="cb-detail-label mono">Answer</span>
          <p className="cb-detail-text outfit">{card.answer}</p>
        </div>
      )}

      {/* IRAC grid — types 2 + 5 */}
      {isIrac && (
        <div className="cb-irac-grid">
          {[
            [labels[0], card.issue],
            [labels[1], card.rule],
            [labels[2], card.application],
            [labels[3], card.conclusion],
          ].map(([label, content]) => (
            <div key={label} className="cb-irac-cell">
              <span className="cb-detail-label mono">{label}</span>
              <p className="cb-detail-text outfit">{content}</p>
            </div>
          ))}
        </div>
      )}

      {/* Summary line */}
      {card.summary_line && (
        <div className="cb-summary mono">{card.summary_line}</div>
      )}
    </div>
  );
};



export default CardBrowser;
