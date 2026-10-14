import { createContext, useContext, useState, useEffect } from 'react';

// Selectable accent palettes. `swatch` is the light-mode accent (for the
// picker dot); the actual colours live in index.css keyed by `data-accent`.
// `indigo` is the default and needs no override block in CSS.
export const PALETTES = [
  { key: 'indigo',  label: 'אינדיגו', swatch: '#4f46e5' },
  { key: 'violet',  label: 'סגול',    swatch: '#7c3aed' },
  { key: 'sky',     label: 'כחול',    swatch: '#2563eb' },
  { key: 'teal',    label: 'טורקיז',  swatch: '#0d9488' },
  { key: 'emerald', label: 'ירוק',    swatch: '#059669' },
  { key: 'amber',   label: 'כתום',    swatch: '#ea580c' },
  { key: 'rose',    label: 'ורוד',    swatch: '#e11d48' },
];

const ThemeContext = createContext({
  isDark: false,
  toggleTheme: () => {},
  accent: 'indigo',
  setAccent: () => {},
});

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [accent, setAccent] = useState(() => localStorage.getItem('accent') || 'indigo');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
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
