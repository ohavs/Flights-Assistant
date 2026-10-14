import { createContext, useContext, useState, useEffect } from 'react';
import { setStatusBarTheme } from './lib/platform';

const ThemeContext = createContext({
  isDark: false,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
  // The saved choice wins; before anyone chose, follow the device setting.
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    setStatusBarTheme(isDark);
  }, [isDark]);

  return (
    <ThemeContext.Provider value={{
      isDark,
      toggleTheme: () => setIsDark(d => !d),
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
