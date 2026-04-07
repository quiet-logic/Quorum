import { useState } from 'react';
import './AuthScreens.css';

const ForgotPassword = ({ onGoLogin }) => {
  const [email, setEmail]     = useState('');
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw data;
      setSuccess(data.message || 'If that email exists, a reset link is on its way.');
    } catch (err) {
      setError(err.error || 'Something went wrong.');
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
        <h2 className="auth-title">Reset password</h2>
        <p className="auth-subtitle">
          Enter your email and we'll send a reset link if the account exists.
        </p>

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

        {error && <p className="auth-error">{error}</p>}

        <button
          className="auth-submit"
          type="submit"
          disabled={loading || !email}
        >
          {loading ? 'Sending…' : 'Send reset link'}
        </button>

        <div className="auth-divider" />

        <button type="button" className="auth-link" onClick={onGoLogin}>
          Back to sign in
        </button>
      </form>
    </div>
  );
};

export default ForgotPassword;
