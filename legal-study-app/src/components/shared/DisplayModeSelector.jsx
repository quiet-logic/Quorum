import { useState } from 'react';
import { useDisplayMode, MODES } from '../../DisplayModeContext';
import './DisplayModeSelector.css';

const DisplayModeSelector = () => {
  const { mode, setMode } = useDisplayMode();
  const [open, setOpen] = useState(false);

  const current = MODES.find(m => m.id === mode) ?? MODES[0];

  return (
    <>
      {/* Floating trigger */}
      <button
        className="dms-trigger mono"
        onClick={() => setOpen(o => !o)}
        title="Display settings"
        aria-label="Display settings"
        aria-expanded={open}
      >
        ◑
      </button>

      {/* Backdrop */}
      {open && <div className="dms-backdrop" onClick={() => setOpen(false)} />}

      {/* Panel */}
      {open && (
        <div className="dms-panel" role="dialog" aria-label="Display mode">
          <div className="dms-header">
            <span className="dms-title mono">Display</span>
            <button className="dms-close mono" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>

          <div className="dms-modes">
            {MODES.map(m => (
              <button
                key={m.id}
                className={`dms-mode-btn${mode === m.id ? ' is-active' : ''}`}
                onClick={() => { setMode(m.id); setOpen(false); }}
              >
                <span className="dms-mode-label outfit">{m.label}</span>
                <span className="dms-mode-hint mono">{m.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default DisplayModeSelector;
