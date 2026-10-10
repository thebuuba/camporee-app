'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { resolveTheme, themeStorageKey, type ThemePreference } from '@/lib/theme';

const ThemeContext = createContext({
  preference: 'system' as ThemePreference,
  dark: false,
  setPreference: (_preference: ThemePreference) => {},
});

export function useTheme() { return useContext(ThemeContext); }

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    let current: ThemePreference = 'system';
    const read = () => {
      try {
        const saved = localStorage.getItem(themeStorageKey);
        current = saved === 'dark' || saved === 'light' ? saved : 'system';
      } catch {}
      setPreferenceState(current);
      apply(current);
    };
    const apply = (value: ThemePreference) => {
      const theme = resolveTheme(value, media.matches);
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', theme === 'dark' ? '#171412' : '#fdf8f5'));
      setDark(theme === 'dark');
    };
    const onSystemChange = () => apply(current);
    const onStorage = (event: StorageEvent) => { if (event.key === themeStorageKey || event.key === null) read(); };
    const onPreference = (event: Event) => {
      current = (event as CustomEvent<ThemePreference>).detail;
      setPreferenceState(current);
      apply(current);
    };
    read();
    media.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onStorage);
    window.addEventListener('camporee-theme-change', onPreference);
    return () => {
      media.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('camporee-theme-change', onPreference);
    };
  }, []);

  function setPreference(value: ThemePreference) {
    try { localStorage.setItem(themeStorageKey, value); } catch {}
    window.dispatchEvent(new CustomEvent('camporee-theme-change', { detail: value }));
  }

  return <ThemeContext.Provider value={{ preference, dark, setPreference }}>{children}</ThemeContext.Provider>;
}
