import { useState } from 'react';
import { useAuth } from '../../AuthContext';
import './AuthScreens.css';

const Register = ({ onGoLogin }) => {
  const { register } = useAuth();
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [inviteCode, setInviteCode] = useState('');
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
      const data = await register(email, password, inviteCode);
      setSuccess(data.message || 'Account created — check your email to verify.');
    } catch (err) {
      setError(err.error || 'Something went wrong.');
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
          <h2 className="auth-title">Check your email</h2>
          <p className="auth-subtitle">{success}</p>
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
        <h2 className="auth-title">Create account</h2>
        <p className="auth-subtitle">You need an invite code to register during the beta.</p>

        <div className="auth-field">
          <label className="auth-label" htmlFor="reg-invite">Invite code</label>
          <input
            id="reg-invite"
            className="auth-input"
            type="text"
            placeholder="XXXX-XXXX"
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value.trim())}
            required
            autoFocus
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="reg-email">Email</label>
          <input
            id="reg-email"
            className="auth-input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="reg-password">Password</label>
          <input
            id="reg-password"
            className="auth-input"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="reg-confirm">Confirm password</label>
          <input
            id="reg-confirm"
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
          disabled={loading || !email || !password || !inviteCode}
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>

        <div className="auth-divider" />

        <div className="auth-links">
          <button type="button" className="auth-link" onClick={onGoLogin}>
            Already have an account? Sign in
          </button>
        </div>
      </form>
    </div>
  );
};

export default Register;
