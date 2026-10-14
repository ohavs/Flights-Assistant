import { createContext, useContext, useState, useEffect } from 'react';
import { setStatusBarTheme } from './lib/platform';

// Selectable accent palettes. `swatch` is the light-mode accent (for the
// picker dot); the actual colours live in index.css keyed by `data-accent`.
// `green` (the Payments-2026 brand) is the default and needs no override
// block in CSS.
export const PALETTES = [
  { key: 'green',   label: 'ירוק',    swatch: '#22A45D' },
  { key: 'indigo',  label: 'אינדיגו', swatch: '#4f46e5' },
  { key: 'violet',  label: 'סגול',    swatch: '#7c3aed' },
  { key: 'sky',     label: 'כחול',    swatch: '#2563eb' },
  { key: 'teal',    label: 'טורקיז',  swatch: '#0f766e' },
  { key: 'emerald', label: 'אזמרגד',  swatch: '#047857' },
  { key: 'amber',   label: 'כתום',    swatch: '#c2410c' },
  { key: 'rose',    label: 'ורוד',    swatch: '#e11d48' },
];

const ThemeContext = createContext({
  isDark: false,
  toggleTheme: () => {},
  accent: 'green',
  setAccent: () => {},
});

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');
  // Indigo was the old default and was always saved, so a saved 'indigo'
  // from before the redesign means "never chose": move it to the new
  // default once. Anything picked after that is kept as is.
  const [accent, setAccent] = useState(() => {
    const saved = localStorage.getItem('accent');
    if (!localStorage.getItem('accent-v2')) {
      localStorage.setItem('accent-v2', '1');
      if (!saved || saved === 'indigo') return 'green';
    }
    return saved || 'green';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    setStatusBarTheme(isDark);
  }, [isDark]);

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent);
    localStorage.setItem('accent', accent);
  }, [accent]);

  return (
    <ThemeContext.Provider value={{
      isDark,
      toggleTheme: () => setIsDark(d => !d),
      accent,
      setAccent,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
