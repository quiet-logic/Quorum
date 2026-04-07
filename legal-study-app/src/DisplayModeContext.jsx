/**
 * DisplayModeContext — manages the 7 display modes.
 *
 * Mode is stored in localStorage under 'quorum-display-mode' and applied
 * as data-mode on <html>. The no-flash init script in index.html reads
 * the same key before React boots, so there is no FOUC.
 */

import { createContext, useContext, useState, useEffect } from 'react';

export const MODES = [
  { id: 'system',  label: 'System default',    hint: 'Follows your OS light/dark preference' },
  { id: 'light',   label: 'Light',              hint: 'Standard light mode' },
  { id: 'dark',    label: 'Dark',               hint: 'Warm dark mode — easy on the eyes' },
  { id: 'focus',   label: 'High focus',         hint: 'Optimised for sustained attention and low distraction' },
  { id: 'reading', label: 'Reading comfort',    hint: 'Optimised for reading ease — wider spacing, warmer background' },
  { id: 'calm',    label: 'Calm',               hint: 'Softer colours, no unexpected animations' },
  { id: 'visual',  label: 'Visual',             hint: 'Emphasises visual and spatial cues over numbers' },
];

const STORAGE_KEY = 'quorum-display-mode';
const VALID_IDS = MODES.map(m => m.id);

const DisplayModeContext = createContext(null);

export function DisplayModeProvider({ children }) {
  const [mode, setModeState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return VALID_IDS.includes(stored) ? stored : 'system';
  });

  const setMode = (id) => {
    if (!VALID_IDS.includes(id)) return;
    localStorage.setItem(STORAGE_KEY, id);
    document.documentElement.setAttribute('data-mode', id);
    setModeState(id);
  };

  // Sync DOM attribute on mount (covers the case where the no-flash script
  // runs before React but we need React state to agree)
  useEffect(() => {
    document.documentElement.setAttribute('data-mode', mode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DisplayModeContext.Provider value={{ mode, setMode, modes: MODES }}>
      {children}
    </DisplayModeContext.Provider>
  );
}

export const useDisplayMode = () => useContext(DisplayModeContext);
