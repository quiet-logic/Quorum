import { useState } from 'react';
import { useAuth } from '../../AuthContext';
import './Paywall.css';

const Paywall = ({ account }) => {
  const { logout } = useAuth();
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [portalLoading, setPortalLoading] = useState(false);

  const trialExpired = account?.trial_ends_at &&
    new Date(account.trial_ends_at) < new Date();

  const hasSubscription = ['active', 'past_due', 'trialing', 'canceled']
    .includes(account?.subscription_status);

  const subscribe = async () => {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/billing/checkout', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Could not start checkout.');
        setLoading(false);
      }
    } catch {
      setError('Could not connect to server.');
      setLoading(false);
    }
  };

  const manageSubscription = async () => {
    setPortalLoading(true);
    try {
      const res  = await fetch('/api/billing/portal', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setPortalLoading(false);
      }
    } catch {
      setPortalLoading(false);
    }
  };

  return (
    <div className="paywall-wrapper">
      <div className="paywall-brand">
        <h1 className="paywall-wordmark playfair">Quorum</h1>
        <p className="paywall-tagline mono">For the SQE</p>
      </div>

      <div className="paywall-card">
        {trialExpired ? (
          <>
            <h2 className="paywall-title playfair">Your trial has ended</h2>
            <p className="paywall-body outfit">
              Subscribe to continue studying. Full access to all flashcards, MCQs, and progress tracking.
            </p>
          </>
        ) : (
          <>
            <h2 className="paywall-title playfair">Subscribe to continue</h2>
            <p className="paywall-body outfit">
              Get full access to Quorum — 2,700+ flashcards, MCQs, and spaced repetition scheduling across all 14 SQE1 subjects.
            </p>
          </>
        )}

        <div className="paywall-price">
          <span className="paywall-amount playfair">£5</span>
          <span className="paywall-period mono">/month</span>
        </div>

        <ul className="paywall-features mono">
          <li>2,753 flashcards across FLK1 &amp; FLK2</li>
          <li>390 MCQs with detailed explanations</li>
          <li>SM-2 spaced repetition scheduling</li>
          <li>Progress tracking &amp; analytics</li>
          <li>Exam simulator mode</li>
          <li>Cancel any time</li>
        </ul>

        {error && <p className="paywall-error mono">{error}</p>}

        {!hasSubscription && (
          <button
            className="paywall-cta outfit"
            onClick={subscribe}
            disabled={loading}
          >
            {loading ? 'Redirecting to checkout…' : 'Subscribe — £5/month'}
          </button>
        )}

        {hasSubscription && account.subscription_status === 'canceled' && (
          <>
            <p className="paywall-canceled mono">Your subscription has been cancelled.</p>
            <button
              className="paywall-cta outfit"
              onClick={subscribe}
              disabled={loading}
            >
              {loading ? 'Redirecting…' : 'Resubscribe — £5/month'}
            </button>
          </>
        )}

        {hasSubscription && account.subscription_status !== 'canceled' && (
          <button
            className="paywall-manage mono"
            onClick={manageSubscription}
            disabled={portalLoading}
          >
            {portalLoading ? 'Opening portal…' : 'Manage subscription'}
          </button>
        )}

        <div className="paywall-footer">
          <button type="button" className="paywall-signout mono" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default Paywall;
