import { useUser } from '../../UserContext';
import { AVATAR_COLOURS } from './Landing';
import './Masthead.css';

const DEFAULT_COLOUR = AVATAR_COLOURS[0];

const PILLARS = [
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'mcqs',       label: 'MCQs' },
  { id: 'podcast',    label: 'Podcast' },
];

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

const Masthead = ({ activePillar, onPillarChange, onHome }) => {
  const { activeUser, setUser } = useUser();
  const colour = activeUser?.avatar_seed || DEFAULT_COLOUR;

  return (
    <nav className="masthead-v2">
      {/* Top row: wordmark + profile */}
      <div className="masthead-top">
        <button className="wordmark-btn playfair" onClick={onHome}>
          Quorum
        </button>
        <button
          className="profile-indicator"
          onClick={() => setUser(null)}
          title="Switch profile"
        >
          <span
            className="profile-avatar"
            style={{ background: colour }}
          >
            {initials(activeUser?.name ?? '?')}
          </span>
          <span className="profile-name outfit">{activeUser?.name}</span>
        </button>
      </div>

      {/* Bottom row: pillar tabs */}
      <div className="masthead-tabs">
        {PILLARS.map(p => (
          <button
            key={p.id}
            className={`pillar-tab mono${activePillar === p.id ? ' is-active' : ''}`}
            onClick={() => onPillarChange(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </nav>
  );
};

export default Masthead;
