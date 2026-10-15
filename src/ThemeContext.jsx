import { createContext, useContext, useState, useEffect, useLayoutEffect } from 'react';
import { setStatusBarTheme } from './lib/platform';
import { PALETTES, MODES } from './lib/theme';

/* Light, dark or the phone's own setting, and one of four full palettes
   (index.css, [data-palette]): background, surfaces, accent and buttons
   all change together. Both kept on the device. The header switch flips
   light/dark and so leaves "the phone's setting" for an explicit one.  */

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');

const ThemeContext = createContext({
  isDark: false,
  mode: 'system',
  palette: 'green',
  setMode: () => {},
  setPalette: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
  // 'theme' held light/dark before "system" existed; an old app version
  // reading "system" falls back to the phone's setting too.
  const [mode, setMode] = useState(() => (MODES.includes(read('theme')) ? read('theme') : 'system'));
  const [palette, setPalette] = useState(() => (PALETTES.some(p => p.key === read('palette')) ? read('palette') : 'green'));
  const [systemDark, setSystemDark] = useState(() => darkQuery()?.matches ?? false);

  useEffect(() => {
    const mq = darkQuery();
    if (!mq?.addEventListener) return undefined;
    const on = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const isDark = mode === 'system' ? systemDark : mode === 'dark';

  // Before paint, so a reload never flashes the other theme.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    root.setAttribute('data-palette', palette);
  }, [isDark, palette]);

  useEffect(() => { write('theme', mode); }, [mode]);
  useEffect(() => { write('palette', palette); }, [palette]);
  useEffect(() => { setStatusBarTheme(isDark); }, [isDark]);

  return (
    <ThemeContext.Provider value={{
      isDark, mode, palette, setMode, setPalette,
      toggleTheme: () => setMode(isDark ? 'light' : 'dark'),
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
