import { useState, useEffect, useRef } from 'react';
import { useUser } from '../../UserContext';
import './Landing.css';

// Five avatar colours — drawn from the subject accent palette
export const AVATAR_COLOURS = [
  '#C8A96E', // gold
  '#7BAED4', // blue
  '#7EC47B', // green
  '#9B8EC4', // purple
  '#C47B7B', // rose
];

const DEFAULT_COLOUR = AVATAR_COLOURS[0];

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

function Avatar({ name, colour, size = 48 }) {
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, background: colour, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </div>
  );
}

function FLKBars({ flk1Pct, flk2Pct }) {
  return (
    <div className="flk-bars">
      <div className="flk-bar-row">
        <span className="flk-bar-label mono">FLK1</span>
        <div className="flk-bar-track">
          <div className="flk-bar-fill" style={{ width: `${flk1Pct}%` }} />
        </div>
        <span className="flk-bar-pct mono">{flk1Pct}%</span>
      </div>
      <div className="flk-bar-row">
        <span className="flk-bar-label mono">FLK2</span>
        <div className="flk-bar-track">
          <div className="flk-bar-fill" style={{ width: `${flk2Pct}%` }} />
        </div>
        <span className="flk-bar-pct mono">{flk2Pct}%</span>
      </div>
    </div>
  );
}

function ProfileCard({ profile, onClick }) {
  const colour = profile.avatar_seed || DEFAULT_COLOUR;
  const lastActive = profile.last_active
    ? new Date(profile.last_active).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;

  return (
    <button className="profile-card" onClick={onClick}>
      <Avatar name={profile.name} colour={colour} size={52} />
      <div className="profile-card-body">
        <span className="profile-card-name outfit">{profile.name}</span>
        {lastActive && (
          <span className="profile-card-meta mono">Last active {lastActive}</span>
        )}
        <FLKBars flk1Pct={profile.flk1_pct ?? 0} flk2Pct={profile.flk2_pct ?? 0} />
      </div>
    </button>
  );
}

function ColourPicker({ value, onChange }) {
  return (
    <div className="colour-picker">
      {AVATAR_COLOURS.map(c => (
        <button
          key={c}
          type="button"
          className={`colour-swatch${value === c ? ' is-selected' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={`Select colour ${c}`}
        />
      ))}
    </div>
  );
}

// ── Landing ───────────────────────────────────────────────────────────────────

const Landing = () => {
  const { setUser } = useUser();
  const [profiles, setProfiles]     = useState([]);
  const [creating, setCreating]     = useState(false);
  const [newName, setNewName]       = useState('');
  const [newColour, setNewColour]   = useState(DEFAULT_COLOUR);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const autoTimer = useRef(null);

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => setProfiles(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Auto-advance if exactly one profile exists
  useEffect(() => {
    if (profiles.length !== 1) return;
    autoTimer.current = setTimeout(() => handleSelect(profiles[0]), 1500);
    return () => clearTimeout(autoTimer.current);
  }, [profiles]);

  const handleSelect = (profile) => {
    clearTimeout(autoTimer.current);
    // Touch last_active in the background
    fetch(`/api/users/${profile.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ last_active: new Date().toISOString().slice(0, 10) }),
    }).catch(() => {});
    setUser(profile);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, avatar_seed: newColour }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setSubmitting(false); return; }
      setUser(data);
    } catch {
      setError('Could not connect to server.');
      setSubmitting(false);
    }
  };

  // Show create form directly if no profiles
  const showCreateForm = creating || profiles.length === 0;

  return (
    <div className="landing-wrapper">
      <div className="landing-brand">
        <h1 className="landing-wordmark playfair">Quorum</h1>
        <p className="landing-sub mono">For the SQE</p>
      </div>

      {!showCreateForm && (
        <>
          <div className="profile-grid">
            {profiles.map(p => (
              <ProfileCard key={p.id} profile={p} onClick={() => handleSelect(p)} />
            ))}
            <button className="profile-card profile-card--add" onClick={() => setCreating(true)}>
              <span className="add-icon">+</span>
              <span className="outfit">Add profile</span>
            </button>
          </div>
          {profiles.length === 1 && (
            <p className="landing-auto-hint mono">Continuing as {profiles[0].name}…</p>
          )}
        </>
      )}

      {showCreateForm && (
        <form className="create-form" onSubmit={handleCreate}>
          <h2 className="create-form-title playfair">
            {profiles.length === 0 ? 'Create your profile' : 'New profile'}
          </h2>

          <label className="create-label outfit">Name</label>
          <input
            className="create-input outfit"
            type="text"
            placeholder="Your name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            maxLength={40}
            autoFocus
          />

          <label className="create-label outfit">Colour</label>
          <ColourPicker value={newColour} onChange={setNewColour} />

          {newName.trim() && (
            <div className="create-preview">
              <Avatar name={newName} colour={newColour} size={52} />
              <span className="outfit create-preview-name">{newName.trim()}</span>
            </div>
          )}

          {error && <p className="create-error mono">{error}</p>}

          <div className="create-actions">
            {profiles.length > 0 && (
              <button
                type="button"
                className="create-cancel outfit"
                onClick={() => { setCreating(false); setError(''); setNewName(''); }}
              >
                Cancel
              </button>
            )}
            <button
              className="create-submit outfit"
              type="submit"
              disabled={submitting || !newName.trim()}
            >
              {submitting ? 'Creating…' : 'Create profile'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default Landing;
