import { useState } from 'react';
import './AuthScreens.css';

const ResetPassword = ({ token, onGoLogin }) => {
  const [password, setPassword]     = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [loading, setLoading]       = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPw) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await res.json();
      if (!res.ok) throw data;
      setSuccess('Password updated — you can now sign in.');
    } catch (err) {
      setError(err.error || 'Something went wrong. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-wrapper">
        <div className="auth-brand">
          <h1 className="auth-wordmark">Quorum</h1>
          <p className="auth-tagline">For the SQE</p>
        </div>
        <div className="auth-card">
          <h2 className="auth-title">Password updated</h2>
          <p className="auth-subtitle">{success}</p>
          <div className="auth-divider" />
          <button type="button" className="auth-submit" onClick={onGoLogin}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-brand">
          <h1 className="auth-wordmark">Quorum</h1>
          <p className="auth-tagline">For the SQE</p>
        </div>
        <div className="auth-card">
          <h2 className="auth-title">Invalid link</h2>
          <p className="auth-subtitle">This reset link is missing or malformed.</p>
          <div className="auth-divider" />
          <button type="button" className="auth-link" onClick={onGoLogin}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-brand">
        <h1 className="auth-wordmark">Quorum</h1>
        <p className="auth-tagline">For the SQE</p>
      </div>

      <form className="auth-card" onSubmit={handleSubmit}>
        <h2 className="auth-title">Choose a new password</h2>

        <div className="auth-field">
          <label className="auth-label">New password</label>
          <input
            className="auth-input"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
          />
        </div>

        <div className="auth-field">
          <label className="auth-label">Confirm password</label>
          <input
            className="auth-input"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            required
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button
          className="auth-submit"
          type="submit"
          disabled={loading || !password || !confirmPw}
        >
          {loading ? 'Saving…' : 'Set new password'}
        </button>

        <div className="auth-divider" />

        <button type="button" className="auth-link" onClick={onGoLogin}>
          Back to sign in
        </button>
      </form>
    </div>
  );
};

export default ResetPassword;
