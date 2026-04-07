import { useState } from 'react';
import { useAuth } from '../../AuthContext';
import './AuthScreens.css';

const Login = ({ onGoRegister, onGoForgotPassword }) => {
  const { login } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [unverified, setUnverified] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setUnverified(false);
    try {
      await login(email, password);
      // AuthContext.account updates → App re-renders to authenticated state
    } catch (err) {
      if (err.unverified) setUnverified(true);
      setError(err.error || 'Something went wrong.');
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-brand">
        <h1 className="auth-wordmark">Quorum</h1>
        <p className="auth-tagline">For the SQE</p>
      </div>

      <form className="auth-card" onSubmit={handleSubmit}>
        <h2 className="auth-title">Sign in</h2>

        <div className="auth-field">
          <label className="auth-label">Email</label>
          <input
            className="auth-input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="auth-field">
          <label className="auth-label">Password</label>
          <input
            className="auth-input"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        {unverified && (
          <ResendVerification email={email} />
        )}

        <button className="auth-submit" type="submit" disabled={loading || !email || !password}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="auth-divider" />

        <div className="auth-links">
          <button type="button" className="auth-link" onClick={onGoForgotPassword}>
            Forgot your password?
          </button>
          <button type="button" className="auth-link" onClick={onGoRegister}>
            Don't have an account? Request access
          </button>
        </div>
      </form>
    </div>
  );
};

// ── Inline resend verification helper ─────────────────────────────────────────

const ResendVerification = ({ email }) => {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const resend = async () => {
    setLoading(true);
    await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setSent(true);
    setLoading(false);
  };

  return sent ? (
    <p className="auth-success">Verification email sent — check your inbox.</p>
  ) : (
    <button type="button" className="auth-link" onClick={resend} disabled={loading}>
      {loading ? 'Sending…' : 'Resend verification email'}
    </button>
  );
};

export default Login;
