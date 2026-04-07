import { useEffect, useState } from 'react';
import { useUser } from '../../UserContext';
import './CrossPillarHome.css';

function greeting(name) {
  const h = new Date().getHours();
  const time = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  return `Good ${time}, ${name}.`;
}

// ── Pillar card (stub for MCQs/Podcast, live for Flashcards) ─────────────────

function PillarCard({ icon, title, meta, cta, onCta, disabled }) {
  return (
    <div className={`pillar-card${disabled ? ' pillar-card--disabled' : ''}`}>
      <div className="pillar-card-header">
        <span className="pillar-card-icon">{icon}</span>
        <span className="pillar-card-title outfit">{title}</span>
      </div>
      <p className="pillar-card-meta mono">{meta}</p>
      <button
        className="pillar-card-cta outfit"
        onClick={onCta}
        disabled={disabled}
      >
        {cta}
      </button>
    </div>
  );
}

// ── Activity feed item ────────────────────────────────────────────────────────

function ActivityItem({ pillar, topic, detail, when }) {
  return (
    <div className="activity-item">
      <span className="activity-pillar mono">{pillar}</span>
      <span className="activity-dot mono">·</span>
      <span className="activity-topic outfit">{topic}</span>
      {detail && <><span className="activity-dot mono">·</span><span className="activity-detail mono">{detail}</span></>}
      <span className="activity-when mono">{when}</span>
    </div>
  );
}

// ── CrossPillarHome ───────────────────────────────────────────────────────────

const CrossPillarHome = ({ onGoFlashcards, onGoMCQs, onGoPodcast }) => {
  const { activeUser, apiFetch } = useUser();
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    apiFetch('/api/stats')
      .then(r => r.json())
      .then(data => setStats(data))
      .catch(() => {});

    // Recent reviews → activity feed
    apiFetch('/api/analytics')
      .then(r => r.json())
      .then(data => {
        // Use heatmap data to synthesise a simple activity list
        // Real cross-pillar feed will come in Phase 4
        const days = (data.heatmap || [])
          .filter(d => d.count > 0)
          .slice(-5)
          .reverse();
        setRecentActivity(days.map(d => ({
          pillar: 'Flashcards',
          topic: 'Study session',
          detail: `${d.count} card${d.count !== 1 ? 's' : ''}`,
          when: d.date,
        })));
      })
      .catch(() => {});
  }, []);

  const flashcardsMeta = stats
    ? `${stats.today} cards today · ${stats.streak} day streak`
    : 'Loading…';

  return (
    <div className="cph-wrapper">
      <div className="cph-container">

        <div className="cph-greeting playfair">{greeting(activeUser?.name ?? '')}</div>

        {stats?.today > 0 && (
          <button className="cph-primary-cta outfit" onClick={onGoFlashcards}>
            Continue studying →
          </button>
        )}

        <section className="cph-section">
          <h2 className="cph-section-title playfair">Your pillars</h2>
          <div className="pillar-cards">
            <PillarCard
              icon="▦"
              title="Flashcards"
              meta={flashcardsMeta}
              cta="Study cards"
              onCta={onGoFlashcards}
            />
            <PillarCard
              icon="✦"
              title="MCQs"
              meta="390 questions · 13 subjects"
              cta="Start a quiz"
              onCta={onGoMCQs}
            />
            <PillarCard
              icon="◎"
              title="Podcast"
              meta="Coming soon"
              cta="Latest episode"
              onCta={onGoPodcast}
              disabled
            />
          </div>
        </section>

        {recentActivity.length > 0 && (
          <section className="cph-section">
            <h2 className="cph-section-title playfair">Recent activity</h2>
            <div className="activity-feed">
              {recentActivity.map((item, i) => (
                <ActivityItem key={i} {...item} />
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
};

export default CrossPillarHome;
