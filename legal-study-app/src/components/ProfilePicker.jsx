import { useState, useEffect } from 'react';
import { useUser } from '../UserContext';
import './ProfilePicker.css';

const ProfilePicker = () => {
  const { setUser } = useUser();
  const [profiles, setProfiles] = useState([]);
  const [newName, setNewName]   = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => setProfiles(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const handleSelect = (profile) => setUser(profile);

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError('');
    try {
      const res  = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setCreating(false); return; }
      setUser(data);
    } catch {
      setError('Could not connect to server.');
      setCreating(false);
    }
  };

  return (
    <div className="picker-wrapper">
      <div className="picker-card">
        <h1 className="picker-title playfair">Quorum</h1>
        <p className="picker-sub mono">Select or create a profile to continue</p>

        {profiles.length > 0 && (
          <div className="picker-profiles">
            {profiles.map(p => (
              <button key={p.id} className="picker-profile-btn" onClick={() => handleSelect(p)}>
                <span className="picker-profile-name outfit">{p.name}</span>
                <span className="picker-profile-arrow mono">→</span>
              </button>
            ))}
          </div>
        )}

        <div className="picker-divider">
          {profiles.length > 0 ? <span className="mono picker-divider-label">or create new</span> : null}
        </div>

        <form className="picker-form" onSubmit={handleCreate}>
          <input
            className="picker-input outfit"
            type="text"
            placeholder="Profile name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            maxLength={40}
            autoFocus={profiles.length === 0}
          />
          <button
            className="picker-create-btn outfit"
            type="submit"
            disabled={creating || !newName.trim()}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </form>

        {error && <p className="picker-error mono">{error}</p>}
      </div>
    </div>
  );
};

export default ProfilePicker;
