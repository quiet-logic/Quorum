import { useState } from 'react';
import './CookieBanner.css';

const STORAGE_KEY = 'quorum-cookie-consent';

const CookieBanner = () => {
  const [dismissed, setDismissed] = useState(
    () => !!localStorage.getItem(STORAGE_KEY)
  );

  if (dismissed) return null;

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    setDismissed(true);
  };

  return (
    <div className="cookie-banner" role="region" aria-label="Cookie notice">
      <p className="cookie-text">
        Quorum uses cookies to keep you signed in and remember your preferences.
        No tracking or advertising cookies.{' '}
        <a href="/privacy" className="cookie-link" target="_blank" rel="noopener noreferrer">
          Privacy policy
        </a>
      </p>
      <button className="cookie-btn" onClick={accept} aria-label="Accept cookies and dismiss notice">
        Got it
      </button>
    </div>
  );
};

export default CookieBanner;
